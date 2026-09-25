package com.sahabhishek.moneycontrol

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.navigation3.rememberViewModelStoreNavEntryDecorator
import androidx.navigation3.runtime.NavBackStack
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.runtime.rememberSaveableStateHolderNavEntryDecorator
import androidx.navigation3.ui.NavDisplay
import com.sahabhishek.moneycontrol.auth.GoogleAuth
import com.sahabhishek.moneycontrol.auth.message
import com.sahabhishek.moneycontrol.auth.rememberGoogleFlow
import com.sahabhishek.moneycontrol.data.api.ApiResult
import com.sahabhishek.moneycontrol.ui.entry.EntryScreen
import com.sahabhishek.moneycontrol.ui.entry.EntryViewModel
import com.sahabhishek.moneycontrol.ui.ledger.LedgerQuery
import com.sahabhishek.moneycontrol.ui.ledger.LedgerScreen
import com.sahabhishek.moneycontrol.ui.ledger.LedgerViewModel
import com.sahabhishek.moneycontrol.ui.reports.ReportsScreen
import com.sahabhishek.moneycontrol.ui.reports.ReportsViewModel
import com.sahabhishek.moneycontrol.ui.settings.SettingsScreen
import com.sahabhishek.moneycontrol.ui.settings.SettingsViewModel
import com.sahabhishek.moneycontrol.ui.shell.Section
import com.sahabhishek.moneycontrol.ui.shell.ShellViewModel
import com.sahabhishek.moneycontrol.ui.signin.SignInScreen
import com.sahabhishek.moneycontrol.ui.signin.SignInViewModel
import com.sahabhishek.moneycontrol.ui.wire.WireScreen
import com.sahabhishek.moneycontrol.ui.wire.WireViewModel
import com.sahabhishek.moneycontrol.util.openWeb
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.scan
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

// Every screen has a key, as every web page has a URL.
@Serializable data class LedgerKey(val query: LedgerQuery? = null) : NavKey
@Serializable data object WireKey : NavKey
@Serializable data object SettingsKey : NavKey
@Serializable data class ReportsKey(val ym: String? = null, val range: String = "6m") : NavKey
@Serializable data class EntryKey(val id: Long) : NavKey
/** "A new line"; `date` (YYYY-MM-DD) pre-fills a past month's day, as /new?date= does. */
@Serializable data class NewEntryKey(val date: String? = null) : NavKey

/** What screens can ask for — the web's links and redirects. */
interface Nav {
  fun section(s: Section)
  fun ledger(q: LedgerQuery?)
  fun entry(id: Long)
  fun newEntry(date: String?)
  fun reports(ym: String?, range: String)
  fun back()
  fun readMail()
  fun reconnect()
}

/** The website, for screens the app doesn't have yet (e.g. "https://moneyc.vercel.app/"). */
val WEB_BASE: String = BuildConfig.API_BASE_URL.removeSuffix("api/v1/")

/** Signed in or not — decided by whether a session token is stored. */
sealed interface Gate {
  data object Unknown : Gate
  data object SignedOut : Gate
  /** `session` changes on every sign-in, so screens from an earlier session are never reused. */
  data class SignedIn(val session: Int) : Gate
}

class GateViewModel(graph: AppGraph) : ViewModel() {
  private var sessions = 0

  val gate: StateFlow<Gate> = graph.account.token
    .map { it != null }
    .scan<Boolean, Gate>(Gate.Unknown) { prev, signedIn ->
      when {
        !signedIn -> Gate.SignedOut
        prev is Gate.SignedIn -> prev
        else -> Gate.SignedIn(++sessions)
      }
    }
    .stateIn(viewModelScope, SharingStarted.Eagerly, Gate.Unknown)
}

@Composable
fun MoneyControlRoot(graph: AppGraph, gateVm: GateViewModel) {
  val gate by gateVm.gate.collectAsStateWithLifecycle()
  when (val g = gate) {
    Gate.Unknown -> Unit // the splash screen stays up
    Gate.SignedOut -> SignInScreen(viewModel(key = "sign-in") { SignInViewModel(graph.google, graph.account) })
    is Gate.SignedIn -> SignedIn(graph, g.session)
  }
}

