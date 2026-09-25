package com.sahabhishek.moneycontrol.ui.shell

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sahabhishek.moneycontrol.R
import com.sahabhishek.moneycontrol.data.api.Connection
import com.sahabhishek.moneycontrol.data.api.Me
import com.sahabhishek.moneycontrol.ui.theme.Ledger
import com.sahabhishek.moneycontrol.ui.theme.mono
import com.sahabhishek.moneycontrol.ui.theme.sans
import com.sahabhishek.moneycontrol.ui.theme.serif
import com.sahabhishek.moneycontrol.ui.web.DoubleRule
import com.sahabhishek.moneycontrol.ui.web.Gutter
import com.sahabhishek.moneycontrol.ui.web.Rule
import com.sahabhishek.moneycontrol.ui.web.mix
import com.sahabhishek.moneycontrol.ui.web.over
import com.sahabhishek.moneycontrol.util.monthLong
import com.sahabhishek.moneycontrol.util.rupees

// The frame around every signed-in page (app/(book)/layout.tsx): Masthead on
// top, the page, the Colophon, and the fixed tab bar — at the phone layout.

/** The masthead's section links (MastheadClient.tsx SECTIONS, short labels). */
enum class Section(val label: String) { Ledger("Ledger"), Wire("Wire"), Slate("Slate"), Tags("Tags"), Budgets("Budgets"), Reports("Reports"), Rules("Rules"), Settings("Settings") }

private val NAV = listOf(Section.Ledger, Section.Wire, Section.Slate, Section.Tags, Section.Budgets, Section.Reports, Section.Rules)
private val TABS = listOf(
  Triple(Section.Ledger, R.drawable.ic_tab_ledger, 19),
  Triple(Section.Wire, R.drawable.ic_tab_wire, 27),
  Triple(Section.Slate, R.drawable.ic_tab_slate, 19),
  Triple(Section.Tags, R.drawable.ic_tab_tags, 19),
)

/**
 * A signed-in page: the masthead scrolls away with the content (as on the
 * web); the tab bar stays fixed at the bottom.
 */
@Composable
fun Page(
  shell: ShellState,
  current: Section?,
  onSection: (Section) -> Unit,
  onReadMail: () -> Unit,
  onReconnect: () -> Unit,
  scroll: ScrollState = rememberScrollState(),
  content: @Composable ColumnScope.() -> Unit,
) {
  val c = Ledger.colors
  Column(Modifier.fillMaxSize().background(c.paperBase)) {
    Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(scroll)) {
      Masthead(shell, current, onSection, onReadMail, onReconnect)
      content()
      shell.me?.let { Colophon(it) }
    }
    TabBar(current, shell.me?.waiting ?: 0, onSection)
  }
}

@Composable
private fun Masthead(shell: ShellState, current: Section?, onSection: (Section) -> Unit, onReadMail: () -> Unit, onReconnect: () -> Unit) {
  val c = Ledger.colors
  val me = shell.me
  Column(Modifier.fillMaxWidth().padding(top = 16.dp)) {
    Row(
      Modifier.fillMaxWidth().padding(start = Gutter, end = Gutter, bottom = 14.dp),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Column(Modifier.clickable(role = Role.Button) { onSection(Section.Ledger) }, verticalArrangement = Arrangement.spacedBy(1.dp)) {
        val issue = me?.today?.substring(5, 7) ?: "  "
        Text("PERSONAL LEDGER · NO. $issue", style = mono(8.sp, FontWeight.Medium, 0.16), color = c.inkMuted)
        Text("Money Control", style = serif(30.sp, -0.02, 1.04), color = c.inkBase)
      }
      Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
        if (me != null) WireChip(me.connection, shell.phase, onReadMail, onReconnect)
        val initial = me?.user?.let { (it.name ?: it.email).trim().firstOrNull()?.uppercaseChar()?.toString() } ?: " "
        Box(
          Modifier.size(36.dp).background(c.inkBase).clickable(role = Role.Button) { onSection(Section.Settings) }
            .semantics { contentDescription = "Your account and settings" },
          contentAlignment = Alignment.Center,
        ) { Text(initial, style = serif(19.sp), color = c.paperBase) }
      }
    }
    DoubleRule()
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(22.dp)) {
      NAV.forEach { s ->
        val on = s == current
        Column(Modifier.clickable(role = Role.Tab) { onSection(s) }.padding(top = 14.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
          Row(horizontalArrangement = Arrangement.spacedBy(7.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(s.label.uppercase(), style = mono(10.sp, if (on) FontWeight.SemiBold else FontWeight.Normal, 0.12), color = if (on) c.inkBase else c.inkMuted, maxLines = 1)
            val waiting = me?.waiting ?: 0
            if (s == Section.Wire && waiting > 0) {
              Box(Modifier.height(16.dp).widthIn(min = 16.dp).background(c.spend).padding(horizontal = 3.dp), contentAlignment = Alignment.Center) {
                Text(if (waiting > 99) "99+" else "$waiting", style = mono(9.sp, FontWeight.SemiBold), color = c.paperBase)
              }
            }
          }
          Box(Modifier.fillMaxWidth().height(3.dp).background(if (on) c.spend else Color.Transparent))
        }
      }
    }
    Rule()
  }
}

