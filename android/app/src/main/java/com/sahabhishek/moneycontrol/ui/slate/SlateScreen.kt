package com.sahabhishek.moneycontrol.ui.slate

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sahabhishek.moneycontrol.Nav
import com.sahabhishek.moneycontrol.data.Messenger
import com.sahabhishek.moneycontrol.data.api.Account
import com.sahabhishek.moneycontrol.data.api.AccountDetail
import com.sahabhishek.moneycontrol.ui.entry.DateTimeField
import com.sahabhishek.moneycontrol.ui.ledger.dashedBorder
import com.sahabhishek.moneycontrol.ui.shell.Page
import com.sahabhishek.moneycontrol.ui.shell.Section
import com.sahabhishek.moneycontrol.ui.shell.ShellState
import com.sahabhishek.moneycontrol.ui.theme.Ledger
import com.sahabhishek.moneycontrol.ui.theme.mono
import com.sahabhishek.moneycontrol.ui.theme.sans
import com.sahabhishek.moneycontrol.ui.theme.serif
import com.sahabhishek.moneycontrol.ui.web.AutoBadge
import com.sahabhishek.moneycontrol.ui.web.Btn
import com.sahabhishek.moneycontrol.ui.web.BtnStyle
import com.sahabhishek.moneycontrol.ui.web.Caption
import com.sahabhishek.moneycontrol.ui.web.Chip
import com.sahabhishek.moneycontrol.ui.web.Chips
import com.sahabhishek.moneycontrol.ui.web.ConfirmButton
import com.sahabhishek.moneycontrol.ui.web.EmptyState
import com.sahabhishek.moneycontrol.ui.web.ErrorPage
import com.sahabhishek.moneycontrol.ui.web.Eyebrow
import com.sahabhishek.moneycontrol.ui.web.FieldError
import com.sahabhishek.moneycontrol.ui.web.FormError
import com.sahabhishek.moneycontrol.ui.web.Gutter
import com.sahabhishek.moneycontrol.ui.web.Hint
import com.sahabhishek.moneycontrol.ui.web.LabeledField
import com.sahabhishek.moneycontrol.ui.web.LoadingPage
import com.sahabhishek.moneycontrol.ui.web.Rule
import com.sahabhishek.moneycontrol.ui.web.RuleHair
import com.sahabhishek.moneycontrol.ui.web.SectionHead
import com.sahabhishek.moneycontrol.ui.web.Segmented
import com.sahabhishek.moneycontrol.ui.web.WebInput
import com.sahabhishek.moneycontrol.ui.web.mix
import com.sahabhishek.moneycontrol.ui.wire.WireSlipCard
import com.sahabhishek.moneycontrol.ui.wire.WireViewModel
import com.sahabhishek.moneycontrol.util.clock
import com.sahabhishek.moneycontrol.util.dayMonth
import com.sahabhishek.moneycontrol.util.dayMonthYear
import com.sahabhishek.moneycontrol.util.maskRef
import com.sahabhishek.moneycontrol.util.openWeb
import com.sahabhishek.moneycontrol.util.rupees
import kotlin.math.abs
import kotlinx.coroutines.launch

