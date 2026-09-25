package com.sahabhishek.moneycontrol.ui.rules

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.sahabhishek.moneycontrol.Nav
import com.sahabhishek.moneycontrol.data.BookChanges
import com.sahabhishek.moneycontrol.data.BookRepository
import com.sahabhishek.moneycontrol.data.Messenger
import com.sahabhishek.moneycontrol.data.api.ApiResult
import com.sahabhishek.moneycontrol.data.api.Rule
import com.sahabhishek.moneycontrol.data.api.Tag
import com.sahabhishek.moneycontrol.ui.ledger.dashedBorder
import com.sahabhishek.moneycontrol.ui.shell.Page
import com.sahabhishek.moneycontrol.ui.shell.Section
import com.sahabhishek.moneycontrol.ui.shell.ShellState
import com.sahabhishek.moneycontrol.ui.theme.Ledger
import com.sahabhishek.moneycontrol.ui.theme.mono
import com.sahabhishek.moneycontrol.ui.theme.sans
import com.sahabhishek.moneycontrol.ui.theme.serif
import com.sahabhishek.moneycontrol.ui.web.Btn
import com.sahabhishek.moneycontrol.ui.web.BtnStyle
import com.sahabhishek.moneycontrol.ui.web.Chip
import com.sahabhishek.moneycontrol.ui.web.ConfirmButton
import com.sahabhishek.moneycontrol.ui.web.EmptyState
import com.sahabhishek.moneycontrol.ui.web.ErrorPage
import com.sahabhishek.moneycontrol.ui.web.Eyebrow
import com.sahabhishek.moneycontrol.ui.web.FieldError
import com.sahabhishek.moneycontrol.ui.web.FormError
import com.sahabhishek.moneycontrol.ui.web.Gutter
import com.sahabhishek.moneycontrol.ui.web.LabeledField
import com.sahabhishek.moneycontrol.ui.web.LoadingPage
import com.sahabhishek.moneycontrol.ui.web.Option
import com.sahabhishek.moneycontrol.ui.web.Rule as RuleLine
import com.sahabhishek.moneycontrol.ui.web.RuleHair
import com.sahabhishek.moneycontrol.ui.web.SectionHead
import com.sahabhishek.moneycontrol.ui.web.WebInput
import com.sahabhishek.moneycontrol.ui.web.WebSelect
import com.sahabhishek.moneycontrol.ui.wire.describeAction
import com.sahabhishek.moneycontrol.ui.wire.describeCondition
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

private val FIELD_LABEL = listOf("sender" to "Sender is", "payee_prefix" to "Payee starts with", "amount_over" to "Amount is over ₹")
private val PLACEHOLDER = mapOf("sender" to "alerts@hdfcbank.net or hdfcbank.net", "payee_prefix" to "SWIGGY", "amount_over" to "20,000")
private val ACTION_LABEL = mapOf("tag" to "Stamp a tag", "file" to "File automatically", "ask" to "Ask me first")

data class RuleForm(val field: String = "payee_prefix", val value: String = "", val action: String = "tag", val tagId: Long? = null) {
  /** An amount rule can ask or file, but can't choose a tag. */
  val actions get() = if (field == "amount_over") listOf("ask", "file") else listOf("tag", "file", "ask")
  val effectiveAction get() = if (action in actions) action else actions[0]
}

data class FormStatus(val pending: Boolean = false, val error: String? = null, val fieldErrors: Map<String, String> = emptyMap())

data class RulesState(
  val rules: List<Rule> = emptyList(),
  val tags: List<Tag> = emptyList(),
  val loaded: Boolean = false,
  val loadError: String? = null,
  val newRule: RuleForm = RuleForm(),
  val newStatus: FormStatus = FormStatus(),
  val editStatus: Map<Long, FormStatus> = emptyMap(),
  val saved: Map<Long, Int> = emptyMap(),
  val moving: Boolean = false,
)

class RulesViewModel(private val book: BookRepository, private val messages: Messenger, changes: BookChanges) : ViewModel() {
  private val _state = MutableStateFlow(RulesState())
  val state: StateFlow<RulesState> = _state.asStateFlow()

  init {
    load()
    viewModelScope.launch { changes.changes.collect { load() } }
  }

  fun load() {
    viewModelScope.launch {
      when (val r = book.rules()) {
        is ApiResult.Failure -> _state.update { it.copy(loadError = r.error) }
        is ApiResult.Ok -> _state.update { it.copy(rules = r.data.rules, tags = r.data.tags, loaded = true, loadError = null) }
      }
    }
  }

