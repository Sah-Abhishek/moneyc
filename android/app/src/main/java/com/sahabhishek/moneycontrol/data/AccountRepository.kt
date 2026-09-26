package com.sahabhishek.moneycontrol.data

import com.sahabhishek.moneycontrol.data.api.ApiClient
import com.sahabhishek.moneycontrol.data.api.ApiResult
import com.sahabhishek.moneycontrol.data.api.AuthResult
import com.sahabhishek.moneycontrol.data.api.Me
import com.sahabhishek.moneycontrol.data.api.SendersResult
import com.sahabhishek.moneycontrol.data.api.SettingsData
import com.sahabhishek.moneycontrol.data.api.User
import com.sahabhishek.moneycontrol.data.api.body
import com.sahabhishek.moneycontrol.data.session.SessionStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.builtins.serializer

/** Signing in and out, and who is signed in. */
class AccountRepository(private val api: ApiClient, private val session: SessionStore) {
  /** null = signed out. */
  val token: Flow<String?> = session.token

  private val _endedNotice = MutableStateFlow<String?>(null)
  /** Why the person is back on the sign-in screen, if it wasn't their choice. */
  val endedNotice: StateFlow<String?> = _endedNotice.asStateFlow()

  suspend fun signIn(serverAuthCode: String): ApiResult<AuthResult> {
    val r = api.post("auth/google", body("code" to serverAuthCode), AuthResult.serializer())
    if (r is ApiResult.Ok) {
      session.save(r.data.token)
      _endedNotice.value = null
    }
    return r
  }

  @Volatile private var signingOut = false

  /** Ends the session on the server too; signs out locally even when offline. */
  suspend fun signOut() {
    signingOut = true
    try {
      api.post("auth/signout")
      session.clear()
      _endedNotice.value = null
    } finally {
      signingOut = false
    }
  }

  /** The server said the token is no longer valid (expired, revoked, account deleted). */
  suspend fun sessionEnded() {
    if (signingOut || session.current() == null) return
    session.clear()
    _endedNotice.value = "Your session ended. Sign in again — your book is safe."
  }

  private val _deleted = MutableStateFlow(false)
  /** The account was just deleted — the welcome page says so (web: /welcome?deleted=1). */
  val deletedNotice: StateFlow<Boolean> = _deleted.asStateFlow()

  fun clearNotice() {
    _endedNotice.value = null
    _deleted.value = false
  }

  suspend fun me(): ApiResult<Me> = api.get("me", Me.serializer())

  suspend fun settings() = api.get("settings", SettingsData.serializer())

  suspend fun saveSettings(monthlyBudget: String, timezone: String, autoFile: Boolean) =
    api.put("settings", body("monthlyBudget" to monthlyBudget, "timezone" to timezone, "autoFile" to autoFile), User.serializer())

  suspend fun saveSenders(scope: String, senders: String) =
    api.put("settings/senders", body("scope" to scope, "senders" to senders), SendersResult.serializer())

  suspend fun disconnectGmail() = api.post("gmail/disconnect")

  /** Deletes everything; on success the session is gone too. */
  suspend fun deleteAccount(confirmEmail: String): ApiResult<Unit> {
    val r = api.delete("account", Unit.serializer(), body("confirm" to confirmEmail))
    if (r is ApiResult.Ok) {
      _deleted.value = true
      session.clear()
      _endedNotice.value = null
    }
    return r
  }
}