/** app/(book)/slate/page.tsx at the phone layout. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SlateScreen(shell: ShellState, nav: Nav, vm: SlateViewModel, wireVm: WireViewModel, messages: Messenger, personId: Long?) {
  val state by vm.state.collectAsStateWithLifecycle()
  val wireState by wireVm.state.collectAsStateWithLifecycle()
  val outbox by vm.outbox.collectAsStateWithLifecycle()
  val context = LocalContext.current
  val scroll = rememberScrollState()
  val scope = rememberCoroutineScope()
  var accountTop by remember { mutableIntStateOf(0) }
  var recordTop by remember { mutableIntStateOf(0) }
  val now = shell.me?.today

  LaunchedEffect(personId, now) { if (now != null) vm.show(personId, now) }
  LaunchedEffect(outbox) {
    outbox?.let { (name, r) ->
      vm.outboxHandled()
      if (r.phone != null) {
        messages.withUndo("Reminder for $name is ready.", "Open WhatsApp") { openWeb(context, whatsappUrl(r.phone, r.text)) }
      } else {
        (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("Reminder", r.text))
        messages.say("Reminder for $name copied — add a phone number to send it on WhatsApp.")
      }
    }
  }

  Page(shell, Section.Slate, nav::section, nav::readMail, nav::reconnect, scroll) {
    val data = state.data
    when {
      state.loadError != null && data == null -> ErrorPage(state.loadError!!, vm::load) { nav.section(Section.Ledger) }
      data == null || now == null -> LoadingPage()
      else -> {
        val everyone = data.accounts
        val active = everyone.filter { !it.archived }
        val shown = if (state.showArchived) everyone else active
        SlateOverview(data.stats, active.count { it.balance != 0L })

        Column(Modifier.fillMaxWidth().padding(start = Gutter, end = Gutter, bottom = 32.dp)) {
          SlatePages(
            accounts = shown, openId = state.openId, busy = state.busy,
            onOpen = { a -> vm.openAccount(a.id); scope.launch { scroll.animateScrollTo(accountTop) } },
            onRemind = vm::remind,
            onPayBack = { a -> vm.openAccount(a.id); scope.launch { scroll.animateScrollTo(recordTop) } },
          )
          if (everyone.isEmpty()) EmptyState(
            "The slate is clean.",
            body = "When you lend someone money or borrow some, open an account for them here. Payments to and from them that arrive on the wire will be offered against their account before they become ordinary spending.",
          )
          FlowRow(Modifier.fillMaxWidth().padding(top = 18.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            NewAccount(state, vm)
            if (everyone.any { it.archived }) Chip(if (state.showArchived) "Hide settled accounts" else "Show settled accounts", vm::toggleArchived)
          }
        }

        val detail = state.detail
        if (detail != null) {
          Box(Modifier.onGloballyPositioned { accountTop = it.positionInParent().y.toInt() }) {
            OpenAccount(
              detail = detail,
              others = active.filter { it.id != detail.account.id }.take(6),
              state = state, vm = vm,
              onOther = { a -> vm.openAccount(a.id) },
              onRecord = { scope.launch { scroll.animateScrollTo(recordTop) } },
              onEntry = nav::entry,
              recordAt = { recordTop = accountTop + it },
            )
          }
        }

        if (data.fromWire.isNotEmpty()) {
          Column(Modifier.fillMaxWidth().padding(start = Gutter, end = Gutter, bottom = 40.dp)) {
            Rule()
            SectionHead("From the wire", small = "Mail that looks like it moves money on the slate", controls = {
              Chip("${data.fromWire.size} to confirm", {}, current = true)
            })
            Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
              data.fromWire.forEach { slip ->
                val err = wireState.slipErrors[slip.id]
                WireSlipCard(
                  slip = slip, tags = wireState.tags,
                  busy = wireState.busy?.takeIf { it.first == slip.id }?.second,
                  error = err?.first, fieldErrors = err?.second.orEmpty(),
                  onFile = { wireVm.file(slip.id, it) }, onArchive = { wireVm.archive(slip.id) },
                  onDelete = { wireVm.delete(slip.id) }, onSameAs = { wireVm.sameAs(slip.id, it) },
                )
              }
            }
          }
        }
      }
    }
  }
}

private fun whatsappUrl(phone: String, text: String) =
  "https://wa.me/${phone.replace(Regex("[^\\d]"), "").trimStart('0')}?text=${Uri.encode(text)}"

/** NewAccountForm.tsx — a dashed trigger that opens into the form. */
@Composable
private fun NewAccount(state: SlateState, vm: SlateViewModel) {
  val c = Ledger.colors
  val f = state.newAccount
  val err = state.newStatus.fieldErrors
  if (!f.open) {
    Row(
      Modifier.fillMaxWidth().widthIn(max = 640.dp).background(c.paperSunk).dashedBorder()
        .clickable(role = Role.Button) { vm.editNew { it.copy(open = true) } }.padding(horizontal = 13.dp, vertical = 11.dp),
      horizontalArrangement = Arrangement.spacedBy(14.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Box(Modifier.size(24.dp).background(c.inkBase), contentAlignment = Alignment.Center) { Text("+", style = sans(16.sp), color = c.paperBase) }
      Text("Lend to someone, or record something you borrowed", style = sans(14.sp), color = c.inkMuted)
    }
    return
  }
  Column(Modifier.fillMaxWidth().background(c.paperSunk).dashedBorder().padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
    Segmented(listOf("gave" to "I lent", "got" to "I borrowed"), f.direction, { d -> vm.editNew { it.copy(direction = d) } })
    LabeledField(if (f.direction == "gave") "To whom" else "From whom") {
      WebInput(f.name, { v -> vm.editNew { it.copy(name = v) } }, placeholder = "Priya Nair", maxLength = 60, invalid = err["name"] != null)
      FieldError(err["name"])
    }
    LabeledField("Amount ₹") {
      WebInput(f.amount, { v -> vm.editNew { it.copy(amount = v) } }, placeholder = "Optional", monoFace = true, keyboardType = KeyboardType.Decimal, invalid = err["amount"] != null)
      FieldError(err["amount"])
    }
    LabeledField("What for") {
      WebInput(f.lineNote, { v -> vm.editNew { it.copy(lineNote = v) } }, placeholder = if (f.direction == "gave") "Concert tickets" else "Rent for September", maxLength = 140)
    }
    LabeledField("When") {
      DateTimeField(f.occurredAt, err["occurredAt"] != null) { v -> vm.editNew { it.copy(occurredAt = v) } }
      FieldError(err["occurredAt"])
    }
    LabeledField("Phone (optional, for reminders)") {
      WebInput(f.phone, { v -> vm.editNew { it.copy(phone = v) } }, placeholder = "+91 98765 43210", monoFace = true, keyboardType = KeyboardType.Phone, maxLength = 20, invalid = err["phone"] != null)
      FieldError(err["phone"])
    }
    FormError(state.newStatus.error?.takeIf { err.isEmpty() })
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      Btn(if (state.newStatus.pending) "Opening…" else "Open the account", vm::createAccount, style = BtnStyle.Ink, enabled = !state.newStatus.pending)
      Btn("Cancel", { vm.editNew { it.copy(open = false) } })
    }
  }
}

