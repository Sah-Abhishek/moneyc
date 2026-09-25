package com.sahabhishek.moneycontrol.ui.signin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sahabhishek.moneycontrol.auth.GoogleAuth
import com.sahabhishek.moneycontrol.auth.message
import com.sahabhishek.moneycontrol.data.AccountRepository
import com.sahabhishek.moneycontrol.data.api.ApiResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class SignInState(val working: Boolean = false, val error: String? = null)

class SignInViewModel(val google: GoogleAuth, private val account: AccountRepository) : ViewModel() {
  private val _state = MutableStateFlow(SignInState(error = GoogleAuth.Reason.NotConfigured.message().takeUnless { google.isConfigured }))
  val state: StateFlow<SignInState> = _state.asStateFlow()
  val endedNotice = account.endedNotice
  val deletedNotice = account.deletedNotice

  /** Returns false when a sign-in is already under way (a second tap). */
  fun starting(): Boolean {
    if (_state.value.working) return false
    _state.value = SignInState(working = true)
    account.clearNotice()
    return true
  }

  fun onStep(step: GoogleAuth.Step) {
    when (step) {
      is GoogleAuth.Step.NeedsConsent -> Unit // the flow shows Google's screen and reports back
      is GoogleAuth.Step.Failed -> _state.value = SignInState(error = step.reason.message())
      is GoogleAuth.Step.Code -> viewModelScope.launch {
        _state.value = when (val r = account.signIn(step.code)) {
          // Signed in: the app switches to the book as soon as the token is saved.
          is ApiResult.Ok -> SignInState()
          is ApiResult.Failure -> SignInState(error = r.error)
        }
      }
    }
  }
}
