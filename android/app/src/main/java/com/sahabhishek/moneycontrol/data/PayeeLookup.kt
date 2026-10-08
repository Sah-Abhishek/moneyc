package com.sahabhishek.moneycontrol.data

import com.sahabhishek.moneycontrol.data.api.ApiResult
import com.sahabhishek.moneycontrol.data.api.PayeeHistory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Looks up what a payee was paid for and tagged as before, a moment after
 * typing stops (components/PastUses.tsx's usePayeeHistory). [show] gets null
 * while there's nothing to offer; a failed lookup only means no suggestions.
 */
class PayeeLookup(private val book: BookRepository, private val scope: CoroutineScope, private val show: (PayeeHistory?) -> Unit) {
  private var job: Job? = null
  private var asked: Pair<String, String?>? = null

  /** [direction] out | in, or null for both. Asking again for the same payee and direction does nothing. */
  fun ask(payee: String, direction: String?) {
    val key = payee.trim().lowercase() to direction
    if (key == asked) return
    asked = key
    job?.cancel()
    if (payee.isBlank()) return show(null)
    book.cachedHistory(payee, direction)?.let { return show(it) }
    show(null)
    job = scope.launch {
      delay(250)
      (book.payeeHistory(payee, direction) as? ApiResult.Ok)?.let { show(it.data) }
    }
  }

  /** Forget the last answer, so the next [ask] looks again (after the line was saved). */
  fun reset() {
    job?.cancel()
    asked = null
    show(null)
  }
}
