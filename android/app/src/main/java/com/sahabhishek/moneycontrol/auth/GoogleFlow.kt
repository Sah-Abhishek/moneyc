package com.sahabhishek.moneycontrol.auth

import android.app.Activity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.launch

/**
 * Runs Google's sign-in from a screen: asks Google, shows its consent screen if
 * it needs one, and reports how it ended. Used for signing in and for
 * reconnecting Gmail. Returns the function to call from a button.
 */
@Composable
fun rememberGoogleFlow(google: GoogleAuth, onStep: (GoogleAuth.Step) -> Unit): () -> Unit {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  val report = rememberUpdatedState(onStep)
  val consent = rememberLauncherForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { result ->
    report.value(google.finish(context, result.data))
  }
  return remember(google, context) {
    {
      val activity = context as? Activity
      if (activity == null) {
        report.value(GoogleAuth.Step.Failed(GoogleAuth.Reason.Unknown))
      } else {
        scope.launch {
          when (val step = google.begin(activity)) {
            is GoogleAuth.Step.NeedsConsent -> consent.launch(IntentSenderRequest.Builder(step.intent).build())
            else -> report.value(step)
          }
        }
      }
    }
  }
}

/** What to tell the person when Google's side of sign-in ends without a code (null: nothing to say). */
fun GoogleAuth.Reason.message(): String? = when (this) {
  GoogleAuth.Reason.Cancelled -> null // they closed Google's window; nothing to apologise for
  GoogleAuth.Reason.NotConfigured -> "Sign-in isn't set up in this build of the app yet."
  GoogleAuth.Reason.NoPlayServices -> "Google sign-in needs Google Play services, which this phone doesn't have or needs to update."
  GoogleAuth.Reason.Network -> "We couldn't reach Google just now. Check your connection and try again."
  GoogleAuth.Reason.Unknown -> "Google didn't complete the sign-in. Try again; if it keeps happening, restart the app."
}
