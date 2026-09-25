package com.sahabhishek.moneycontrol.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sahabhishek.moneycontrol.Nav
import com.sahabhishek.moneycontrol.data.api.Connection
import com.sahabhishek.moneycontrol.ui.shell.Page
import com.sahabhishek.moneycontrol.ui.shell.Section
import com.sahabhishek.moneycontrol.ui.shell.ShellState
import com.sahabhishek.moneycontrol.ui.theme.Ledger
import com.sahabhishek.moneycontrol.ui.theme.mono
import com.sahabhishek.moneycontrol.ui.theme.sans
import com.sahabhishek.moneycontrol.ui.theme.serif
import com.sahabhishek.moneycontrol.ui.web.Btn
import com.sahabhishek.moneycontrol.ui.web.BtnStyle
import com.sahabhishek.moneycontrol.ui.web.ConfirmButton
import com.sahabhishek.moneycontrol.ui.web.ErrorPage
import com.sahabhishek.moneycontrol.ui.web.Eyebrow
import com.sahabhishek.moneycontrol.ui.web.FieldError
import com.sahabhishek.moneycontrol.ui.web.FormError
import com.sahabhishek.moneycontrol.ui.web.FormRow
import com.sahabhishek.moneycontrol.ui.web.Gutter
import com.sahabhishek.moneycontrol.ui.web.Hint
import com.sahabhishek.moneycontrol.ui.web.LoadingPage
import com.sahabhishek.moneycontrol.ui.web.Option
import com.sahabhishek.moneycontrol.ui.web.Rule
import com.sahabhishek.moneycontrol.ui.web.RuleHair
import com.sahabhishek.moneycontrol.ui.web.SectionHead
import com.sahabhishek.moneycontrol.ui.web.Segmented
import com.sahabhishek.moneycontrol.ui.web.WebInput
import com.sahabhishek.moneycontrol.ui.web.WebSelect
import com.sahabhishek.moneycontrol.ui.web.mix
import com.sahabhishek.moneycontrol.util.ago
import java.time.ZoneId

