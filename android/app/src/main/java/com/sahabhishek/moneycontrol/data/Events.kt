package com.sahabhishek.moneycontrol.data

import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * "The book changed": emitted after any write, so every screen showing book
 * data reloads — file a slip on the wire, and the ledger already has the line.
 */
class BookChanges {
  private val flow = MutableSharedFlow<Unit>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)
  val changes: SharedFlow<Unit> = flow.asSharedFlow()
  fun changed() {
    flow.tryEmit(Unit)
  }
}

/** A toast, as on the web (components/ui/Toaster): info or error, optionally with an Undo. */
data class UiMessage(val text: String, val isError: Boolean = false, val actionLabel: String = "Undo", val undo: (suspend () -> Unit)? = null)

/** App-wide toast queue: screens post, the shell shows. */
class Messenger {
  private val flow = MutableSharedFlow<UiMessage>(extraBufferCapacity = 8, onBufferOverflow = BufferOverflow.DROP_OLDEST)
  val messages: SharedFlow<UiMessage> = flow.asSharedFlow()
  fun say(text: String) {
    flow.tryEmit(UiMessage(text))
  }
  fun error(text: String) {
    flow.tryEmit(UiMessage(text, isError = true))
  }
  fun withUndo(text: String, label: String = "Undo", undo: suspend () -> Unit) {
    flow.tryEmit(UiMessage(text, actionLabel = label, undo = undo))
  }
}
