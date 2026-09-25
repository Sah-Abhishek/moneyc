package com.sahabhishek.moneycontrol.ui.shell

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sahabhishek.moneycontrol.ui.theme.Ledger
import com.sahabhishek.moneycontrol.ui.theme.mono
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.StateFlow

// components/ui/WriteIndicator.tsx: "Saving…" while anything is being written,
// shown after a short beat so fast saves don't flicker. A 2dp sliding ink bar
// across the top, and the pill at the top (toasts own the bottom on phones).

private const val SHOW_AFTER_MS = 250L

@Composable
fun BoxScope.WriteIndicator(writes: StateFlow<Int>) {
  val c = Ledger.colors
  val busy = writes.collectAsState().value > 0
  var shown by remember { mutableStateOf(false) }
  LaunchedEffect(busy) {
    if (busy) {
      delay(SHOW_AFTER_MS)
      shown = true
    } else shown = false
  }
  if (!shown) return

  val motion = rememberInfiniteTransition(label = "saving")
  val slide by motion.animateFloat(-0.4f, 1f, infiniteRepeatable(tween(1100, easing = LinearEasing)), label = "bar")
  val blink by motion.animateFloat(1f, 0.2f, infiniteRepeatable(tween(450), RepeatMode.Reverse), label = "dot")

  Box(
    Modifier.align(Alignment.TopCenter).fillMaxWidth().height(2.dp).drawBehind {
      drawRect(c.inkBase, topLeft = Offset(size.width * slide, 0f), size = Size(size.width * 0.4f, size.height))
    },
  )
  Row(
    Modifier.align(Alignment.TopCenter).padding(top = 10.dp).background(c.inkBase).padding(horizontal = 14.dp, vertical = 9.dp)
      .semantics { liveRegion = LiveRegionMode.Polite },
    horizontalArrangement = Arrangement.spacedBy(8.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Box(Modifier.size(6.dp).alpha(blink).background(c.paperBase))
    Text("SAVING…", style = mono(10.sp, spacing = 0.12), color = c.paperBase)
  }
}
