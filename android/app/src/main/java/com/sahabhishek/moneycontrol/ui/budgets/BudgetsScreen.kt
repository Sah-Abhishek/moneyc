package com.sahabhishek.moneycontrol.ui.budgets

import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
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
import com.sahabhishek.moneycontrol.data.api.BudgetsData
import com.sahabhishek.moneycontrol.ui.shell.Page
import com.sahabhishek.moneycontrol.ui.shell.Section
import com.sahabhishek.moneycontrol.ui.shell.ShellState
import com.sahabhishek.moneycontrol.ui.theme.Ledger
import com.sahabhishek.moneycontrol.ui.theme.mono
import com.sahabhishek.moneycontrol.ui.theme.serif
import com.sahabhishek.moneycontrol.ui.web.Btn
import com.sahabhishek.moneycontrol.ui.web.BtnStyle
import com.sahabhishek.moneycontrol.ui.web.ErrorPage
import com.sahabhishek.moneycontrol.ui.web.FieldError
import com.sahabhishek.moneycontrol.ui.web.FormError
import com.sahabhishek.moneycontrol.ui.web.Gutter
import com.sahabhishek.moneycontrol.ui.web.LoadingPage
import com.sahabhishek.moneycontrol.ui.web.PageLede
import com.sahabhishek.moneycontrol.ui.web.Rule
import com.sahabhishek.moneycontrol.ui.web.RuleHair
import com.sahabhishek.moneycontrol.ui.web.SectionHead
import com.sahabhishek.moneycontrol.ui.web.Stamp
import com.sahabhishek.moneycontrol.ui.web.WebInput
import com.sahabhishek.moneycontrol.ui.web.mix
import com.sahabhishek.moneycontrol.util.rupees
import com.sahabhishek.moneycontrol.util.rupeesExact
import kotlin.math.roundToInt
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class BudgetsState(
  val data: BudgetsData? = null,
  val loadError: String? = null,
  val monthly: String = "",
  val perTag: Map<Long, String> = emptyMap(),
  val pending: Boolean = false,
  val error: String? = null,
  val fieldErrors: Map<String, String> = emptyMap(),
)

class BudgetsViewModel(private val book: BookRepository, private val messages: Messenger, changes: BookChanges) : ViewModel() {
  private val _state = MutableStateFlow(BudgetsState())
  val state: StateFlow<BudgetsState> = _state.asStateFlow()

  init {
    load()
    viewModelScope.launch { changes.changes.collect { if (!_state.value.pending) load() } }
  }

  fun load() {
    viewModelScope.launch {
      when (val r = book.budgets()) {
        is ApiResult.Failure -> _state.update { it.copy(loadError = r.error) }
        is ApiResult.Ok -> _state.update {
          it.copy(
            data = r.data, loadError = null,
            monthly = r.data.monthly?.let(::rupeesExact).orEmpty(),
            perTag = r.data.tags.filter { t -> t.kind == "spend" }.associate { t -> t.id to (t.budget?.let(::rupeesExact).orEmpty()) },
          )
        }
      }
    }
  }

  fun edit(f: (BudgetsState) -> BudgetsState) = _state.update(f)

  fun save() {
    val s = _state.value
    if (s.pending) return
    _state.update { it.copy(pending = true, error = null, fieldErrors = emptyMap()) }
    viewModelScope.launch {
      when (val r = book.saveBudgets(s.monthly, s.perTag)) {
        is ApiResult.Failure -> _state.update { it.copy(pending = false, error = r.error, fieldErrors = r.fieldErrors) }
        is ApiResult.Ok -> {
          _state.update { it.copy(pending = false) }
          messages.say(r.message ?: "Saved.")
        }
      }
    }
  }
}

