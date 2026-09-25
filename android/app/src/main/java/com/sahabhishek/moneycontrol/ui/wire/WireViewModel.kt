package com.sahabhishek.moneycontrol.ui.wire

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sahabhishek.moneycontrol.data.BookChanges
import com.sahabhishek.moneycontrol.data.BookRepository
import com.sahabhishek.moneycontrol.data.Filing
import com.sahabhishek.moneycontrol.data.Messenger
import com.sahabhishek.moneycontrol.data.WireRepository
import com.sahabhishek.moneycontrol.data.api.ApiResult
import com.sahabhishek.moneycontrol.data.api.Rule
import com.sahabhishek.moneycontrol.data.api.Tag
import com.sahabhishek.moneycontrol.data.api.WireData
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class WireState(
  val data: WireData? = null,
  val tags: List<Tag> = emptyList(),
  val rules: List<Rule> = emptyList(),
  val loading: Boolean = true,
  val error: String? = null,
  /** a slip's action is in flight: which slip, and which action ("file", "archive", "delete", "dup") */
  val busy: Pair<Long, String>? = null,
  /** per-slip form errors: message and field errors */
  val slipErrors: Map<Long, Pair<String?, Map<String, String>>> = emptyMap(),
  val autoFilePending: Boolean = false,
)

/** app/(book)/wire/page.tsx — the desk, the rules, and what was decided. */
class WireViewModel(
  private val wire: WireRepository,
  private val book: BookRepository,
  private val messages: Messenger,
  changes: BookChanges,
) : ViewModel() {
  private val _state = MutableStateFlow(WireState())
  val state: StateFlow<WireState> = _state.asStateFlow()
  private var loadJob: Job? = null

  init {
    load()
    viewModelScope.launch { changes.changes.collect { load() } }
  }

  fun load() {
    loadJob?.cancel()
    loadJob = viewModelScope.launch {
      _state.update { it.copy(loading = it.data == null, error = null) }
      val w = async { wire.load() }
      val r = async { book.rules() }
      when (val data = w.await()) {
        is ApiResult.Failure -> _state.update { it.copy(loading = false, error = data.error) }
        is ApiResult.Ok -> {
          val rules = r.await() as? ApiResult.Ok
          _state.update { it.copy(data = data.data, rules = rules?.data?.rules ?: it.rules, tags = rules?.data?.tags ?: it.tags, loading = false, error = null) }
        }
      }
    }
  }

  private fun busy(id: Long, what: String): Boolean {
    if (_state.value.busy != null) return false
    _state.update { it.copy(busy = id to what, slipErrors = it.slipErrors - id) }
    return true
  }

  private fun done(id: Long, failure: ApiResult.Failure? = null) = _state.update {
    it.copy(busy = null, slipErrors = if (failure != null) it.slipErrors + (id to (failure.error to failure.fieldErrors)) else it.slipErrors - id)
  }

  fun file(id: Long, filing: Filing) {
    if (!busy(id, "file")) return
    viewModelScope.launch {
      when (val r = wire.file(id, filing)) {
        is ApiResult.Failure -> done(id, r)
        is ApiResult.Ok -> {
          done(id)
          messages.withUndo(r.message ?: "Filed.") {
            (wire.unfile(id) as? ApiResult.Failure)?.let { messages.error(it.error) }
          }
        }
      }
    }
  }

  fun archive(id: Long) = run(id, "archive", { wire.archive(id) }) { wire.restore(id) }
  fun delete(id: Long) = run(id, "delete", { wire.delete(id) }, null)
  fun sameAs(id: Long, entryId: Long) = run(id, "dup", { wire.sameAs(id, entryId) }) { wire.notSame(id) }

  /** From "Recently decided": put an archived mail back, or delete it. */
  fun putBack(id: Long) = decided(id) { wire.restore(id) }
  fun deleteDecided(id: Long) = decided(id) { wire.delete(id) }

  private fun run(id: Long, what: String, action: suspend () -> ApiResult<Unit>, undo: (suspend () -> ApiResult<Unit>)?) {
    if (!busy(id, what)) return
    viewModelScope.launch {
      when (val r = action()) {
        is ApiResult.Failure -> done(id, r)
        is ApiResult.Ok -> {
          done(id)
          if (undo != null) messages.withUndo(r.message ?: "Done.") { (undo() as? ApiResult.Failure)?.let { messages.error(it.error) } }
          else messages.say(r.message ?: "Done.")
        }
      }
    }
  }

  private fun decided(id: Long, action: suspend () -> ApiResult<Unit>) {
    if (!busy(id, "decided")) return
    viewModelScope.launch {
      val r = action()
      _state.update { it.copy(busy = null) }
      when (r) {
        is ApiResult.Failure -> messages.error(r.error)
        is ApiResult.Ok -> messages.say(r.message ?: "Done.")
      }
    }
  }

  fun setAutoFile(on: Boolean) {
    val data = _state.value.data ?: return
    _state.update { it.copy(data = data.copy(autoFile = on), autoFilePending = true) }
    viewModelScope.launch {
      val r = wire.setAutoFile(on)
      _state.update { it.copy(autoFilePending = false) }
      when (r) {
        is ApiResult.Failure -> {
          _state.update { s -> s.copy(data = s.data?.copy(autoFile = !on)) }
          messages.error(r.error)
        }
        is ApiResult.Ok -> messages.say(r.message ?: "Saved.")
      }
    }
  }
}
