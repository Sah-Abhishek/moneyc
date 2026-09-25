package com.sahabhishek.moneycontrol.ui.ledger

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sahabhishek.moneycontrol.data.BookChanges
import com.sahabhishek.moneycontrol.data.BookRepository
import com.sahabhishek.moneycontrol.data.Messenger
import com.sahabhishek.moneycontrol.data.WireRepository
import com.sahabhishek.moneycontrol.data.api.ApiResult
import com.sahabhishek.moneycontrol.data.api.EntriesPage
import com.sahabhishek.moneycontrol.data.api.ReportData
import com.sahabhishek.moneycontrol.data.api.Tag
import java.util.UUID
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LedgerState(
  val query: LedgerQuery? = null,
  val report: ReportData? = null,
  val entries: EntriesPage? = null,
  val tags: List<Tag> = emptyList(),
  val waiting: Int = 0,
  val banks: List<String> = emptyList(),
  val loading: Boolean = true,
  val error: String? = null,
  val quick: QuickLine = QuickLine(),
)

/** The ledger page: the month's front page, the lines, the Long View and the Stamp Rack. */
class LedgerViewModel(
  private val book: BookRepository,
  private val wire: WireRepository,
  private val messages: Messenger,
  changes: BookChanges,
) : ViewModel() {
  private val _state = MutableStateFlow(LedgerState())
  val state: StateFlow<LedgerState> = _state.asStateFlow()
  private var clientKey = UUID.randomUUID().toString()
  private var loadJob: Job? = null

  init {
    viewModelScope.launch { changes.changes.collect { reload() } }
  }

  /** Called with the query to show; a change of query loads again. */
  fun show(q: LedgerQuery) {
    if (q == _state.value.query && _state.value.error == null) return
    _state.update { it.copy(query = q) }
    reload()
  }

  fun reload() {
    val q = _state.value.query ?: return
    loadJob?.cancel()
    loadJob = viewModelScope.launch {
      _state.update { it.copy(loading = it.entries == null, error = null) }
      val report = async { book.report(q.ym, "6m") }
      val entries = async { book.entries(q.ym, q.filter, q.q, q.tag?.id, q.page) }
      val tags = async { book.tags() }
      val slips = async { wire.load() }
      val r = report.await(); val e = entries.await(); val t = tags.await(); val w = slips.await()
      val failure = listOf(r, e, t).filterIsInstance<ApiResult.Failure>().firstOrNull()
      if (failure != null) {
        _state.update { it.copy(loading = false, error = failure.error) }
        return@launch
      }
      _state.update {
        it.copy(
          report = (r as ApiResult.Ok).data,
          entries = (e as ApiResult.Ok).data,
          tags = (t as ApiResult.Ok).data.tags,
          waiting = (w as? ApiResult.Ok)?.data?.waiting?.size ?: it.waiting,
          banks = (w as? ApiResult.Ok)?.data?.waiting?.map { s -> s.bank }?.distinct() ?: it.banks,
          loading = false,
          error = null,
        )
      }
    }
  }

  fun onQuickChange(q: QuickLine) = _state.update { it.copy(quick = q) }

  /** Rule 02: the blank line is always ready. Payee + amount, Enter, done. */
  fun quickAdd() {
    val line = _state.value.quick
    if (line.pending) return
    _state.update { it.copy(quick = line.copy(pending = true, error = null)) }
    viewModelScope.launch {
      when (val r = book.quick(line.payee, line.amount, null, clientKey)) {
        is ApiResult.Failure -> _state.update { it.copy(quick = it.quick.copy(pending = false, error = r.error)) }
        is ApiResult.Ok -> {
          clientKey = UUID.randomUUID().toString()
          _state.update { it.copy(quick = QuickLine()) }
          val id = r.data.id
          messages.withUndo(r.message ?: "Line added.") {
            when (val del = book.delete(id)) {
              is ApiResult.Ok -> messages.withUndo("Line removed.", "Put it back") { book.restore(id) }
              is ApiResult.Failure -> messages.error(del.error)
            }
          }
        }
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
