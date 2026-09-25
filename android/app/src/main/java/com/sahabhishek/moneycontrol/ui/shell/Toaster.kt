package com.sahabhishek.moneycontrol.ui.shell

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sahabhishek.moneycontrol.data.Messenger
import com.sahabhishek.moneycontrol.data.UiMessage
import com.sahabhishek.moneycontrol.ui.theme.Ledger
import com.sahabhishek.moneycontrol.ui.theme.mono
import com.sahabhishek.moneycontrol.ui.theme.sans
import com.sahabhishek.moneycontrol.ui.web.mix
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// components/ui/Toaster.tsx: confirmations after an action ("Line added · Undo"),
// at most three at once, each gone after seven seconds.

private const val LIFETIME_MS = 7000L
private data class Shown(val id: Long, val msg: UiMessage)

/** Overlays the toasts above the tab bar (bottom: 76px on the web's phone layout). */
@Composable
fun BoxScope.Toaster(messenger: Messenger) {
  val toasts = remember { mutableStateListOf<Shown>() }
  var next by remember { mutableStateOf(1L) }
  LaunchedEffect(messenger) {
    messenger.messages.collect { m ->
      while (toasts.size >= 3) toasts.removeAt(0)
      toasts.add(Shown(next++, m))
    }
  }
  Column(
    Modifier.align(Alignment.BottomCenter).fillMaxWidth()
      .padding(start = 16.dp, end = 16.dp, bottom = 76.dp)
      .semantics { liveRegion = LiveRegionMode.Polite },
    verticalArrangement = Arrangement.spacedBy(8.dp),
  ) {
    toasts.forEach { t -> key(t.id) { ToastItem(t.msg) { toasts.removeAll { it.id == t.id } } } }
  }
}

@Composable
private fun key(id: Long, content: @Composable () -> Unit) = androidx.compose.runtime.key(id) { content() }

@Composable
private fun ToastItem(msg: UiMessage, onDone: () -> Unit) {
  val c = Ledger.colors
  val scope = rememberCoroutineScope()
  var busy by remember { mutableStateOf(false) }
  LaunchedEffect(busy) {
    if (busy) return@LaunchedEffect
    delay(LIFETIME_MS)
    onDone()
  }
  AnimatedVisibility(visible = true, enter = fadeIn(tween(180)) + slideInVertically(tween(180)) { it / 6 }) {
    Box {
      // box-shadow: 4px 4px 0 ink at 18%
      Box(Modifier.matchParentSize().offset(4.dp, 4.dp).background(c.inkBase.mix(0.18f)))
      Row(
        Modifier.fillMaxWidth().background(if (msg.isError) c.spend else c.inkBase).padding(start = 16.dp, end = 12.dp, top = 12.dp, bottom = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Text(msg.text, Modifier.weight(1f), style = sans(13.sp), color = c.paperBase)
        msg.undo?.let { undo ->
          Text(
            if (busy) "…" else msg.actionLabel.uppercase(),
            Modifier.clickable(enabled = !busy, role = Role.Button) {
              busy = true
              scope.launch {
                try { undo() } finally { onDone() }
              }
            }.padding(horizontal = 2.dp, vertical = 4.dp),
            style = mono(10.sp, FontWeight.SemiBold, 0.12).copy(textDecoration = if (msg.isError) TextDecoration.Underline else null),
            color = if (msg.isError) c.paperBase else c.spendBright,
          )
        }
        Box(Modifier.size(24.dp).clickable(role = Role.Button, onClick = onDone).semantics { contentDescription = "Dismiss" }, contentAlignment = Alignment.Center) {
          Text("×", style = sans(18.sp), color = c.paperBase.mix(0.6f))
        }
      }
    }
  }
}