/** OpenAccount.tsx at the phone layout: the statement, the line form, then the person's card. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun OpenAccount(
  detail: AccountDetail, others: List<Account>, state: SlateState, vm: SlateViewModel,
  onOther: (Account) -> Unit, onRecord: () -> Unit, onEntry: (Long) -> Unit, recordAt: (Int) -> Unit,
) {
  val c = Ledger.colors
  val a = detail.account
  val lines = detail.lines
  val b = a.balance
  Column(Modifier.fillMaxWidth().padding(start = Gutter, end = Gutter, bottom = 40.dp)) {
    Rule()
    SectionHead("An open account", small = "Every rupee that moved between you", controls = {
      Chips {
        Chip(a.name, {}, current = true)
        others.forEach { o -> Chip(o.name, { onOther(o) }) }
      }
    })

    Column(verticalArrangement = Arrangement.spacedBy(32.dp)) {
      Column {
        if (lines.isEmpty()) {
          EmptyState("No lines yet.", body = "Record the first thing that moved between you and ${a.name} below.")
        } else {
          // Date | What happened | You gave ₹ | Balance ₹ (the web hides "They gave ₹" on phones)
          Row(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
            val head = mono(9.sp, FontWeight.Medium, 0.14)
            Text("DATE", Modifier.width(62.dp), style = head, color = c.inkFaint)
            Text("WHAT HAPPENED", Modifier.weight(1f), style = head, color = c.inkFaint)
            Text("YOU GAVE ₹", Modifier.width(76.dp), style = head, color = c.inkFaint, textAlign = TextAlign.End)
            Text("BALANCE ₹", Modifier.width(72.dp), style = head, color = c.inkFaint, textAlign = TextAlign.End)
          }
          Rule()
          lines.reversed().forEach { l ->
            Column {
              Row(Modifier.fillMaxWidth().padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.width(62.dp)) {
                  Text(dayMonth(l.occurredAt), style = mono(11.sp, FontWeight.Medium), color = c.inkBase)
                  Text(clock(l.occurredAt), style = mono(9.sp), color = c.inkFaint)
                }
                Column(Modifier.weight(1f).padding(end = 8.dp)) {
                  FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), itemVerticalAlignment = Alignment.CenterVertically) {
                    Text(
                      l.note,
                      if (l.entryId != null) Modifier.clickable(role = Role.Button) { onEntry(l.entryId) } else Modifier,
                      style = sans(15.sp, FontWeight.SemiBold),
                      color = c.inkBase,
                    )
                    if (l.fromWire) AutoBadge(auto = false)
                  }
                  Text(
                    if (l.fromWire) "Matched from the wire${l.ref?.let { " · RRN ${maskRef(it)}" } ?: ""}" else if (l.entryId != null) "From the ledger" else "Entered by hand",
                    style = mono(9.5.sp),
                    color = c.inkFaint,
                  )
                  if (l.entryId == null) ConfirmButton(
                    "Remove", "Remove this line?", { vm.deleteLine(l.id) }, confirmLabel = "Remove",
                    borderColor = androidx.compose.ui.graphics.Color.Transparent, contentColor = c.inkFaint,
                    padding = PaddingValues(top = 6.dp),
                  )
                }
                Text(if (l.amount > 0) rupees(l.amount) else "—", Modifier.width(76.dp), style = mono(15.sp, FontWeight.Medium), color = c.inkBase, textAlign = TextAlign.End)
                Text(if (l.balance < 0) "−${rupees(-l.balance)}" else rupees(l.balance), Modifier.width(72.dp), style = mono(11.sp), color = c.inkFaint, textAlign = TextAlign.End)
              }
              RuleHair()
            }
          }
        }
        Row(Modifier.fillMaxWidth().padding(top = 16.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
          Caption("${lines.size} ${if (lines.size == 1) "entry" else "entries"}" + (a.firstLineAt?.let { " · opened ${dayMonthYear(it)}" } ?: ""), Modifier.weight(1f))
          FootTotal(if (b == 0L) "All square" else if (b > 0) "Balance owed to you" else "Balance you owe", abs(b))
        }
        Box(Modifier.onGloballyPositioned { recordAt(it.positionInParent().y.toInt()) }) { LineFormView(a, state, vm) }
      }

      // The person's card
      Column(Modifier.fillMaxWidth().background(c.paperRaised).border(1.dp, c.inkBase).padding(bottom = 18.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Column {
          Row(Modifier.fillMaxWidth().padding(18.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
            val tone = c.indigo
            Box(Modifier.size(54.dp).background(tone.mix(0.12f)).border(1.dp, tone), contentAlignment = Alignment.Center) {
              Text(a.name.trim().take(1).uppercase(), style = serif(28.sp), color = tone)
            }
            Column {
              Text(a.name, style = serif(28.sp, lineHeight = 1.1), color = c.inkBase)
              Text(listOfNotNull(a.matchNames.firstOrNull(), a.phone).joinToString(" · ").ifEmpty { "No other names or phone yet" }, style = mono(9.5.sp), color = c.inkFaint)
            }
          }
          RuleHair()
        }
        Column {
          Column(Modifier.fillMaxWidth().padding(start = 18.dp, end = 18.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text((if (b == 0L) "All square" else if (b > 0) "They owe you" else "You owe them").uppercase(), style = mono(9.sp, FontWeight.Medium, 0.14), color = c.inkFaint)
            Row(verticalAlignment = Alignment.Bottom) {
              Text("₹", Modifier.alignByBaseline().padding(end = 3.dp), style = mono(13.sp), color = c.inkMuted)
              Text(rupees(abs(b)), Modifier.alignByBaseline(), style = serif(44.sp), color = c.inkBase)
            }
            if (a.ageDays != null && b != 0L) AgeBadge(a.ageDays)
          }
          RuleHair()
        }
        Column(Modifier.padding(horizontal = 18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
          Btn("Record a payment", onRecord, Modifier.fillMaxWidth(), style = BtnStyle.Ink)
          Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (b > 0) {
              val age = a.ageDays ?: 0
              Btn(if (state.busy == "remind-${a.id}") "…" else if (age > 90) "Chase" else if (age > 60) "Remind" else "Nudge", { vm.remind(a) }, Modifier.weight(1f))
            }
            if (b != 0L) ConfirmButton(
              "Settle up",
              if (b > 0) "${a.name} paid you ₹${rupees(b)} in full?" else "You paid ${a.name} ₹${rupees(-b)} in full?",
              { vm.settleUp(a) }, Modifier.weight(1f), confirmLabel = "Yes, settled",
            )
          }
        }
        Column(
          Modifier.padding(horizontal = 18.dp).fillMaxWidth().background(c.spendBright.mix(0.10f)).border(1.dp, c.spend.mix(0.35f)).padding(14.dp),
          verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
          Text("LINKED TO THE WIRE", style = mono(9.sp, FontWeight.Medium, 0.14), color = c.spend)
          Text(
            if (a.matchNames.isNotEmpty()) "Bank mail mentioning ${a.matchNames.take(2).joinToString(" or ")} or ${a.name} is offered against this account before it lands in the ledger."
            else "Bank mail naming ${a.name} is offered against this account. Add how the bank writes their name to catch more.",
            style = sans(13.sp, lineHeight = 1.5),
            color = c.inkMuted,
          )
          Caption("${lines.count { it.fromWire }} of ${lines.size} entries matched from the wire")
        }
        if (a.remindersSent > 0) Caption("${a.remindersSent} reminder${if (a.remindersSent == 1) "" else "s"} sent", Modifier.padding(horizontal = 18.dp))
        Box(Modifier.padding(horizontal = 18.dp)) { PersonEditor(a, state, vm) }
      }
    }
  }
}

/** SlateLineForm — money you gave, or money they gave you. */
@Composable
private fun LineFormView(a: Account, state: SlateState, vm: SlateViewModel) {
  val c = Ledger.colors
  val f = state.line
  val err = state.lineStatus.fieldErrors
  val first = a.name.split(" ").first()
  val b = a.balance
  Column(Modifier.padding(top = 20.dp).fillMaxWidth().background(c.paperSunk).dashedBorder().padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
    Segmented(listOf("gave" to "I gave $first", "got" to "$first gave me"), f.direction, { d -> vm.editLine { it.copy(direction = d) } })
    LabeledField("Amount ₹") {
      val suggested = b != 0L && ((f.direction == "got" && b > 0) || (f.direction == "gave" && b < 0))
      WebInput(f.amount, { v -> vm.editLine { it.copy(amount = v) } }, placeholder = if (suggested) rupees(abs(b)) else "0.00", monoFace = true, keyboardType = KeyboardType.Decimal, invalid = err["amount"] != null)
      FieldError(err["amount"])
    }
    LabeledField("What happened") {
      WebInput(f.note, { v -> vm.editLine { it.copy(note = v) } }, placeholder = if (f.direction == "gave") "Lent for the concert tickets" else "Paid back in cash", maxLength = 140, invalid = err["note"] != null)
      FieldError(err["note"])
    }
    LabeledField("When") {
      DateTimeField(f.occurredAt, err["occurredAt"] != null) { v -> vm.editLine { it.copy(occurredAt = v) } }
      FieldError(err["occurredAt"])
    }
    FormError(state.lineStatus.error?.takeIf { err.isEmpty() })
    Btn(if (state.lineStatus.pending) "Recording…" else "Record it", vm::recordLine, style = BtnStyle.Ink, enabled = !state.lineStatus.pending)
  }
}

