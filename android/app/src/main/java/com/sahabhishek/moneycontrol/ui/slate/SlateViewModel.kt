package com.sahabhishek.moneycontrol.ui.slate

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sahabhishek.moneycontrol.data.BookChanges
import com.sahabhishek.moneycontrol.data.Messenger
import com.sahabhishek.moneycontrol.data.SlateRepository
import com.sahabhishek.moneycontrol.data.api.Account
import com.sahabhishek.moneycontrol.data.api.AccountDetail
import com.sahabhishek.moneycontrol.data.api.ApiResult
import com.sahabhishek.moneycontrol.data.api.Reminder
import com.sahabhishek.moneycontrol.data.api.SlateData
import com.sahabhishek.moneycontrol.util.rupeesExact
import java.util.UUID
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class Status(val pending: Boolean = false, val error: String? = null, val fieldErrors: Map<String, String> = emptyMap())

/** "Lend to someone" / "Record something you borrowed". */
data class NewAccountForm(
  val open: Boolean = false,
  val direction: String = "gave",
  val name: String = "",
  val amount: String = "",
  val lineNote: String = "",
  val occurredAt: String = "",
  val phone: String = "",
)

/** A line on the open account. */
data class LineForm(val direction: String = "gave", val amount: String = "", val note: String = "", val occurredAt: String = "")

/** Settle up, in full or in part: what came back, and the day the rest was promised by ("" = none). */
data class SettleForm(val open: Boolean = false, val amount: String = "", val promisedBy: String = "")

data class PersonForm(val open: Boolean = false, val name: String = "", val matchNames: String = "", val phone: String = "", val note: String = "")

data class SlateState(
  val data: SlateData? = null,
  val loadError: String? = null,
  val showArchived: Boolean = false,
  /** the account on show below the pages */
  val openId: Long? = null,
  val detail: AccountDetail? = null,
  val newAccount: NewAccountForm = NewAccountForm(),
  val newStatus: Status = Status(),
  val line: LineForm = LineForm(),
  val lineStatus: Status = Status(),
  val settle: SettleForm = SettleForm(),
  val settleStatus: Status = Status(),
  val person: PersonForm = PersonForm(),
  val personStatus: Status = Status(),
  val busy: String? = null,
  /** the user's calendar day, "YYYY-MM-DD": promises before it are late */
  val today: String = "",
)

/** app/(book)/slate/page.tsx and the components in components/slate. */
class SlateViewModel(private val slate: SlateRepository, private val messages: Messenger, changes: BookChanges) : ViewModel() {
  private val _state = MutableStateFlow(SlateState())
  val state: StateFlow<SlateState> = _state.asStateFlow()
  private var now: String = ""
  private var requested: Long? = null
  private var newKey = UUID.randomUUID().toString()
  private var lineKey = UUID.randomUUID().toString()
  private var settleKey = UUID.randomUUID().toString()
  private var job: Job? = null

  /** One-off requests for the screen: open WhatsApp with this link, or copy this text. */
  private val _outbox = MutableStateFlow<Pair<String, Reminder>?>(null)
  val outbox: StateFlow<Pair<String, Reminder>?> = _outbox.asStateFlow()
  fun outboxHandled() {
    _outbox.value = null
  }

  init {
    viewModelScope.launch { changes.changes.collect { load() } }
  }

  /** `personId`: the account asked for (?person=); `now`: the user's wall clock, for new lines. */
  fun show(personId: Long?, now: String) {
    this.now = now
    if (_state.value.today != now.take(10)) _state.update { it.copy(today = now.take(10)) }
    if (requested == personId && _state.value.data != null) return
    requested = personId
    _state.update {
      it.copy(
        newAccount = it.newAccount.copy(occurredAt = it.newAccount.occurredAt.ifEmpty { now.take(16) }),
        line = it.line.copy(occurredAt = it.line.occurredAt.ifEmpty { now.take(16) }),
      )
    }
    load()
  }

