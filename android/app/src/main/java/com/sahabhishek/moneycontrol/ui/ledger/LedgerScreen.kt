package com.sahabhishek.moneycontrol.ui.ledger

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.rememberScrollState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sahabhishek.moneycontrol.Nav
import com.sahabhishek.moneycontrol.ui.shell.Page
import com.sahabhishek.moneycontrol.ui.shell.Section
import com.sahabhishek.moneycontrol.ui.shell.ShellState
import com.sahabhishek.moneycontrol.ui.shell.WireAlert
import com.sahabhishek.moneycontrol.ui.web.ErrorPage
import com.sahabhishek.moneycontrol.ui.web.LoadingPage
import com.sahabhishek.moneycontrol.util.shareCsv
import com.sahabhishek.moneycontrol.util.ymOf
import kotlinx.coroutines.launch

/** app/(book)/page.tsx at the phone layout. */
@Composable
fun LedgerScreen(shell: ShellState, nav: Nav, vm: LedgerViewModel, requested: LedgerQuery?) {
  val state by vm.state.collectAsStateWithLifecycle()
  val context = LocalContext.current
  val scroll = rememberScrollState()
  val scope = rememberCoroutineScope()
  var ledgerTop by remember { mutableIntStateOf(0) }
  val today = shell.me?.today
  val currentYm = today?.let(::ymOf)

  LaunchedEffect(currentYm, requested) {
    if (currentYm != null) {
      // Unknown or future months fall back to this month rather than erroring.
      val q = requested ?: LedgerQuery(currentYm)
      vm.show(if (q.ym > currentYm) q.copy(ym = currentYm) else q)
    }
  }

  Page(shell, Section.Ledger, nav::section, nav::readMail, nav::reconnect, scroll) {
    val report = state.report
    val entries = state.entries
    val query = state.query
    when {
      state.error != null && entries == null -> ErrorPage(state.error!!, vm::reload, null)
      report == null || entries == null || query == null || currentYm == null -> LoadingPage()
      else -> {
        FrontPage(report.summary) { nav.section(Section.Budgets) }
        WireAlert(state.waiting, state.banks) { nav.section(Section.Wire) }
        Box(Modifier.onGloballyPositioned { ledgerTop = it.positionInParent().y.toInt() }) {
          LedgerList(
            page = entries,
            query = query,
            groups = state.groups,
            tags = state.tags,
            currentYm = currentYm,
            bookIsEmpty = !shell.me.hasEntries,
            quick = state.quick,
            onQuery = { nav.ledger(it) },
            onQuickChange = vm::onQuickChange,
            onQuickAdd = vm::quickAdd,
            onAddPast = { nav.newEntry("${query.ym}-01") },
            onOpen = { nav.entry(it.id) },
            onSlate = { nav.slate(it) },
          )
        }
        LongView(
          ym = query.ym,
          months = report.months,
          daily = report.summary.daily,
          daysElapsed = report.summary.daysElapsed,
          merchants = report.merchants,
          range = "6m",
          full = false,
          onRange = { nav.reports(query.ym, it) },
          onExport = { vm.export(query.ym) { name, csv -> shareCsv(context, name, csv) } },
          onMerchant = { nav.ledger(LedgerQuery(query.ym, q = it.payee)) },
          onSeeAll = { nav.reports(query.ym, "6m") },
        )
        StampRack(
          m = report.summary,
          tags = state.tags,
          onTag = { t ->
            nav.ledger(LedgerQuery(query.ym, tag = t))
            scope.launch { scroll.animateScrollTo(ledgerTop) }
          },
          onUntagged = { nav.ledger(LedgerQuery(query.ym, filter = "untagged")) },
          onTags = { nav.section(Section.Tags) },
          onBudgets = { nav.section(Section.Budgets) },
          onNewTag = { nav.section(Section.Tags) },
        )
      }
    }
  }
}