/** Every IANA zone of the form Region/City, like Intl.supportedValuesOf("timeZone"). */
private val ZONES: List<String> by lazy {
  ZoneId.getAvailableZoneIds().filter { it.contains('/') && !it.startsWith("Etc/") && !it.startsWith("SystemV/") }.sorted()
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(shell: ShellState, nav: Nav, vm: SettingsViewModel) {
  val state by vm.state.collectAsStateWithLifecycle()
  val c = Ledger.colors
  Page(shell, Section.Settings, nav::section, nav::readMail, nav::reconnect) {
    val data = state.data
    when {
      state.loadError != null && data == null -> ErrorPage(state.loadError!!, vm::load) { nav.section(Section.Ledger) }
      data == null -> LoadingPage()
      else -> Column(Modifier.fillMaxWidth().padding(start = Gutter, end = Gutter, bottom = 64.dp)) {
        SectionHead("Settings", small = data.user.email)
        Column(Modifier.widthIn(max = 720.dp), verticalArrangement = Arrangement.spacedBy(44.dp)) {
          // The book
          Section("The book") {
            val zones = remember(state.timezone) { if (state.timezone in ZONES) ZONES else listOf(state.timezone) + ZONES }
            Column {
              FormRow("Monthly budget") {
                WebInput(state.budget, { v -> vm.edit { it.copy(budget = v) } }, placeholder = "No limit", monoFace = true, keyboardType = KeyboardType.Decimal, invalid = state.book.fieldErrors["monthlyBudget"] != null)
                FieldError(state.book.fieldErrors["monthlyBudget"])
              }
              FormRow("Timezone") {
                WebSelect(zones.map { Option(it, it.replace('_', ' ')) }, state.timezone, { z -> vm.edit { it.copy(timezone = z) } })
                Hint("Decides which day a payment falls on. Existing lines keep the time they were written with.")
                FieldError(state.book.fieldErrors["timezone"])
              }
              FormRow("Auto-file") {
                Row(
                  Modifier.toggleable(state.autoFile, role = Role.Checkbox) { on -> vm.edit { it.copy(autoFile = on) } },
                  horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                  Checkbox(state.autoFile)
                  Text("File mail automatically when a rule or my history makes it certain", style = sans(14.sp, lineHeight = 1.4), color = c.inkBase)
                }
                Hint("Duplicates, slate payments, incomplete mail and anything a rule says to ask about always wait for you.")
              }
            }
            Actions {
              FormError(state.book.error?.takeIf { state.book.fieldErrors.isEmpty() })
              Btn(if (state.book.pending) "Saving…" else "Save settings", vm::saveBook, style = BtnStyle.Ink, enabled = !state.book.pending)
            }
          }

          // The wire
          Section("The wire") {
            Column {
              Fact("Gmail", "${data.user.email} · " + when (data.connection) {
                Connection.Connected -> "connected, read-only"
                Connection.NotConfigured -> "sync not set up on this server"
                Connection.NoGmailScope -> "mail access not allowed"
                Connection.Reconnect -> "disconnected"
              })
              Fact("Last read", ago(data.sync.lastSuccessAt)?.lowercase() ?: "never")
              data.sync.lastError?.let { Fact("Last problem", it, error = true) }
            }
            Actions {
              when (data.connection) {
                Connection.Connected -> ConfirmButton("Disconnect Gmail", "Stop reading your mail? Your book stays.", vm::disconnect, confirmLabel = "Disconnect", pending = state.disconnecting)
                Connection.NotConfigured -> Unit
                else -> Btn(if (data.connection == Connection.NoGmailScope) "Allow mail access" else "Reconnect Gmail", nav::reconnect, style = BtnStyle.Ink)
              }
            }
            // Read mail from
            Column {
              FormRow("Read mail from") {
                Segmented(listOf(false to "Every bank we know", true to "Only these senders"), state.onlySenders, { only -> vm.edit { it.copy(onlySenders = only) } })
                Hint(
                  if (!state.onlySenders) "Alerts from ${data.bankCount} banks and wallets, plus any sender named in your rules."
                  else "Nothing else in your inbox is searched — not even senders named in your rules.",
                )
              }
              if (state.onlySenders) FormRow("Senders") {
                WebInput(
                  state.senders, { v -> vm.edit { it.copy(senders = v) } },
                  placeholder = "noreplyubi-txn@ubi.bank.in\nalerts@hdfcbank.net",
                  monoFace = true, singleLine = false, minLines = 3, maxLength = 4000,
                  invalid = state.sendersForm.fieldErrors["senders"] != null,
                )
                Hint("One per line — a full address, or a domain like hdfcbank.net for every address at that bank.")
                FieldError(state.sendersForm.fieldErrors["senders"])
              }
            }
            Actions {
              FormError(state.sendersForm.error?.takeIf { state.sendersForm.fieldErrors.isEmpty() })
              Btn(if (state.sendersForm.pending) "Saving…" else "Save senders", vm::saveSenders, style = BtnStyle.Ink, enabled = !state.sendersForm.pending)
            }
          }

          // Your account
          Section("Your account") {
            Actions { Btn("Sign out", vm::signOut, enabled = !state.signingOut) }
            Column(
              Modifier.padding(top = 16.dp).fillMaxWidth().border(1.dp, c.spend.mix(0.5f)).padding(20.dp),
              verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
              Eyebrow("Delete the account")
              Text(
                "This permanently deletes every line, tag, rule, slate account and stored mail, and revokes our access to Gmail. It can't be undone. Export anything you want to keep first.",
                style = sans(13.sp, lineHeight = 1.6),
                color = c.inkMuted,
              )
              Text(
                buildAnnotatedString {
                  append("Type ")
                  withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(data.user.email) }
                  append(" to confirm")
                },
                style = mono(9.5.sp, spacing = 0.03),
                color = c.inkFaint,
              )
              Box(Modifier.widthIn(max = 360.dp)) {
                WebInput(state.confirmEmail, { v -> vm.edit { it.copy(confirmEmail = v) } }, monoFace = true, keyboardType = KeyboardType.Email, invalid = state.deleteForm.fieldErrors["confirm"] != null)
              }
              FieldError(state.deleteForm.fieldErrors["confirm"])
              FormError(state.deleteForm.error?.takeIf { state.deleteForm.fieldErrors.isEmpty() })
              Btn(
                if (state.deleteForm.pending) "Deleting…" else "Delete everything",
                vm::deleteAccount,
                style = BtnStyle.Danger,
                enabled = !state.deleteForm.pending && state.confirmEmail.trim().equals(data.user.email, ignoreCase = true),
              )
            }
          }
        }
      }
    }
  }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) = Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
  Column {
    Text(title, Modifier.padding(bottom = 10.dp), style = serif(26.sp), color = Ledger.colors.inkBase)
    Rule()
  }
  content()
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Actions(content: @Composable () -> Unit) =
  FlowRow(Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp), itemVerticalAlignment = Alignment.CenterVertically) { content() }

@Composable
private fun Fact(label: String, value: String, error: Boolean = false) = Column {
  Column(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
    Text(label.uppercase(), style = mono(9.sp, FontWeight.Medium, 0.14), color = Ledger.colors.inkFaint)
    Text(value, style = sans(14.sp), color = if (error) Ledger.colors.spend else Ledger.colors.inkBase)
  }
  RuleHair()
}

/** A native checkbox, drawn square in ink (accent-color: ink). */
@Composable
private fun Checkbox(on: Boolean) {
  val c = Ledger.colors
  Box(
    Modifier.padding(top = 1.dp).size(18.dp).background(if (on) c.inkBase else c.paperRaised).border(1.5.dp, c.inkBase),
    contentAlignment = Alignment.Center,
  ) { if (on) Text("✓", style = sans(13.sp, FontWeight.Bold), color = c.paperBase) }
}