/** app/(book)/budgets/page.tsx + BudgetsForm.tsx at the phone layout. */
@Composable
fun BudgetsScreen(shell: ShellState, nav: Nav, vm: BudgetsViewModel) {
  val state by vm.state.collectAsStateWithLifecycle()
  val c = Ledger.colors
  Page(shell, Section.Budgets, nav::section, nav::readMail, nav::reconnect) {
    val data = state.data
    when {
      state.loadError != null && data == null -> ErrorPage(state.loadError!!, vm::load) { nav.section(Section.Ledger) }
      data == null -> LoadingPage()
      else -> Column(Modifier.fillMaxWidth().padding(start = Gutter, end = Gutter, bottom = 64.dp)) {
        SectionHead("Budgets", small = "What each month is allowed to cost")
        PageLede("The monthly budget drives the bar on the front page. Tag budgets show on each stamp in the rack. Leave a box empty for no limit. Money on the slate never counts against a budget.")
        val m = data.summary
        val daysLeft = m.days - m.daysElapsed
        val spentByTag = m.byTag.filter { it.tag != null }.associate { it.tag!!.id to it.total }
        Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
          // "This month, everything"
          Column(Modifier.fillMaxWidth().background(c.inkBase).padding(22.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("THIS MONTH, EVERYTHING", style = Ledger.type.eyebrow, color = c.paperBase)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
              Text("₹", Modifier.alignByBaseline(), style = mono(26.sp), color = c.paperBase.mix(0.55f))
              BigInput(state.monthly, { v -> vm.edit { it.copy(monthly = v) } }, Modifier.weight(1f).alignByBaseline())
            }
            FieldError(state.fieldErrors["monthly"])
            Meter(m.spent, data.monthly, dark = true)
            data.monthly?.let { budget ->
              val left = budget - m.spent
              Text(
                (if (left >= 0) "₹${rupees(left)} left" else "₹${rupees(-left)} over") +
                  " with $daysLeft day${if (daysLeft == 1) "" else "s"} to go" +
                  if (left > 0 && daysLeft > 0) " — about ₹${rupees(left.toDouble() / daysLeft)} a day" else "",
                Modifier.padding(top = 5.dp),
                style = mono(9.5.sp, spacing = 0.03),
                color = c.paperBase.mix(0.7f),
              )
            }
          }

          Column(Modifier.fillMaxWidth()) {
            data.tags.filter { it.kind == "spend" }.forEach { t ->
              Column(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Stamp(t.name, t.color)
                Meter(spentByTag[t.id] ?: 0, t.budget, dark = false)
                WebInput(
                  state.perTag[t.id].orEmpty(), { v -> vm.edit { it.copy(perTag = it.perTag + (t.id to v)) } },
                  Modifier.semantics { contentDescription = "Monthly budget for ${t.name}" },
                  placeholder = "No limit", monoFace = true, keyboardType = KeyboardType.Decimal,
                  invalid = state.fieldErrors["tag-${t.id}"] != null,
                )
                FieldError(state.fieldErrors["tag-${t.id}"])
              }
              RuleHair()
            }
          }

          FormError(state.error?.takeIf { state.fieldErrors.isEmpty() })
          Btn(if (state.pending) "Saving…" else "Save budgets", vm::save, style = BtnStyle.Ink, enabled = !state.pending)
        }
      }
    }
  }
}

/** The big serif input on the dark panel (.big). */
@Composable
private fun BigInput(value: String, onChange: (String) -> Unit, modifier: Modifier) {
  val c = Ledger.colors
  val source = remember { MutableInteractionSource() }
  val focused by source.collectIsFocusedAsState()
  Column(modifier) {
    BasicTextField(
      value, { if (it.length <= 20) onChange(it) },
      Modifier.fillMaxWidth().semantics { contentDescription = "This month, everything" },
      textStyle = serif(56.sp, lineHeight = 1.1).copy(color = c.paperBase),
      singleLine = true,
      cursorBrush = SolidColor(c.spendBright),
      interactionSource = source,
      keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
      decorationBox = { inner -> Box { if (value.isEmpty()) Text("No limit", style = serif(56.sp, lineHeight = 1.1), color = c.paperBase.mix(0.35f)); inner() } },
    )
    Rule(color = if (focused) c.spendBright else c.paperBase.mix(0.35f))
  }
}

/** BudgetsForm.tsx Meter: "₹x spent · no limit", or a bar with "₹x of ₹y · n%". */
@Composable
private fun Meter(spent: Long, budget: Long?, dark: Boolean) {
  val c = Ledger.colors
  val text = mono(10.sp)
  if (budget == null || budget == 0L) {
    Text("₹${rupees(spent)} spent · no limit", style = text, color = if (dark) c.paperBase.mix(0.8f) else c.inkMuted)
    return
  }
  val pct = spent.toDouble() / budget
  Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
    Box(Modifier.fillMaxWidth().height(6.dp).background(if (dark) c.paperBase.mix(0.22f) else c.ruleHair)) {
      Box(Modifier.fillMaxWidth(minOf(1.0, pct).toFloat()).fillMaxHeight().background(if (pct > 1) c.spend else if (dark) c.spendBright else c.inkBase))
    }
    Text(
      "₹${rupees(spent)} of ₹${rupees(budget)}" + if (pct > 1) " · over by ₹${rupees(spent - budget)}" else " · ${(pct * 100).roundToInt()}%",
      style = text,
      color = if (pct > 1) c.spend else if (dark) c.paperBase.mix(0.8f) else c.inkMuted,
    )
  }
}