/** The masthead chip: live / reading / retry / reconnect / offline (WireStatus.tsx, phone size). */
@Composable
private fun WireChip(connection: Connection, phase: SyncPhase, onReadMail: () -> Unit, onReconnect: () -> Unit) {
  val c = Ledger.colors
  val (text, tone, action) = when {
    connection == Connection.NotConfigured -> Triple("Wire offline", null, null)
    connection == Connection.NoGmailScope -> Triple("Allow mail access", c.pending, onReconnect)
    connection == Connection.Reconnect -> Triple("Reconnect Gmail", c.pending, onReconnect)
    phase == SyncPhase.Syncing -> Triple("Reading mail…", c.spend, null)
    phase == SyncPhase.Error -> Triple("Retry", c.pending, onReadMail)
    else -> Triple("Live", c.spend, onReadMail)
  }
  val live = connection == Connection.Connected && phase != SyncPhase.Error
  val pulse by rememberInfiniteTransition(label = "live").animateFloat(
    1f, 0.35f, infiniteRepeatable(tween(if (phase == SyncPhase.Syncing) 450 else 1200), RepeatMode.Reverse), label = "dot",
  )
  Row(
    Modifier
      .then(if (tone != null) Modifier.background((if (tone == c.spend) c.spendBright else tone).mix(0.14f)).border(1.dp, tone.mix(if (tone == c.spend) 0.4f else 0.6f)) else Modifier.border(1.dp, c.ruleHair))
      .then(if (action != null) Modifier.clickable(role = Role.Button, onClick = action) else Modifier)
      .padding(horizontal = 9.dp, vertical = 6.dp),
    horizontalArrangement = Arrangement.spacedBy(8.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    if (live) Image(painterResource(R.drawable.ic_live_dot), null, Modifier.size(7.dp).alpha(pulse))
    Text(text.uppercase(), style = mono(9.sp, FontWeight.Medium, 0.11), color = tone ?: c.inkFaint, maxLines = 1)
  }
}

/** Colophon.tsx */
@Composable
private fun Colophon(me: Me) {
  val c = Ledger.colors
  Column(Modifier.fillMaxWidth().padding(start = Gutter, end = Gutter, bottom = 40.dp)) {
    DoubleRule(flip = true)
    Column(Modifier.padding(top = 18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      val style = mono(9.sp, spacing = 0.12)
      Text("MONEY CONTROL — A PERSONAL LEDGER", style = style, color = c.inkMuted)
      Text("KEEPING THE BOOK SINCE ${monthLong(me.user.createdAt.take(7))} ${me.user.createdAt.take(4)}", style = style, color = c.inkFaint)
      Text("${me.book.entries} ${if (me.book.entries == 1) "ENTRY" else "ENTRIES"} · ₹${rupees(me.book.tracked)} TRACKED", style = style, color = c.inkFaint)
    }
  }
}

/** Mobile.tsx TabBar — fixed at the bottom on phones. */
@Composable
private fun TabBar(current: Section?, waiting: Int, onSection: (Section) -> Unit) {
  val c = Ledger.colors
  Column(Modifier.fillMaxWidth().background(c.paperBase)) {
    Rule()
    Row(
      Modifier.fillMaxWidth().padding(start = 34.dp, end = 34.dp, top = 12.dp, bottom = 8.dp),
      horizontalArrangement = Arrangement.SpaceBetween,
    ) {
      TABS.forEach { (s, icon, w) ->
        val on = s == current
        Column(
          Modifier.widthIn(min = 44.dp).clickable(role = Role.Tab) { onSection(s) }
            .semantics { if (s == Section.Wire && waiting > 0) contentDescription = "Wire ($waiting waiting)" },
          horizontalAlignment = Alignment.CenterHorizontally,
          verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
          // With nothing waiting, the wire icon's red dot is clipped off (.noDot).
          val clip = s == Section.Wire && waiting == 0
          Box(Modifier.size(width = (if (clip) w - 8 else w).dp, height = 19.dp).clipToBounds()) {
            // Laid out at full width and cut on the right, so the dot is hidden rather than the icon squeezed.
            Image(
              painterResource(icon), null,
              Modifier.wrapContentWidth(Alignment.Start, unbounded = true).requiredSize(width = w.dp, height = 19.dp),
              contentScale = ContentScale.FillBounds,
            )
          }
          Text(s.label.uppercase(), style = mono(8.sp, if (on) FontWeight.SemiBold else FontWeight.Normal, 0.11), color = if (on) c.inkBase else c.inkFaint)
          Box(Modifier.size(width = 14.dp, height = 2.5.dp).background(if (on) c.spend else Color.Transparent))
        }
      }
    }
  }
}

/** Mobile.tsx WireAlert — the strip on the ledger when mail is waiting. */
@Composable
fun WireAlert(waiting: Int, banks: List<String>, onOpen: () -> Unit) {
  if (waiting == 0) return
  val c = Ledger.colors
  Column(Modifier.fillMaxWidth().padding(bottom = 18.dp)) {
    Row(
      Modifier.fillMaxWidth().background(c.spendBright.over(c.paperBase, 0.2f))
        .clickable(role = Role.Button, onClick = onOpen).padding(start = Gutter, end = 20.dp, top = 14.dp, bottom = 14.dp),
      horizontalArrangement = Arrangement.spacedBy(12.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Column(Modifier.weight(1f)) {
        Text("$waiting mail${if (waiting == 1) "" else "s"} waiting in the wire", style = sans(14.sp, FontWeight.SemiBold), color = c.inkBase)
        Text("${banks.take(4).joinToString(" · ")}  —  tap to file them", Modifier.padding(top = 3.dp), style = mono(9.sp, spacing = 0.02), color = c.inkMuted)
      }
      Image(painterResource(R.drawable.ic_arrow_alert), null, Modifier.size(15.dp))
    }
    Rule()
  }
}

/** The page's own content width on a phone: the web's gutter either side. */
fun Modifier.gutter() = this.padding(horizontal = Gutter)

