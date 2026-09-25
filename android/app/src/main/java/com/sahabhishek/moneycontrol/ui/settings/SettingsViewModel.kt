package com.sahabhishek.moneycontrol.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sahabhishek.moneycontrol.data.AccountRepository
import com.sahabhishek.moneycontrol.data.BookChanges
import com.sahabhishek.moneycontrol.data.Messenger
import com.sahabhishek.moneycontrol.data.api.ApiResult
import com.sahabhishek.moneycontrol.data.api.SettingsData
import com.sahabhishek.moneycontrol.util.rupeesExact
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class FormStatus(val pending: Boolean = false, val error: String? = null, val fieldErrors: Map<String, String> = emptyMap())

data class SettingsState(
  val data: SettingsData? = null,
  val loadError: String? = null,
  // "The book"
  val budget: String = "",
  val timezone: String = "",
  val autoFile: Boolean = true,
  val book: FormStatus = FormStatus(),
  // "Read mail from"
  val onlySenders: Boolean = false,
  val senders: String = "",
  val sendersForm: FormStatus = FormStatus(),
  val disconnecting: Boolean = false,
  // "Your account"
  val confirmEmail: String = "",
  val deleteForm: FormStatus = FormStatus(),
  val signingOut: Boolean = false,
)

/** app/(book)/settings/page.tsx + components/SettingsForms.tsx */
class SettingsViewModel(private val account: AccountRepository, private val messages: Messenger, private val changes: BookChanges) : ViewModel() {
  private val _state = MutableStateFlow(SettingsState())
  val state: StateFlow<SettingsState> = _state.asStateFlow()

  init {
    load()
  }

  fun load() {
    viewModelScope.launch {
      when (val r = account.settings()) {
        is ApiResult.Failure -> _state.update { it.copy(loadError = r.error) }
        is ApiResult.Ok -> {
          val u = r.data.user
          _state.update {
            it.copy(
              data = r.data, loadError = null,
              budget = u.monthlyBudget?.let(::rupeesExact).orEmpty(), timezone = u.timezone, autoFile = u.autoFile,
              onlySenders = u.mailSenders.isNotEmpty(), senders = u.mailSenders.joinToString("\n"),
            )
          }
        }
      }
    }
  }

  fun edit(f: (SettingsState) -> SettingsState) = _state.update(f)

  fun saveBook() {
    val s = _state.value
    if (s.book.pending) return
    _state.update { it.copy(book = FormStatus(pending = true)) }
    viewModelScope.launch {
      when (val r = account.saveSettings(s.budget, s.timezone, s.autoFile)) {
        is ApiResult.Failure -> _state.update { it.copy(book = FormStatus(error = r.error, fieldErrors = r.fieldErrors)) }
        is ApiResult.Ok -> {
          _state.update { it.copy(book = FormStatus()) }
          messages.say(r.message ?: "Settings saved.")
          changes.changed()
        }
      }
    }
  }

  fun saveSenders() {
    val s = _state.value
    if (s.sendersForm.pending) return
    _state.update { it.copy(sendersForm = FormStatus(pending = true)) }
    viewModelScope.launch {
      when (val r = account.saveSenders(if (s.onlySenders) "only" else "banks", s.senders)) {
        is ApiResult.Failure -> _state.update { it.copy(sendersForm = FormStatus(error = r.error, fieldErrors = r.fieldErrors)) }
        is ApiResult.Ok -> {
          _state.update { it.copy(sendersForm = FormStatus()) }
          messages.say(r.message ?: "Saved.")
        }
      }
    }
  }

  fun disconnect() {
    _state.update { it.copy(disconnecting = true) }
    viewModelScope.launch {
      val r = account.disconnectGmail()
      _state.update { it.copy(disconnecting = false) }
      when (r) {
        is ApiResult.Failure -> messages.error(r.error)
        is ApiResult.Ok -> {
          messages.say(r.message ?: "Disconnected.")
          load()
          changes.changed()
        }
      }
    }
  }

  fun signOut() {
    if (_state.value.signingOut) return
    _state.update { it.copy(signingOut = true) }
    viewModelScope.launch { account.signOut() }
  }

  fun deleteAccount() {
    val s = _state.value
    if (s.deleteForm.pending) return
    _state.update { it.copy(deleteForm = FormStatus(pending = true)) }
    viewModelScope.launch {
      when (val r = account.deleteAccount(s.confirmEmail)) {
        is ApiResult.Failure -> _state.update { it.copy(deleteForm = FormStatus(error = r.error, fieldErrors = r.fieldErrors)) }
        is ApiResult.Ok -> Unit // signed out: the app returns to the welcome page, which says so
      }
    }
  }
}
