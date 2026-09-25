package com.sahabhishek.moneycontrol.ui.wire

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sahabhishek.moneycontrol.Nav
import com.sahabhishek.moneycontrol.R
import com.sahabhishek.moneycontrol.data.api.Connection
import com.sahabhishek.moneycontrol.data.api.WireData
import com.sahabhishek.moneycontrol.data.api.WireSlip
import com.sahabhishek.moneycontrol.ui.shell.Page
import com.sahabhishek.moneycontrol.ui.shell.Section
import com.sahabhishek.moneycontrol.ui.shell.ShellState
import com.sahabhishek.moneycontrol.ui.theme.Ledger
import com.sahabhishek.moneycontrol.ui.theme.mono
import com.sahabhishek.moneycontrol.ui.theme.sans
import com.sahabhishek.moneycontrol.ui.theme.serif
import com.sahabhishek.moneycontrol.ui.web.Btn
import com.sahabhishek.moneycontrol.ui.web.BtnStyle
import com.sahabhishek.moneycontrol.ui.web.Caption
import com.sahabhishek.moneycontrol.ui.web.ConfirmButton
import com.sahabhishek.moneycontrol.ui.web.ErrorPage
import com.sahabhishek.moneycontrol.ui.web.Eyebrow
import com.sahabhishek.moneycontrol.ui.web.Gutter
import com.sahabhishek.moneycontrol.ui.web.LoadingPage
import com.sahabhishek.moneycontrol.ui.web.PageLede
import com.sahabhishek.moneycontrol.ui.web.Rule
import com.sahabhishek.moneycontrol.ui.web.RuleHair
import com.sahabhishek.moneycontrol.ui.web.SectionHead
import com.sahabhishek.moneycontrol.ui.web.Toggle
import com.sahabhishek.moneycontrol.ui.web.mix
import com.sahabhishek.moneycontrol.util.clock12
import com.sahabhishek.moneycontrol.util.dayMonth
import com.sahabhishek.moneycontrol.util.monthShort
import com.sahabhishek.moneycontrol.util.rupeesExact

private val STATUS_LABEL = mapOf("filed" to "Filed", "ignored" to "Archived", "duplicate" to "Matched an existing line")

/** app/(book)/wire/page.tsx */
@Composable
fun WireScreen(shell: ShellState, nav: Nav, vm: WireViewModel) {
  val state by vm.state.collectAsStateWithLifecycle()
  Page(shell, Section.Wire, nav::section, nav::readMail, nav::reconnect) {
    val data = state.data
    when {
      state.error != null && data == null -> ErrorPage(state.error!!, vm::load) { nav.section(Section.Ledger) }
      data == null -> LoadingPage()
      else -> Column(Modifier.fillMaxWidth().padding(start = Gutter, end = Gutter, bottom = 64.dp)) {
        Column(Modifier.widthIn(max = 560.dp)) {
          Desk(shell, data, state, vm, nav)
        }
        PageLede(
          "Bank and wallet alerts from Gmail land here as slips. Check what was read, pick a tag, confirm. With auto-file on, mail that a rule or your history makes certain goes straight into the ledger — anything unclear, possibly duplicate, or on the slate always waits for you.",
          Modifier.padding(top = 28.dp),
        )
        Decided(data.decided, state.busy?.first, vm)
      }
    }
  }
}