  fun editNew(f: (RuleForm) -> RuleForm) = _state.update { it.copy(newRule = f(it.newRule)) }

  fun add() {
    val f = _state.value.newRule
    if (_state.value.newStatus.pending) return
    _state.update { it.copy(newStatus = FormStatus(pending = true)) }
    viewModelScope.launch {
      when (val r = book.createRule(f.field, f.value, f.effectiveAction, f.tagId.takeIf { f.effectiveAction == "tag" })) {
        is ApiResult.Failure -> _state.update { it.copy(newStatus = FormStatus(error = r.error, fieldErrors = r.fieldErrors)) }
        is ApiResult.Ok -> {
          _state.update { it.copy(newStatus = FormStatus(), newRule = RuleForm()) }
          messages.say(r.message ?: "Rule added.")
        }
      }
    }
  }

  fun save(id: Long, f: RuleForm) {
    _state.update { it.copy(editStatus = it.editStatus + (id to FormStatus(pending = true))) }
    viewModelScope.launch {
      when (val r = book.updateRule(id, f.field, f.value, f.effectiveAction, f.tagId.takeIf { f.effectiveAction == "tag" })) {
        is ApiResult.Failure -> _state.update { it.copy(editStatus = it.editStatus + (id to FormStatus(error = r.error, fieldErrors = r.fieldErrors))) }
        is ApiResult.Ok -> {
          _state.update { it.copy(editStatus = it.editStatus - id, saved = it.saved + (id to (it.saved[id] ?: 0) + 1)) }
          messages.say(r.message ?: "Saved.")
        }
      }
    }
  }

  fun move(id: Long, direction: String) {
    if (_state.value.moving) return
    _state.update { it.copy(moving = true) }
    viewModelScope.launch {
      val r = book.moveRule(id, direction)
      _state.update { it.copy(moving = false) }
      if (r is ApiResult.Failure) messages.error(r.error)
    }
  }

  fun delete(id: Long) {
    viewModelScope.launch {
      when (val r = book.deleteRule(id)) {
        is ApiResult.Failure -> messages.error(r.error)
        is ApiResult.Ok -> messages.say(r.message ?: "Removed.")
      }
    }
  }
}

/** app/(book)/rules/page.tsx + RuleEditor.tsx */
@Composable
fun RulesScreen(shell: ShellState, nav: Nav, vm: RulesViewModel) {
  val state by vm.state.collectAsStateWithLifecycle()
  val c = Ledger.colors
  Page(shell, Section.Rules, nav::section, nav::readMail, nav::reconnect) {
    when {
      state.loadError != null && !state.loaded -> ErrorPage(state.loadError!!, vm::load) { nav.section(Section.Ledger) }
      !state.loaded -> LoadingPage()
      else -> Column(Modifier.fillMaxWidth().padding(start = Gutter, end = Gutter, bottom = 64.dp)) {
        SectionHead("Standing rules", small = "How the wire treats new mail")
        val em = SpanStyle(fontStyle = FontStyle.Italic)
        Text(
          buildAnnotatedString {
            append("Rules run on every new bank alert, top to bottom. The first matching ")
            withStyle(em) { append("tag") }
            append(" rule wins. ")
            withStyle(em) { append("Ask me first") }
            append(" always beats ")
            withStyle(em) { append("file automatically") }
            append(", whatever the order — so a big amount from a trusted sender still waits for you. A ")
            withStyle(em) { append("sender") }
            append(" rule also adds that sender to the mail the wire reads.")
          },
          Modifier.widthIn(max = 520.dp).padding(bottom = 24.dp),
          style = sans(14.sp, lineHeight = 1.6),
          color = c.inkMuted,
        )
        if (state.rules.isEmpty()) {
          EmptyState(
            "No rules yet.",
            body = "A few that tend to help: tag everything whose payee starts with SWIGGY as Food & delivery; file mail from your main bank automatically; ask first about anything over ₹20,000.",
          )
        } else {
          RuleLine()
          state.rules.forEachIndexed { i, r ->
            RuleRow(
              rule = r, tags = state.tags, first = i == 0, last = i == state.rules.lastIndex, moving = state.moving,
              status = state.editStatus[r.id] ?: FormStatus(), savedCount = state.saved[r.id] ?: 0,
              onMove = { d -> vm.move(r.id, d) }, onSave = { f -> vm.save(r.id, f) }, onDelete = { vm.delete(r.id) },
            )
          }
        }
        Column(
          Modifier.padding(top = 36.dp).fillMaxWidth().widthIn(max = 820.dp).dashedBorder().padding(22.dp),
          verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
          Eyebrow("A new rule")
          RuleFields(state.newRule, state.tags, state.newStatus.fieldErrors) { f -> vm.editNew { f } }
          FormError(state.newStatus.error?.takeIf { state.newStatus.fieldErrors.isEmpty() })
          Btn(if (state.newStatus.pending) "Adding…" else "Add rule", vm::add, style = BtnStyle.Ink, enabled = !state.newStatus.pending)
        }
      }
    }
  }
}

