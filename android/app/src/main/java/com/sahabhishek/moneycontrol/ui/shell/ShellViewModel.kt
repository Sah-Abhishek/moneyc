package com.sahabhishek.moneycontrol.ui.shell

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sahabhishek.moneycontrol.data.AccountRepository
import com.sahabhishek.moneycontrol.data.BookChanges
import com.sahabhishek.moneycontrol.data.Messenger
import com.sahabhishek.moneycontrol.data.WireRepository
import com.sahabhishek.moneycontrol.data.api.ApiResult
import com.sahabhishek.moneycontrol.data.api.Connection
import com.sahabhishek.moneycontrol.data.api.Me
import java.time.Instant
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

enum class SyncPhase { Idle, Syncing, Error }

data class ShellState(
  val me: Me? = null,
  val phase: SyncPhase = SyncPhase.Idle,
  /** the last sync problem, if the wire is paused */
  val syncMessage: String? = null,
  val lastOk: String? = null,
)

/**
 * The masthead's data (who, waiting count, Gmail state, book totals) and the
 * wire's automatic reading — WireStatus.tsx: read when the app opens if the
 * last read is stale, then every ten minutes while it's on screen.
 */
class ShellViewModel(
  private val account: AccountRepository,
  private val wire: WireRepository,
  private val changes: BookChanges,
  private val messages: Messenger,
) : ViewModel() {
  private val _state = MutableStateFlow(ShellState())
  val state: StateFlow<ShellState> = _state.asStateFlow()
  private var syncing = false
  private var ticker: Job? = null

  init {
    refresh()
    viewModelScope.launch { changes.changes.collect { refresh() } }
  }

  fun refresh() {
    viewModelScope.launch {
      val r = account.me()
      if (r is ApiResult.Ok) _state.update {
        it.copy(
          me = r.data,
          lastOk = it.lastOk ?: r.data.sync.lastSuccessAt,
          phase = if (it.phase == SyncPhase.Idle && r.data.sync.lastError != null && it.me == null) SyncPhase.Error else it.phase,
          syncMessage = if (it.me == null) r.data.sync.lastError else it.syncMessage,
        )
      }
    }
  }

  /** The app came to the foreground: read now if stale, then every ten minutes. */
  fun onScreen() {
    ticker?.cancel()
    ticker = viewModelScope.launch {
      while (_state.value.me == null && isActive) delay(250)
      val last = _state.value.lastOk?.let { runCatching { Instant.parse(it) }.getOrNull() }
      if (last == null || Instant.now().toEpochMilli() - last.toEpochMilli() > STALE_MS) sync(false)
      while (isActive) {
        delay(EVERY_MS)
        sync(false)
      }
    }
  }

  fun offScreen() {
    ticker?.cancel()
    ticker = null
  }

  fun readNow() {
    viewModelScope.launch { sync(true) }
  }

  private suspend fun sync(force: Boolean) {
    if (syncing || _state.value.me?.connection != Connection.Connected) return
    syncing = true
    _state.update { it.copy(phase = SyncPhase.Syncing) }
    var added = 0
    var filed = 0
    var tooSoon = false
    try {
      // A big first read arrives in batches; keep going while the server says there's more.
      for (batch in 0 until 20) {
        when (val r = wire.readMail(force || batch > 0)) {
          is ApiResult.Failure -> {
            _state.update { it.copy(phase = SyncPhase.Error, syncMessage = r.error) }
            if (force) messages.error(r.error)
            return
          }
          is ApiResult.Ok -> {
            added += r.data.added
            filed += r.data.autoFiled
            if (r.data.state == "done") _state.update { it.copy(lastOk = Instant.now().toString()) }
            tooSoon = r.data.state == "too_soon"
            if (!r.data.more) break
          }
        }
      }
      _state.update { it.copy(phase = SyncPhase.Idle, syncMessage = null) }
      if (added > 0) {
        val waiting = added - filed
        messages.say(
          listOfNotNull(
            waiting.takeIf { it > 0 }?.let { "$it new mail${if (it == 1) "" else "s"} on the wire" },
            filed.takeIf { it > 0 }?.let { "$it filed automatically" },
          ).joinToString(" · "),
        )
      } else if (force) {
        messages.say(if (tooSoon) "The wire was read a moment ago. Try again in a few seconds." else "The wire is up to date.")
      }
    } finally {
      syncing = false
    }
  }

  private companion object {
    const val STALE_MS = 5 * 60_000L
    const val EVERY_MS = 10 * 60_000L
  }
}