  fun load() {
    job?.cancel()
    job = viewModelScope.launch {
      when (val r = slate.load()) {
        is ApiResult.Failure -> _state.update { it.copy(loadError = r.error) }
        is ApiResult.Ok -> {
          val everyone = r.data.accounts
          val active = everyone.filter { !it.archived }
          // The open account: the one asked for, else the oldest debt owed to you.
          val openId = requested?.takeIf { id -> everyone.any { it.id == id } }
            ?: active.filter { it.balance != 0L }.maxByOrNull { it.ageDays ?: 0 }?.id
          _state.update { it.copy(data = r.data, loadError = null, openId = openId, detail = it.detail?.takeIf { d -> d.account.id == openId }) }
          openId?.let { loadAccount(it) }
        }
      }
    }
  }

  private suspend fun loadAccount(id: Long) {
    when (val r = slate.account(id)) {
      is ApiResult.Failure -> messages.error(r.error)
      is ApiResult.Ok -> _state.update {
        val b = r.data.account.balance
        val switched = it.detail?.account?.id != id
        it.copy(
          detail = r.data,
          line = if (switched) LineForm(direction = if (b > 0) "got" else "gave", occurredAt = now.take(16)) else it.line,
          person = if (switched) PersonForm() else it.person,
        )
      }
    }
  }

  fun openAccount(id: Long) {
    requested = id
    _state.update { it.copy(openId = id, settle = SettleForm(), settleStatus = Status()) }
    viewModelScope.launch { loadAccount(id) }
  }

  fun toggleArchived() = _state.update { it.copy(showArchived = !it.showArchived) }

  fun editNew(f: (NewAccountForm) -> NewAccountForm) = _state.update { it.copy(newAccount = f(it.newAccount)) }
  fun editLine(f: (LineForm) -> LineForm) = _state.update { it.copy(line = f(it.line)) }
  fun editPerson(f: (PersonForm) -> PersonForm) = _state.update { it.copy(person = f(it.person)) }

  fun openPersonEditor(a: Account) = _state.update {
    it.copy(person = if (it.person.open) PersonForm() else PersonForm(true, a.name, a.matchNames.joinToString("\n"), a.phone.orEmpty(), a.note.orEmpty()), personStatus = Status())
  }

  fun createAccount() {
    val f = _state.value.newAccount
    if (_state.value.newStatus.pending) return
    _state.update { it.copy(newStatus = Status(pending = true)) }
    viewModelScope.launch {
      when (val r = slate.open(f.name, f.direction, f.amount, f.lineNote, f.occurredAt, f.phone, newKey)) {
        is ApiResult.Failure -> _state.update { it.copy(newStatus = Status(error = r.error, fieldErrors = r.fieldErrors)) }
        is ApiResult.Ok -> {
          newKey = UUID.randomUUID().toString()
          _state.update { it.copy(newStatus = Status(), newAccount = NewAccountForm(occurredAt = now.take(16))) }
          messages.say(r.message ?: "Account opened.")
          openAccount(r.data.account.id)
        }
      }
    }
  }

  fun recordLine() {
    val id = _state.value.openId ?: return
    val f = _state.value.line
    if (_state.value.lineStatus.pending) return
    _state.update { it.copy(lineStatus = Status(pending = true)) }
    viewModelScope.launch {
      when (val r = slate.addLine(id, f.amount, f.direction, f.occurredAt, f.note, lineKey)) {
        is ApiResult.Failure -> _state.update { it.copy(lineStatus = Status(error = r.error, fieldErrors = r.fieldErrors)) }
        is ApiResult.Ok -> {
          lineKey = UUID.randomUUID().toString()
          _state.update { it.copy(lineStatus = Status(), line = LineForm(direction = f.direction, occurredAt = now.take(16)), detail = r.data) }
          messages.say(r.message ?: "Recorded.")
        }
      }
    }
  }