/** PersonEditor — edit details; archive when settled; remove when empty. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PersonEditor(a: Account, state: SlateState, vm: SlateViewModel) {
  val p = state.person
  val err = state.personStatus.fieldErrors
  Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      Btn(if (p.open) "Close" else "Edit details", { vm.openPersonEditor(a) })
      if (a.balance == 0L && a.lineCount > 0) Btn(if (a.archived) "Restore account" else "Archive (settled)", { vm.archive(a) })
      if (a.lineCount == 0) ConfirmButton("Remove account", "Remove this empty account?", { vm.removeAccount(a) }, confirmLabel = "Remove")
    }
    if (p.open) {
      Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        LabeledField("Name") {
          WebInput(p.name, { v -> vm.editPerson { it.copy(name = v) } }, maxLength = 60, invalid = err["name"] != null)
          FieldError(err["name"])
        }
        LabeledField("How the bank writes their name") {
          WebInput(p.matchNames, { v -> vm.editPerson { it.copy(matchNames = v) } }, placeholder = "VINOD SI\nvinodsi@okaxis", monoFace = true, singleLine = false, minLines = 3, maxLength = 400)
          Hint("One per line — names or UPI IDs. Wire mail mentioning any of these is offered against this account.")
        }
        LabeledField("Phone (for WhatsApp reminders)") {
          WebInput(p.phone, { v -> vm.editPerson { it.copy(phone = v) } }, placeholder = "+91 98765 43210", monoFace = true, keyboardType = KeyboardType.Phone, maxLength = 20, invalid = err["phone"] != null)
          FieldError(err["phone"])
        }
        LabeledField("Note") { WebInput(p.note, { v -> vm.editPerson { it.copy(note = v) } }, maxLength = 280) }
        FormError(state.personStatus.error?.takeIf { err.isEmpty() })
        Btn(if (state.personStatus.pending) "Saving…" else "Save", vm::savePerson, style = BtnStyle.Ink, enabled = !state.personStatus.pending)
      }
    }
  }
}
