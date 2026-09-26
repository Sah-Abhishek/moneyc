package com.sahabhishek.moneycontrol.ui.entry

import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sahabhishek.moneycontrol.Nav
import com.sahabhishek.moneycontrol.R
import com.sahabhishek.moneycontrol.data.api.Account
import com.sahabhishek.moneycontrol.data.api.Tag
import com.sahabhishek.moneycontrol.ui.ledger.LedgerQuery
import com.sahabhishek.moneycontrol.ui.shell.Page
import com.sahabhishek.moneycontrol.ui.shell.Section
import com.sahabhishek.moneycontrol.ui.shell.ShellState
import com.sahabhishek.moneycontrol.ui.theme.Ledger
import com.sahabhishek.moneycontrol.ui.theme.mono
import com.sahabhishek.moneycontrol.ui.theme.serif
import com.sahabhishek.moneycontrol.ui.web.Btn
import com.sahabhishek.moneycontrol.ui.web.BtnStyle
import com.sahabhishek.moneycontrol.ui.web.ConfirmButton
import com.sahabhishek.moneycontrol.ui.web.EmptyState
import com.sahabhishek.moneycontrol.ui.web.ErrorPage
import com.sahabhishek.moneycontrol.ui.web.Eyebrow
import com.sahabhishek.moneycontrol.ui.web.FieldError
import com.sahabhishek.moneycontrol.ui.web.FormError
import com.sahabhishek.moneycontrol.ui.web.FormRow
import com.sahabhishek.moneycontrol.ui.web.Gutter
import com.sahabhishek.moneycontrol.ui.web.Hint
import com.sahabhishek.moneycontrol.ui.web.LoadingPage
import com.sahabhishek.moneycontrol.ui.web.Option
import com.sahabhishek.moneycontrol.ui.web.PageLede
import com.sahabhishek.moneycontrol.ui.web.Rule
import com.sahabhishek.moneycontrol.ui.web.SectionHead
import com.sahabhishek.moneycontrol.ui.web.Segmented
import com.sahabhishek.moneycontrol.ui.web.Stamp
import com.sahabhishek.moneycontrol.ui.web.WebInput
import com.sahabhishek.moneycontrol.ui.web.WebSelect
import com.sahabhishek.moneycontrol.util.clock
import com.sahabhishek.moneycontrol.util.dayMonthYear
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

private val MAIN_CHANNELS = listOf("UPI", "Card", "Cash", "Cheque")
private val OTHER_CHANNELS = listOf("NEFT", "IMPS", "RTGS", "ATM", "Bank")