  /** Opens Settle up with the whole balance filled in; again closes it. */
  fun toggleSettle(a: Account) = _state.update {
    it.copy(
      settle = if (it.settle.open) SettleForm() else SettleForm(open = true, amount = rupeesExact(kotlin.math.abs(a.balance))),
      settleStatus = Status(),
    )
  }

  fun editSettle(f: (SettleForm) -> SettleForm) = _state.update { it.copy(settle = f(it.settle)) }

  /** Settles in full, or in part leaving the rest on the slate (maybe promised by a day). */
  fun settleUp(a: Account) {
    val f = _state.value.settle
    if (_state.value.settleStatus.pending) return
    _state.update { it.copy(settleStatus = Status(pending = true)) }
    viewModelScope.launch {
      when (val r = slate.settle(a.id, f.amount, f.promisedBy.ifEmpty { null }, now.take(16), settleKey)) {
        is ApiResult.Failure -> _state.update { it.copy(settleStatus = Status(error = r.error, fieldErrors = r.fieldErrors)) }
        is ApiResult.Ok -> {
          settleKey = UUID.randomUUID().toString()
          _state.update { it.copy(settle = SettleForm(), settleStatus = Status(), detail = r.data) }
          messages.say(r.message ?: "Recorded.")
        }
      }
    }
  }

  /** Takes back a promise to pay the rest; the balance itself stays. */
  fun clearPromise(a: Account) {
    if (_state.value.busy != null) return
    _state.update { it.copy(busy = "promise-${a.id}") }
    viewModelScope.launch {
      val r = slate.clearPromise(a.id)
      _state.update { it.copy(busy = null) }
      when (r) {
        is ApiResult.Failure -> messages.error(r.error)
        is ApiResult.Ok -> {
          _state.update { it.copy(detail = r.data) }
          messages.say(r.message ?: "Promise removed.")
        }
      }
    }
  }

  /** Records the reminder, then hands it to the screen to send (WhatsApp) or copy. Nothing is sent automatically. */
  fun remind(a: Account) {
    if (_state.value.busy != null) return
    _state.update { it.copy(busy = "remind-${a.id}") }
    viewModelScope.launch {
      val r = slate.remind(a.id)
      _state.update { it.copy(busy = null) }
      when (r) {
        is ApiResult.Failure -> messages.error(r.error)
        is ApiResult.Ok -> _outbox.value = a.name to r.data
      }
    }
  }

  fun deleteLine(id: Long) {
    viewModelScope.launch {
      when (val r = slate.deleteLine(id)) {
        is ApiResult.Failure -> messages.error(r.error)
        is ApiResult.Ok -> messages.say(r.message ?: "Removed.")
      }
    }
  }

  fun savePerson() {
    val id = _state.value.openId ?: return
    val f = _state.value.person
    _state.update { it.copy(personStatus = Status(pending = true)) }
    viewModelScope.launch {
      when (val r = slate.update(id, f.name, f.matchNames, f.phone, f.note)) {
        is ApiResult.Failure -> _state.update { it.copy(personStatus = Status(error = r.error, fieldErrors = r.fieldErrors)) }
        is ApiResult.Ok -> {
          _state.update { it.copy(personStatus = Status(), person = PersonForm(), detail = r.data) }
          messages.say(r.message ?: "Saved.")
        }
      }
    }
  }

  fun archive(a: Account) {
    viewModelScope.launch {
      when (val r = slate.archive(a.id, !a.archived)) {
        is ApiResult.Failure -> messages.error(r.error)
        is ApiResult.Ok -> messages.say(r.message ?: "Done.")
      }
    }
  }

  fun removeAccount(a: Account) {
    viewModelScope.launch {
      when (val r = slate.delete(a.id)) {
        is ApiResult.Failure -> messages.error(r.error)
        is ApiResult.Ok -> {
          requested = null
          _state.update { it.copy(openId = null, detail = null) }
          messages.say(r.message ?: "Removed.")
        }
      }
    }
  }
}
