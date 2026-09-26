package com.sahabhishek.moneycontrol.ui.entry

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sahabhishek.moneycontrol.data.BookRepository
import com.sahabhishek.moneycontrol.data.LineDraft
import com.sahabhishek.moneycontrol.data.Messenger
import com.sahabhishek.moneycontrol.data.api.Account
import com.sahabhishek.moneycontrol.data.api.ApiResult
import com.sahabhishek.moneycontrol.data.api.Entry
import com.sahabhishek.moneycontrol.data.api.Tag
import com.sahabhishek.moneycontrol.util.rupeesExact
import java.util.UUID
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** The form as typed. `occurredAt` is "YYYY-MM-DDTHH:MM" on the user's clock. */
data class LineForm(
  val amount: String = "",
  val direction: String = "out",
  val payee: String = "",
  /** what the money was for */
  val item: String = "",
  val occurredAt: String = "",
  val channel: String = "UPI",
  val tagId: Long? = null,
  val note: String = "",
  /** only when the channel is Cheque */
  val chequeNo: String = "",
  /** ATM money out: wallet | spent — a new line must be asked, so no default */
  val cash: String? = null,
) {
  val cashOut get() = channel == "ATM" && direction == "out"
  /** the withdrawal only moves money to the wallet: no tag, not spending */
  val toWallet get() = cashOut && cash == "wallet"
}

data class EntryState(
  val entry: Entry? = null,
  val form: LineForm = LineForm(),
  val tags: List<Tag> = emptyList(),
  val people: List<Account> = emptyList(),
  val loading: Boolean = true,
  val loadError: String? = null,
  val notFound: Boolean = false,
  val pending: Boolean = false,
  val deleting: Boolean = false,
  val error: String? = null,
  val fieldErrors: Map<String, String> = emptyMap(),
  val slatePending: Boolean = false,
  val slateError: String? = null,
)

/** "A new line" (id == null) or an existing line's page. */
class EntryViewModel(
  private val id: Long?,
  private val defaultWhen: String,
  private val book: BookRepository,
  private val messages: Messenger,
) : ViewModel() {
  private val _state = MutableStateFlow(EntryState(form = LineForm(occurredAt = defaultWhen.take(16))))
  val state: StateFlow<EntryState> = _state.asStateFlow()
  private val clientKey = UUID.randomUUID().toString()

  /** One-off navigation: back to the ledger month after saving or deleting. */
  private val _done = MutableStateFlow<String?>(null)
  val done: StateFlow<String?> = _done.asStateFlow()

  init {
    load()
  }

  fun load() {
    viewModelScope.launch {
      _state.update { it.copy(loading = true, loadError = null) }
      val tags = async { book.tags() }
      val people = async { book.people() }
      val entry = id?.let { async { book.entry(it) } }
      val e = entry?.await()
      if (e is ApiResult.Failure) {
        _state.update { it.copy(loading = false, notFound = e.status == 404, loadError = e.error) }
        return@launch
      }
      val t = tags.await()
      if (t is ApiResult.Failure) {
        _state.update { it.copy(loading = false, loadError = t.error) }
        return@launch
      }
      val line = (e as? ApiResult.Ok)?.data
      _state.update {
        it.copy(
          entry = line,
          form = if (line != null) formOf(line) else it.form,
          tags = (t as ApiResult.Ok).data.tags,
          people = (people.await() as? ApiResult.Ok)?.data?.accounts?.filter { a -> !a.archived }.orEmpty(),
          loading = false,
        )
      }
    }
  }

  private fun formOf(e: Entry) = LineForm(
    amount = rupeesExact(e.amount),
    direction = if (e.amount > 0) "in" else "out",
    payee = e.payee.orEmpty(),
    item = e.item.orEmpty(),
    occurredAt = e.occurredAt.take(16),
    channel = e.channel,
    tagId = e.tag?.id,
    note = e.note.orEmpty(),
    chequeNo = if (e.channel == "Cheque") e.ref.orEmpty() else "",
    // An ATM line that already exists had its answer given.
    cash = if (e.channel == "ATM" && e.amount < 0) (if (e.toWallet) "wallet" else "spent") else null,
  )

  fun edit(f: (LineForm) -> LineForm) = _state.update { it.copy(form = f(it.form)) }

  fun save() {
    val s = _state.value
    if (s.pending || s.deleting) return
    _state.update { it.copy(pending = true, error = null, fieldErrors = emptyMap()) }
    val f = s.form
    val draft = LineDraft(
      f.payee, f.amount, f.direction, f.occurredAt, f.channel,
      tagId = if (f.toWallet) null else f.tagId,
      note = f.note,
      item = f.item,
      // A line from the wire keeps the number the bank mailed.
      chequeNo = f.chequeNo.takeIf { f.channel == "Cheque" && s.entry?.source != "wire" },
      cash = f.cash.takeIf { f.cashOut },
    )
    viewModelScope.launch {
      val r = if (s.entry == null) book.create(draft, clientKey) else book.update(s.entry.id, draft, s.entry.version)
      when (r) {
        is ApiResult.Failure -> _state.update { it.copy(pending = false, error = r.error, fieldErrors = r.fieldErrors) }
        is ApiResult.Ok -> {
          _state.update { it.copy(pending = false) }
          messages.say(r.message ?: "Saved.")
          _done.value = r.data.occurredAt.take(7)
        }
      }
    }
  }

  fun delete() {
    val e = _state.value.entry ?: return
    _state.update { it.copy(deleting = true) }
    viewModelScope.launch {
      val r = book.delete(e.id)
      _state.update { it.copy(deleting = false) }
      when (r) {
        is ApiResult.Failure -> messages.error(r.error)
        is ApiResult.Ok -> {
          messages.withUndo("Line deleted.") { (book.restore(e.id) as? ApiResult.Failure)?.let { messages.error(it.error) } }
          _done.value = e.occurredAt.take(7)
        }
      }
    }
  }

  fun putOnSlate(personId: Long) {
    val e = _state.value.entry ?: return
    _state.update { it.copy(slatePending = true, slateError = null) }
    viewModelScope.launch {
      when (val r = book.putOnSlate(e.id, personId)) {
        is ApiResult.Failure -> _state.update { it.copy(slatePending = false, slateError = r.error) }
        is ApiResult.Ok -> {
          _state.update { it.copy(slatePending = false, entry = r.data, form = formOf(r.data)) }
          messages.say(r.message ?: "Put on the slate.")
        }
      }
    }
  }

  fun takeOffSlate() {
    val e = _state.value.entry ?: return
    viewModelScope.launch {
      when (val r = book.takeOffSlate(e.id)) {
        is ApiResult.Failure -> messages.error(r.error)
        is ApiResult.Ok -> {
          messages.say(r.message ?: "Done.")
          load()
        }
      }
    }
  }
}