/** app/(book)/new/page.tsx and app/(book)/entries/[id]/page.tsx. */
@Composable
fun EntryScreen(shell: ShellState, nav: Nav, vm: EntryViewModel, isNew: Boolean) {
  val state by vm.state.collectAsStateWithLifecycle()
  val done by vm.done.collectAsStateWithLifecycle()
  val currentYm = shell.me?.today?.take(7)
  LaunchedEffect(done) {
    // Back to the ledger at the line's month (the web's backHref).
    done?.let { ym -> nav.ledger(if (ym == currentYm) null else LedgerQuery(ym)) }
  }
  Page(shell, Section.Ledger, nav::section, nav::readMail, nav::reconnect) {
    val e = state.entry
    when {
      state.notFound -> Box(Modifier.padding(horizontal = Gutter)) {
        EmptyState("That line no longer exists.", body = "It may have been deleted in another tab or on another device.", action = { Btn("Back to the ledger", { nav.section(Section.Ledger) }) })
      }
      state.loadError != null -> ErrorPage(state.loadError!!, vm::load) { nav.section(Section.Ledger) }
      state.loading -> LoadingPage()
      else -> Column(Modifier.fillMaxWidth().padding(start = Gutter, end = Gutter, bottom = 64.dp)) {
        if (isNew || e == null) SectionHead("A new line", small = "Written by hand")
        else SectionHead(
          e.title,
          small = "${dayMonthYear(e.occurredAt)} · ${clock(e.occurredAt)} · ${if (e.source == "wire") (if (e.auto) "filed automatically" else "from the wire") else "written by hand"}",
        )
        EntryForm(state, vm, nav, isNew)
        if (e != null && e.personId == null) SlateLinker(e.amount, state.people, state.slatePending, state.slateError, vm::putOnSlate) { nav.section(Section.Slate) }
      }
    }
  }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EntryForm(state: EntryState, vm: EntryViewModel, nav: Nav, isNew: Boolean) {
  val c = Ledger.colors
  val f = state.form
  val e = state.entry
  val err = state.fieldErrors
  val amountFocus = remember { FocusRequester() }
  LaunchedEffect(Unit) { if (isNew) amountFocus.requestFocus() }

  Column(Modifier.widthIn(max = 640.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
    // The amount block
    Column(Modifier.fillMaxWidth()) {
      Rule(thickness = 3.dp)
      Column(
        Modifier.fillMaxWidth().background(c.paperSunk).padding(start = 16.dp, end = 16.dp, top = 22.dp, bottom = 18.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
      ) {
        Eyebrow("Amount", color = c.inkFaint)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Bottom) {
          Text("₹", Modifier.alignByBaseline(), style = mono(28.sp), color = c.inkMuted)
          BasicTextField(
            f.amount,
            { v -> if (v.length <= 20) vm.edit { it.copy(amount = v) } },
            Modifier.weight(1f).alignByBaseline().focusRequester(amountFocus).semantics { contentDescription = "Amount" },
            textStyle = serif(56.sp, -0.02).copy(color = c.inkBase, textAlign = TextAlign.Center),
            singleLine = true,
            cursorBrush = SolidColor(c.spend),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            decorationBox = { inner ->
              Box(contentAlignment = Alignment.Center) {
                if (f.amount.isEmpty()) Text("0", style = serif(56.sp, -0.02), color = c.inkBase.copy(alpha = 0.25f), textAlign = TextAlign.Center)
                inner()
              }
            },
          )
        }
        FieldError(err["amount"])
      }
      Rule()
    }

    Column {
      FormRow("Money") {
        Segmented(listOf("out" to "Went out", "in" to "Came in"), f.direction, { d -> vm.edit { it.copy(direction = d) } })
      }
      FormRow(if (f.direction == "in") "From" else "Paid to") {
        WebInput(
          f.payee,
          { v -> vm.edit { it.copy(payee = v) } },
          placeholder = if (f.direction == "in") "Optional · who paid you" else "Optional · who you paid, e.g. Madan Stores",
          invalid = err["payee"] != null,
          maxLength = 120,
        )
        FieldError(err["payee"])
      }
      FormRow("What for") {
        WebInput(
          f.item,
          { v -> vm.edit { it.copy(item = v) } },
          placeholder = if (f.direction == "in") "Optional · e.g. salary, refund" else "What you bought · e.g. biscuits",
          invalid = err["item"] != null,
          maxLength = 120,
        )
        FieldError(err["item"])
      }
      FormRow("When") {
        DateTimeField(f.occurredAt, err["occurredAt"] != null) { v -> vm.edit { it.copy(occurredAt = v) } }
        FieldError(err["occurredAt"])
      }
      FormRow("How") {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp), itemVerticalAlignment = Alignment.CenterVertically) {
          Segmented(MAIN_CHANNELS.map { it to it }, f.channel.takeIf { it in MAIN_CHANNELS }, { ch -> vm.edit { it.copy(channel = ch) } })
          WebSelect(
            listOf(Option("", "Other…")) + OTHER_CHANNELS.map { Option(it, it) },
            f.channel.takeUnless { it in MAIN_CHANNELS } ?: "",
            { ch -> if (ch.isNotEmpty()) vm.edit { it.copy(channel = ch) } },
            monoFace = true,
            fill = false,
          )
        }
      }
      if (f.channel == "Cheque") {
        FormRow("Cheque no.") {
          if (e?.source == "wire") {
            Text(e.ref ?: "Not in the mail", style = mono(11.sp), color = c.inkMuted)
          } else {
            WebInput(
              f.chequeNo,
              { v -> vm.edit { it.copy(chequeNo = v) } },
              placeholder = "Optional · e.g. 000123",
              monoFace = true,
              invalid = err["chequeNo"] != null,
              keyboardType = KeyboardType.Number,
              maxLength = 12,
            )
          }
          Hint("When the bank mails that the cheque has cleared, it's matched to this line instead of being counted again.")
          FieldError(err["chequeNo"])
        }
      }
      if (f.cashOut) {
        FormRow("This cash") {
          Segmented(listOf("wallet" to "Log each spend", "spent" to "Count as spent"), f.cash, { v -> vm.edit { it.copy(cash = v) } })
          Hint(
            when (f.cash) {
              "wallet" -> "The withdrawal only moves money to your wallet: it isn't counted as spending, and the cash lines you write down are."
              "spent" -> "The whole amount counts as spent today. Don't also write down what you buy with it, or it's counted twice."
              else -> "Writing down each cash spend? Then the withdrawal itself isn't spending."
            },
          )
          FieldError(err["cash"])
        }
      }
      if (e?.personId != null) {
        FormRow("On the slate") {
          FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp), itemVerticalAlignment = Alignment.CenterVertically) {
            Stamp(e.personName.orEmpty(), "ink", onClick = { nav.slate(e.personId) })
            Btn("Take off the slate", vm::takeOffSlate)
          }
        }
      } else if (!f.toWallet) {
        FormRow("Tag") {
          WebSelect(tagOptions(state.tags), f.tagId, { t -> vm.edit { it.copy(tagId = t) } })
          FieldError(err["tagId"])
        }
      }
      FormRow("Note") {
        WebInput(f.note, { v -> vm.edit { it.copy(note = v) } }, placeholder = "Optional", maxLength = 280)
        FieldError(err["note"])
      }
      if (e?.source == "wire") {
        FormRow("From the wire") {
          Text(
            listOfNotNull(e.account, e.ref?.let { "Ref $it" }).joinToString(" · ").ifEmpty { "Filed from your bank mail" },
            style = mono(11.sp),
            color = c.inkMuted,
          )
        }
      }
    }

    FormError(state.error?.takeIf { state.fieldErrors.isEmpty() })

    FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp), itemVerticalAlignment = Alignment.CenterVertically) {
      Btn(
        if (state.pending) "Saving…" else if (e != null) "Save changes" else "Add to the ledger →",
        vm::save,
        Modifier.fillMaxWidth(),
        style = BtnStyle.Ink,
        enabled = !state.pending && !state.deleting,
        padding = PaddingValues(horizontal = 22.dp, vertical = 14.dp),
      )
      Btn("Cancel", nav::back)
      if (e != null) ConfirmButton("Delete line", "Delete this line?", vm::delete, confirmLabel = "Delete", pending = state.deleting)
    }
  }
}

