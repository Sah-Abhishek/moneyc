package com.sahabhishek.moneycontrol.auth

import android.app.Activity
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.util.Log
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Scope
import kotlinx.coroutines.tasks.await

/**
 * Native Google sign-in. Asks Google for the person's identity plus read-only
 * Gmail, with an offline "server auth code" for the server's web client. The
 * app never holds Gmail credentials: it hands the one-time code to the server
 * (POST auth/google), which redeems it.
 */
class GoogleAuth(private val webClientId: String) {

  sealed interface Step {
    /** Google answered without needing the person (already granted). */
    data class Code(val code: String) : Step
    /** Google needs to show its account chooser / consent screen first. */
    data class NeedsConsent(val intent: PendingIntent) : Step
    data class Failed(val reason: Reason) : Step
  }

  enum class Reason { NotConfigured, Cancelled, NoPlayServices, Network, Unknown }

  val isConfigured get() = webClientId.isNotBlank()

  suspend fun begin(activity: Activity): Step {
    if (!isConfigured) return Step.Failed(Reason.NotConfigured)
    val request = AuthorizationRequest.builder()
      .setRequestedScopes(SCOPES)
      .requestOfflineAccess(webClientId)
      // Always ask for consent, so the code Google returns can be redeemed for a
      // refresh token (the website's flow does the same with prompt=consent).
      .setPrompt(AuthorizationRequest.Prompt.CONSENT)
      .build()
    return try {
      val result = Identity.getAuthorizationClient(activity).authorize(request).await()
      val pending = result.pendingIntent
      when {
        result.hasResolution() && pending != null -> Step.NeedsConsent(pending)
        result.serverAuthCode != null -> Step.Code(result.serverAuthCode!!)
        else -> Step.Failed(Reason.Unknown)
      }
    } catch (e: ApiException) {
      Log.w(TAG, "authorize failed: ${e.statusCode}", e)
      Step.Failed(reasonFor(e))
    } catch (e: Exception) {
      Log.w(TAG, "authorize failed", e)
      Step.Failed(Reason.NoPlayServices)
    }
  }

  /** Reads the result of Google's consent screen. */
  fun finish(context: Context, data: Intent?): Step = try {
    val result = Identity.getAuthorizationClient(context).getAuthorizationResultFromIntent(data)
    result.serverAuthCode?.let { Step.Code(it) } ?: Step.Failed(Reason.Unknown)
  } catch (e: ApiException) {
    Log.w(TAG, "consent failed: ${e.statusCode}", e)
    Step.Failed(reasonFor(e))
  }

  // UNREGISTERED_ON_API_CONSOLE: no Android OAuth client for this package + signing key.
  private fun reasonFor(e: ApiException) =
    if (e.message?.contains("UNREGISTERED_ON_API_CONSOLE") == true) Reason.NotConfigured else reasonFor(e.statusCode)

  private fun reasonFor(status: Int) = when (status) {
    CommonStatusCodes.CANCELED -> Reason.Cancelled
    CommonStatusCodes.NETWORK_ERROR, CommonStatusCodes.TIMEOUT -> Reason.Network
    CommonStatusCodes.DEVELOPER_ERROR -> Reason.NotConfigured
    else -> Reason.Unknown
  }

  private companion object {
    const val TAG = "GoogleAuth"
    val SCOPES = listOf(
      Scope("openid"),
      Scope("email"),
      Scope("profile"),
      Scope("https://www.googleapis.com/auth/gmail.readonly"),
    )
  }
}