/** If / Value / Then / Tag — "Then" offers what the "If" allows. */
@Composable
private fun RuleFields(form: RuleForm, tags: List<Tag>, errors: Map<String, String>, onChange: (RuleForm) -> Unit) =
  Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
    LabeledField("If") { WebSelect(FIELD_LABEL.map { (k, v) -> Option(k, v) }, form.field, { onChange(form.copy(field = it)) }) }
    LabeledField("Value") {
      WebInput(
        form.value, { onChange(form.copy(value = it)) },
        placeholder = PLACEHOLDER[form.field].orEmpty(), monoFace = true, maxLength = 120,
        keyboardType = if (form.field == "amount_over") KeyboardType.Decimal else KeyboardType.Text,
        invalid = errors["value"] != null,
      )
      FieldError(errors["value"])
    }
    LabeledField("Then") {
      WebSelect(form.actions.map { Option(it, ACTION_LABEL[it].orEmpty()) }, form.effectiveAction, { onChange(form.copy(action = it)) })
      FieldError(errors["action"])
    }
    if (form.effectiveAction == "tag") LabeledField("Tag") {
      WebSelect(listOf(Option<Long?>(null, "Choose a tag")) + tags.map { Option<Long?>(it.id, it.name) }, form.tagId, { onChange(form.copy(tagId = it)) })
      FieldError(errors["tagId"])
    }
  }

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RuleRow(
  rule: Rule, tags: List<Tag>, first: Boolean, last: Boolean, moving: Boolean, status: FormStatus, savedCount: Int,
  onMove: (String) -> Unit, onSave: (RuleForm) -> Unit, onDelete: () -> Unit,
) {
  val c = Ledger.colors
  var editing by rememberSaveable(rule.id, savedCount) { mutableStateOf(false) }
  var form by rememberSaveable(rule.id, rule, savedCount, stateSaver = RuleFormSaver) { mutableStateOf(RuleForm(rule.field, rule.value, rule.action, rule.tag?.id)) }
  Column(Modifier.fillMaxWidth()) {
    FlowRow(
      Modifier.fillMaxWidth().heightIn(min = 60.dp).padding(vertical = 10.dp),
      horizontalArrangement = Arrangement.spacedBy(16.dp),
      verticalArrangement = Arrangement.spacedBy(8.dp),
      itemVerticalAlignment = Alignment.CenterVertically,
    ) {
      Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("${rule.position}", Modifier.width(20.dp), style = serif(22.sp), color = c.inkFaint)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
          Text("If ${describeCondition(rule)}", style = mono(11.sp), color = c.inkBase)
          Text("→ ${describeAction(rule)}".uppercase(), style = mono(9.5.sp, FontWeight.Medium, 0.1), color = c.spend)
        }
      }
      Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        Chip("↑", { onMove("up") }, enabled = !first && !moving)
        Chip("↓", { onMove("down") }, enabled = !last && !moving)
        Chip(if (editing) "Close" else "Edit", { editing = !editing })
        ConfirmButton(
          "Delete", "Delete this rule?", onDelete, confirmLabel = "Delete",
          padding = androidx.compose.foundation.layout.PaddingValues(horizontal = 11.dp, vertical = 6.dp),
        )
      }
    }
    if (editing) {
      Column(Modifier.fillMaxWidth().padding(top = 4.dp, bottom = 20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        RuleFields(form, tags, status.fieldErrors) { form = it }
        FormError(status.error?.takeIf { status.fieldErrors.isEmpty() })
        Btn(if (status.pending) "Saving…" else "Save rule", { onSave(form) }, style = BtnStyle.Ink, enabled = !status.pending)
      }
    }
    RuleHair()
  }
}

private val RuleFormSaver = androidx.compose.runtime.saveable.Saver<RuleForm, List<String>>(
  save = { listOf(it.field, it.value, it.action, it.tagId?.toString().orEmpty()) },
  restore = { RuleForm(it[0], it[1], it[2], it[3].toLongOrNull()) },
)
