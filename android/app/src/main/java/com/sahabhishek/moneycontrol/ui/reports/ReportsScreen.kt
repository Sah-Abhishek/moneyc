package com.sahabhishek.moneycontrol.ui.reports

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.sahabhishek.moneycontrol.Nav
import com.sahabhishek.moneycontrol.data.BookChanges
import com.sahabhishek.moneycontrol.data.BookRepository
import com.sahabhishek.moneycontrol.data.Messenger
import com.sahabhishek.moneycontrol.data.api.ApiResult
import com.sahabhishek.moneycontrol.data.api.ReportData
import com.sahabhishek.moneycontrol.ui.ledger.FrontPage
import com.sahabhishek.moneycontrol.ui.ledger.LedgerQuery
import com.sahabhishek.moneycontrol.ui.ledger.LongView
import com.sahabhishek.moneycontrol.ui.shell.Page
import com.sahabhishek.moneycontrol.ui.shell.Section
import com.sahabhishek.moneycontrol.ui.shell.ShellState
import com.sahabhishek.moneycontrol.ui.web.Chip
import com.sahabhishek.moneycontrol.ui.web.ErrorPage
import com.sahabhishek.moneycontrol.ui.web.Eyebrow
import com.sahabhishek.moneycontrol.ui.web.Gutter
import com.sahabhishek.moneycontrol.ui.web.LoadingPage
import com.sahabhishek.moneycontrol.util.monthTitle
import com.sahabhishek.moneycontrol.util.shareCsv
import com.sahabhishek.moneycontrol.util.shiftYm
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ReportsState(val ym: String? = null, val range: String = "6m", val data: ReportData? = null, val error: String? = null)

class ReportsViewModel(private val book: BookRepository, private val messages: Messenger, changes: BookChanges) : ViewModel() {
  private val _state = MutableStateFlow(ReportsState())
  val state: StateFlow<ReportsState> = _state.asStateFlow()
  private var job: Job? = null

  init {
    viewModelScope.launch { changes.changes.collect { load() } }
  }

  fun show(ym: String?, range: String) {
    val s = _state.value
    if (s.data != null && s.ym == ym && s.range == range) return
    _state.update { it.copy(ym = ym, range = range) }
    load()
  }

  fun load() {
    job?.cancel()
    job = viewModelScope.launch {
      val s = _state.value
      when (val r = book.report(s.ym, s.range)) {
        is ApiResult.Failure -> _state.update { it.copy(error = r.error) }
        is ApiResult.Ok -> _state.update { it.copy(data = r.data, ym = r.data.ym, error = null) }
      }
    }
  }

  fun export(ym: String, share: (String, String) -> Boolean) {
    viewModelScope.launch {
      when (val r = book.exportCsv(ym)) {
        is ApiResult.Failure -> messages.error(r.error)
        is ApiResult.Ok -> if (!share("money-control-$ym.csv", r.data)) messages.error("No app on this phone can take a CSV file.")
      }
    }
  }
}

/** app/(book)/reports/page.tsx */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ReportsScreen(shell: ShellState, nav: Nav, vm: ReportsViewModel, ym: String?, range: String) {
  val state by vm.state.collectAsStateWithLifecycle()
  val context = LocalContext.current
  val currentYm = shell.me?.today?.take(7)
  LaunchedEffect(ym, range) { vm.show(ym, range) }

  Page(shell, Section.Reports, nav::section, nav::readMail, nav::reconnect) {
    val data = state.data
    when {
      state.error != null && data == null -> ErrorPage(state.error!!, vm::load) { nav.section(Section.Ledger) }
      data == null -> LoadingPage()
      else -> {
        FlowRow(
          Modifier.fillMaxWidth().padding(start = Gutter, end = Gutter, top = 24.dp),
          horizontalArrangement = Arrangement.spacedBy(8.dp),
          verticalArrangement = Arrangement.spacedBy(8.dp),
          itemVerticalAlignment = Alignment.CenterVertically,
        ) {
          Eyebrow("Report for ${monthTitle(data.ym)} ${data.ym.take(4)}", Modifier.padding(end = 8.dp))
          Chip("‹ ${monthTitle(shiftYm(data.ym, -1)).take(3)}", { nav.reports(shiftYm(data.ym, -1), data.range) })
          if (currentYm != null && data.ym < currentYm) Chip("${monthTitle(shiftYm(data.ym, 1)).take(3)} ›", { nav.reports(shiftYm(data.ym, 1), data.range) })
        }
        FrontPage(data.summary) { nav.section(Section.Budgets) }
        LongView(
          ym = data.ym,
          months = data.months,
          daily = data.summary.daily,
          daysElapsed = data.summary.daysElapsed,
          merchants = data.merchants,
          range = data.range,
          full = true,
          onRange = { nav.reports(data.ym, it) },
          onExport = { vm.export(data.ym) { name, csv -> shareCsv(context, name, csv) } },
          onMerchant = { nav.ledger(LedgerQuery(data.ym, q = it.payee)) },
          onSeeAll = {},
        )
      }
    }
  }
}
