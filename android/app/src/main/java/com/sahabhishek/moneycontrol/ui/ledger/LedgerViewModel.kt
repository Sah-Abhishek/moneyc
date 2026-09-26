package com.sahabhishek.moneycontrol.ui.ledger

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sahabhishek.moneycontrol.data.BookChanges
import com.sahabhishek.moneycontrol.data.BookRepository
import com.sahabhishek.moneycontrol.data.session.DevicePrefs
import com.sahabhishek.moneycontrol.data.Messenger
import com.sahabhishek.moneycontrol.data.WireRepository
import com.sahabhishek.moneycontrol.data.api.ApiResult
import com.sahabhishek.moneycontrol.data.api.EntriesPage
import com.sahabhishek.moneycontrol.data.api.ReportData
import com.sahabhishek.moneycontrol.data.api.Tag
import com.sahabhishek.moneycontrol.data.api.TagGroup
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
  val groups: List<TagGroup> = emptyList(),
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
  private val prefs: DevicePrefs,
) : ViewModel() {
  private val _state = MutableStateFlow(LedgerState(quick = QuickLine(mode = prefs.quickMode)))
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
      val entries = async { book.entries(q.ym, q.filter, q.q, q.tag?.id, q.page, q.group?.id) }
      val tags = async { book.tags() }
      val groups = async { book.tagGroups() }
      val slips = async { wire.load() }
      val r = report.await(); var e = entries.await(); val t = tags.await(); val g = groups.await(); val w = slips.await()
      // An unknown group (deleted meanwhile) is ignored, not an error — as on the web.
      var shown = q
      val known = (g as? ApiResult.Ok)?.data?.groups
      if (q.group != null && known != null) {
        val fresh = known.firstOrNull { it.id == q.group.id }
        if (fresh == null) {
          shown = q.copy(group = null)
          e = book.entries(q.ym, q.filter, q.q, q.tag?.id, q.page)
        } else shown = q.copy(group = fresh)
      }
      val failure = listOf(r, e, t, g).filterIsInstance<ApiResult.Failure>().firstOrNull()
      if (failure != null) {
        _state.update { it.copy(loading = false, error = failure.error) }
        return@launch
      }
      _state.update {
        it.copy(
          query = shown,
          groups = known.orEmpty(),
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

  fun onQuickChange(q: QuickLine) {
    if (q.mode != _state.value.quick.mode) prefs.quickMode = q.mode
    _state.update { it.copy(quick = q) }
  }

  /** Rule 02: the blank line is always ready. Who or what for (either will do) + amount, Enter, done. */
  fun quickAdd() {
    val line = _state.value.quick
    if (line.pending) return
    _state.update { it.copy(quick = line.copy(pending = true, error = null)) }
    viewModelScope.launch {
      when (val r = book.quick(line.payee, line.item, line.amount, line.tagId, line.mode, clientKey)) {
        is ApiResult.Failure -> _state.update { it.copy(quick = it.quick.copy(pending = false, error = r.error)) }
        is ApiResult.Ok -> {
          clientKey = UUID.randomUUID().toString()
          _state.update { it.copy(quick = QuickLine(mode = line.mode)) }
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