@Composable
private fun SignedIn(graph: AppGraph, session: Int) {
  val context = LocalContext.current
  val backStack = rememberNavBackStack(LedgerKey())
  val shellVm = viewModel(key = "shell-$session") { ShellViewModel(graph.account, graph.wire, graph.changes, graph.messages) }
  val shell by shellVm.state.collectAsStateWithLifecycle()

  // Read mail when the app comes to the front (if stale), and every ten minutes while it's there.
  val lifecycle = LocalLifecycleOwner.current.lifecycle
  DisposableEffect(lifecycle) {
    val observer = LifecycleEventObserver { _, e ->
      if (e == Lifecycle.Event.ON_RESUME) shellVm.onScreen()
      if (e == Lifecycle.Event.ON_PAUSE) shellVm.offScreen()
    }
    lifecycle.addObserver(observer)
    onDispose { lifecycle.removeObserver(observer) }
  }

  val reconnect = rememberGoogleFlow(graph.google) { step ->
    when (step) {
      is GoogleAuth.Step.NeedsConsent -> Unit
      is GoogleAuth.Step.Failed -> step.reason.message()?.let(graph.messages::error)
      is GoogleAuth.Step.Code -> shellVm.viewModelScope.launch {
        when (val r = graph.account.signIn(step.code)) {
          is ApiResult.Failure -> graph.messages.error(r.error)
          is ApiResult.Ok -> {
            graph.messages.say(if (r.data.gmail) "Gmail reconnected." else "Mail access still isn't allowed — tick “Read your email” on Google's screen.")
            shellVm.refresh()
          }
        }
      }
    }
  }

  val nav = remember(backStack) { AppNav(backStack, { path -> openWeb(context, WEB_BASE + path) }, shellVm::readNow, reconnect) }

  NavDisplay(
    backStack = backStack,
    onBack = { if (backStack.size > 1) backStack.removeLastOrNull() },
    entryDecorators = listOf(rememberSaveableStateHolderNavEntryDecorator(), rememberViewModelStoreNavEntryDecorator()),
    entryProvider = entryProvider {
      entry<LedgerKey> { key ->
        LedgerScreen(shell, nav, viewModel { LedgerViewModel(graph.book, graph.wire, graph.messages, graph.changes) }, key.query)
      }
      entry<EntryKey> { key ->
        EntryScreen(shell, nav, viewModel { EntryViewModel(key.id, "", graph.book, graph.messages) }, isNew = false)
      }
      entry<NewEntryKey> { key ->
        val now = shell.me?.today ?: java.time.LocalDateTime.now().withNano(0).toString()
        // A past month's date comes in at noon, like the web; otherwise now.
        val start = key.date?.takeIf { it <= now.take(10) }?.let { "${it}T12:00:00" } ?: now
        EntryScreen(shell, nav, viewModel { EntryViewModel(null, start, graph.book, graph.messages) }, isNew = true)
      }
      entry<ReportsKey> { key ->
        ReportsScreen(shell, nav, viewModel { ReportsViewModel(graph.book, graph.messages, graph.changes) }, key.ym, key.range)
      }
      entry<SettingsKey> { SettingsScreen(shell, nav, viewModel { SettingsViewModel(graph.account, graph.messages, graph.changes) }) }
      entry<WireKey> { WireScreen(shell, nav, viewModel { WireViewModel(graph.wire, graph.book, graph.messages, graph.changes) }) }
    },
  )
}

private class AppNav(
  private val stack: NavBackStack<NavKey>,
  private val web: (String) -> Unit,
  private val readNow: () -> Unit,
  private val google: () -> Unit,
) : Nav {
  /** A section link: the ledger underneath, the section on top — back returns to the ledger. */
  private fun reset(top: NavKey?) {
    stack.clear()
    stack.add(LedgerKey())
    if (top != null) stack.add(top)
  }

  override fun section(s: Section) = when (s) {
    Section.Ledger -> reset(null)
    Section.Slate -> web("slate")
    Section.Tags -> web("tags")
    Section.Budgets -> web("budgets")
    Section.Rules -> web("rules")
    Section.Wire -> reset(WireKey)
    Section.Reports -> reset(ReportsKey())
    Section.Settings -> reset(SettingsKey)
  }

  override fun ledger(q: LedgerQuery?) {
    // Leaving a line's page (saved, deleted) or Reports returns to the ledger beneath it.
    while (stack.size > 1 && stack.last() !is LedgerKey) stack.removeAt(stack.lastIndex)
    // Like following a link with new ?m&filter&q: the ledger shows the new query.
    if (stack.lastOrNull() is LedgerKey) stack[stack.lastIndex] = LedgerKey(q) else stack.add(LedgerKey(q))
  }

  override fun entry(id: Long) {
    stack.add(EntryKey(id))
  }
  override fun newEntry(date: String?) {
    stack.add(NewEntryKey(date))
  }
  override fun reports(ym: String?, range: String) {
    // Changing month or range on Reports is a new URL for the same page.
    if (stack.lastOrNull() is ReportsKey) stack[stack.lastIndex] = ReportsKey(ym, range) else stack.add(ReportsKey(ym, range))
  }
  override fun back() {
    if (stack.size > 1) stack.removeLastOrNull() else reset(null)
  }
  override fun readMail() = readNow()
  override fun reconnect() = google()
}