private fun tagOptions(tags: List<Tag>): List<Option<Long?>> =
  listOf(Option<Long?>(null, "No tag")) +
    tags.filter { it.kind == "spend" }.map { Option<Long?>(it.id, it.name, "Spending") } +
    tags.filter { it.kind == "income" }.map { Option<Long?>(it.id, it.name, "Income") }

private val SHOWN = DateTimeFormatter.ofPattern("MM/dd/yyyy, hh:mm a", Locale.US)

/** <input type="datetime-local">: shows "09/25/2026, 03:57 PM"; tapping opens the date, then the time. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DateTimeField(value: String, invalid: Boolean, onChange: (String) -> Unit) {
  val c = Ledger.colors
  val current = runCatching { LocalDateTime.parse(value.take(16)) }.getOrNull() ?: LocalDateTime.now().withSecond(0).withNano(0)
  var step by rememberSaveable { mutableStateOf(0) } // 0 closed, 1 date, 2 time
  var pickedDay by rememberSaveable { mutableStateOf(current.toLocalDate().toString()) }

  Row(
    Modifier.fillMaxWidth().heightIn(min = 36.dp).background(c.paperRaised).border(1.dp, if (invalid) c.spend else c.ruleHair)
      .clickable(role = Role.Button) { pickedDay = current.toLocalDate().toString(); step = 1 }.padding(horizontal = 10.dp, vertical = 7.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Text(current.format(SHOWN), Modifier.weight(1f), style = mono(13.sp), color = c.inkBase)
    Image(painterResource(R.drawable.ic_calendar), null, Modifier.size(14.dp))
  }

  if (step == 1) {
    val date = rememberDatePickerState(initialSelectedDateMillis = current.toLocalDate().atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli())
    DatePickerDialog(
      onDismissRequest = { step = 0 },
      confirmButton = {
        TextButton({
          date.selectedDateMillis?.let { pickedDay = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString() }
          step = 2
        }) { Text("NEXT", style = mono(10.sp, FontWeight.SemiBold, 0.12), color = c.inkBase) }
      },
      dismissButton = { TextButton({ step = 0 }) { Text("CANCEL", style = mono(10.sp, FontWeight.Medium, 0.12), color = c.inkMuted) } },
    ) { DatePicker(date) }
  }
  if (step == 2) {
    val time = rememberTimePickerState(current.hour, current.minute, is24Hour = false)
    AlertDialog(
      onDismissRequest = { step = 0 },
      confirmButton = {
        TextButton({
          val day = LocalDate.parse(pickedDay)
          onChange(LocalDateTime.of(day.year, day.month, day.dayOfMonth, time.hour, time.minute).toString().take(16))
          step = 0
        }) { Text("SET", style = mono(10.sp, FontWeight.SemiBold, 0.12), color = c.inkBase) }
      },
      dismissButton = { TextButton({ step = 0 }) { Text("CANCEL", style = mono(10.sp, FontWeight.Medium, 0.12), color = c.inkMuted) } },
      text = { TimePicker(time) },
    )
  }
}

/** <input type="date">, optional: shows "10/05/2026" or the placeholder; tapping opens the calendar, from `minDay` on. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DateField(value: String, invalid: Boolean, minDay: String, placeholder: String, onChange: (String) -> Unit) {
  val c = Ledger.colors
  val current = runCatching { LocalDate.parse(value) }.getOrNull()
  val min = runCatching { LocalDate.parse(minDay) }.getOrNull()
  var picking by rememberSaveable { mutableStateOf(false) }
  Row(
    Modifier.fillMaxWidth().heightIn(min = 36.dp).background(c.paperRaised).border(1.dp, if (invalid) c.spend else c.ruleHair)
      .clickable(role = Role.Button) { picking = true }.padding(horizontal = 10.dp, vertical = 7.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Text(current?.format(DAY_SHOWN) ?: placeholder, Modifier.weight(1f), style = mono(13.sp), color = if (current != null) c.inkBase else c.inkFaint)
    if (current != null) Text("CLEAR", Modifier.clickable(role = Role.Button) { onChange("") }.padding(end = 10.dp), style = mono(9.sp, FontWeight.Medium, 0.12), color = c.inkFaint)
    Image(painterResource(R.drawable.ic_calendar), null, Modifier.size(14.dp))
  }
  if (picking) {
    val start = (current ?: min ?: LocalDate.now()).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli()
    val floor = min?.atStartOfDay()?.toInstant(ZoneOffset.UTC)?.toEpochMilli()
    val date = rememberDatePickerState(
      initialSelectedDateMillis = start,
      selectableDates = object : SelectableDates {
        override fun isSelectableDate(utcTimeMillis: Long) = floor == null || utcTimeMillis >= floor
      },
    )
    DatePickerDialog(
      onDismissRequest = { picking = false },
      confirmButton = {
        TextButton({
          date.selectedDateMillis?.let { onChange(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString()) }
          picking = false
        }) { Text("SET", style = mono(10.sp, FontWeight.SemiBold, 0.12), color = c.inkBase) }
      },
      dismissButton = { TextButton({ picking = false }) { Text("CANCEL", style = mono(10.sp, FontWeight.Medium, 0.12), color = c.inkMuted) } },
    ) { DatePicker(date) }
  }
}

private val DAY_SHOWN = DateTimeFormatter.ofPattern("MM/dd/yyyy", Locale.US)

/** SlateLinker.tsx — moves a ledger line onto someone's slate. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SlateLinker(amount: Long, people: List<Account>, pending: Boolean, error: String?, onPut: (Long) -> Unit, onOpenSlate: () -> Unit) {
  var person by rememberSaveable { mutableStateOf<Long?>(null) }
  Column(Modifier.padding(top = 40.dp).widthIn(max = 640.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
    Rule()
    Eyebrow("Was this money lent or borrowed?")
    PageLede(
      if (amount < 0) "If you paid this for someone who'll pay you back, put it on their slate. It stops counting as your spending."
      else "If this was someone paying you back, put it on their slate. It stops counting as income.",
      Modifier.padding(bottom = 0.dp),
    )
    if (people.isEmpty()) {
      Box(Modifier.clickable(role = Role.Button, onClick = onOpenSlate)) {
        Hint("You don't have anyone on the slate yet. Open an account first.")
      }
    } else {
      FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp), itemVerticalAlignment = Alignment.CenterVertically) {
        WebSelect(listOf(Option<Long?>(null, "Choose a person…")) + people.map { Option<Long?>(it.id, it.name) }, person, { person = it }, fill = false)
        Btn(if (pending) "Moving…" else "Put on their slate", { person?.let(onPut) }, style = BtnStyle.Ink, enabled = person != null && !pending)
      }
    }
    FormError(error)
  }
}