/** Wire.tsx WireDesk (the full page, not the ledger's compact column). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Desk(shell: ShellState, data: WireData, state: WireState, vm: WireViewModel, nav: Nav) {
  val c = Ledger.colors
  val slips = data.waiting
  val month = monthShort(data.stats.ym).let { it[0] + it.substring(1).lowercase() }

  Column(Modifier.fillMaxWidth().padding(top = 26.dp, bottom = 18.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
      Text("The Wire", Modifier.alignByBaseline(), style = serif(31.sp, -0.01), color = c.inkBase)
      Text(if (slips.isNotEmpty()) "${slips.size} WAITING" else "ALL CLEAR", Modifier.alignByBaseline(), style = mono(10.sp, FontWeight.Medium, 0.11), color = c.spend)
    }
    FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalArrangement = Arrangement.spacedBy(10.dp), itemVerticalAlignment = Alignment.CenterVertically) {
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        Image(painterResource(R.drawable.ic_mail_faint), null, Modifier.size(13.dp))
        Text("Gmail · ${shell.me?.user?.email.orEmpty()}", style = mono(10.sp, spacing = 0.03), color = c.inkFaint, maxLines = 1, overflow = TextOverflow.Ellipsis)
      }
      Toggle("Auto-file", data.autoFile, vm::setAutoFile, enabled = !state.autoFilePending)
    }
  }
  Rule()

  when (data.connection) {
    Connection.Connected -> Unit
    else -> {
      val (title, body, cta) = when (data.connection) {
        Connection.NotConfigured -> Triple("Mail sync isn't set up on this server.", "Whoever runs this server needs to add the Google OAuth settings. You can still keep the book by hand.", null)
        Connection.NoGmailScope -> Triple("Money Control can't read your mail.", "When you signed in, mail access wasn't allowed. Allow read-only access to the alerts so the wire can work.", "Allow mail access")
        else -> Triple("Gmail isn't connected.", "Access was revoked or has expired, so no new bank mail is being read. Your book is safe.", "Reconnect Gmail")
      }
      Column(
        Modifier.padding(top = 16.dp).fillMaxWidth().background(c.pending.mix(0.08f)).border(1.dp, c.pending.mix(0.5f)).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
      ) {
        Text(title, style = sans(13.sp, FontWeight.SemiBold), color = c.inkBase)
        Text(body, style = sans(13.sp, lineHeight = 1.5), color = c.inkMuted)
        cta?.let { Btn(it, nav::reconnect, style = BtnStyle.Ink) }
      }
    }
  }

  if (data.connection == Connection.Connected) {
    Row(
      Modifier.fillMaxWidth().background(c.spendBright.mix(0.14f)).drawBorderExceptTop(c.spend.mix(0.35f)).padding(horizontal = 13.dp, vertical = 12.dp),
      horizontalArrangement = Arrangement.spacedBy(12.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Column(Modifier.weight(1f)) {
        Text("${data.stats.autoFiled} ${if (data.stats.autoFiled == 1) "entry" else "entries"} filed automatically", style = sans(13.sp, FontWeight.SemiBold), color = c.inkBase)
        Text(
          "Since 01 $month" + if (data.stats.banksSeen > 0) " · ${data.stats.banksSeen} bank${if (data.stats.banksSeen == 1) "" else "s"} & wallet${if (data.stats.banksSeen == 1) "" else "s"} seen" else "",
          Modifier.padding(top = 3.dp),
          style = mono(9.sp, spacing = 0.03),
          color = c.inkMuted,
        )
      }
      data.stats.accuracy?.let { acc ->
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
          Text("%.1f%%".format(acc * 100), style = serif(24.sp), color = c.spend)
          Text("ACCURATE", style = mono(8.sp, spacing = 0.12), color = c.spend)
        }
      }
    }
  }

  Column(Modifier.fillMaxWidth().padding(top = 16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
    slips.forEach { slip ->
      val err = state.slipErrors[slip.id]
      WireSlipCard(
        slip = slip,
        tags = state.tags,
        busy = state.busy?.takeIf { it.first == slip.id }?.second,
        error = err?.first,
        fieldErrors = err?.second.orEmpty(),
        onFile = { vm.file(slip.id, it) },
        onArchive = { vm.archive(slip.id) },
        onDelete = { vm.delete(slip.id) },
        onSameAs = { vm.sameAs(slip.id, it) },
      )
    }
    if (slips.isEmpty() && data.connection == Connection.Connected) {
      Text(
        "Nothing on the desk. New bank alerts land here first, and confident ones go straight into the ledger.",
        Modifier.padding(vertical = 18.dp),
        style = serif(20.sp, lineHeight = 1.3),
        color = c.inkMuted,
      )
    }
  }

  // Standing rules
  Column(Modifier.fillMaxWidth().padding(top = 26.dp), verticalArrangement = Arrangement.spacedBy(11.dp)) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
      Eyebrow("Standing rules")
      Caption(
        if (state.rules.isNotEmpty()) "${state.rules.size} active · edit" else "Add a rule",
        Modifier.clickable(role = Role.Button) { nav.section(Section.Rules) },
      )
    }
    RuleHair()
    if (state.rules.isEmpty()) {
      Text("No rules yet. Rules tag mail by payee, file trusted senders automatically, or hold big amounts for you to check.", style = mono(10.sp, spacing = 0.02).copy(lineHeight = 15.sp), color = c.inkMuted)
    } else state.rules.forEach { r ->
      Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("If  ${describeCondition(r)}", style = mono(10.sp, spacing = 0.02).copy(lineHeight = 15.sp), color = c.inkMuted)
        Row(horizontalArrangement = Arrangement.spacedBy(7.dp), verticalAlignment = Alignment.CenterVertically) {
          Image(painterResource(R.drawable.ic_arrow_rule), null, Modifier.size(10.dp))
          Text(describeAction(r).uppercase(), style = mono(9.sp, FontWeight.Medium, 0.09), color = c.spend)
        }
      }
    }
  }
}

/** "Recently decided" — the last 30 mails, with Put back / Delete on archived ones. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Decided(decided: List<WireSlip>, busyId: Long?, vm: WireViewModel) {
  val c = Ledger.colors
  Column(Modifier.padding(top = 40.dp)) {
    SectionHead("Recently decided", small = "The last ${decided.size} mails")
    if (decided.isEmpty()) {
      PageLede("Mail you file, archive or match will be listed here.")
      return@Column
    }
    Rule()
    decided.forEach { d ->
      FlowRow(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        itemVerticalAlignment = Alignment.CenterVertically,
      ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
          Text(d.parsed.payee ?: d.subject ?: "Unreadable mail", style = sans(14.sp, FontWeight.SemiBold), color = c.inkBase, maxLines = 1, overflow = TextOverflow.Ellipsis)
          Text(
            "${d.bank} · ${dayMonth(d.receivedAt)} ${clock12(d.receivedAt)}" + (d.parsed.amountPaise?.let { " · ₹${rupeesExact(it)}" } ?: ""),
            style = mono(9.5.sp, spacing = 0.02),
            color = c.inkFaint,
          )
        }
        Text(
          STATUS_LABEL[d.status].orEmpty().uppercase(),
          style = mono(9.sp, spacing = 0.1),
          color = when (d.status) { "filed" -> c.credit; "ignored" -> c.inkFaint; else -> c.inkMuted },
        )
        if (d.status == "ignored") {
          Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Btn(if (busyId == d.id) "…" else "Put back", { vm.putBack(d.id) }, enabled = busyId == null)
            ConfirmButton("Delete", "Delete for good?", { vm.deleteDecided(d.id) }, confirmLabel = "Delete")
          }
        }
      }
      RuleHair()
    }
  }
}

/** border: 1px …; border-top: 0 */
private fun Modifier.drawBorderExceptTop(color: androidx.compose.ui.graphics.Color) = this.drawBehind {
  val w = 1.dp.toPx()
  drawRect(color, topLeft = androidx.compose.ui.geometry.Offset(0f, 0f), size = androidx.compose.ui.geometry.Size(w, size.height))
  drawRect(color, topLeft = androidx.compose.ui.geometry.Offset(size.width - w, 0f), size = androidx.compose.ui.geometry.Size(w, size.height))
  drawRect(color, topLeft = androidx.compose.ui.geometry.Offset(0f, size.height - w), size = androidx.compose.ui.geometry.Size(size.width, w))
}
