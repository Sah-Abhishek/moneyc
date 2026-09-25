package com.sahabhishek.moneycontrol.ui.web

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.sahabhishek.moneycontrol.ui.theme.Ledger

// app/(book)/loading.tsx and error.tsx.

/** .skeleton — a shimmering block that holds a shape while data loads. */
@Composable
fun Skeleton(height: Dp, modifier: Modifier = Modifier, widthFraction: Float = 1f, alpha: Float = 1f) {
  val c = Ledger.colors
  val shift by rememberInfiniteTransition(label = "shimmer").animateFloat(0f, 1f, infiniteRepeatable(tween(1400, easing = LinearEasing), RepeatMode.Restart), label = "x")
  val mid = c.paperSunk.over(c.paperBase, 0.5f)
  Box(
    modifier.fillMaxWidth(widthFraction).height(height).alpha(alpha).background(
      Brush.linearGradient(listOf(c.paperSunk, mid, c.paperSunk), start = Offset(-1000f + 2000f * shift, 0f), end = Offset(1000f * shift + 1000f, 0f)),
    ),
  )
}

/** loading.tsx — keeps the page's shape so nothing jumps. */
@Composable
fun LoadingPage() = Column(Modifier.fillMaxWidth().padding(horizontal = Gutter).padding(top = 32.dp).semantics { contentDescription = "Loading…" }) {
  Skeleton(300.dp)
  Skeleton(24.dp, Modifier.padding(top = 32.dp), widthFraction = 0.4f)
  repeat(6) { i -> Skeleton(44.dp, Modifier.padding(top = 10.dp), alpha = 1f - i * 0.13f) }
}

/** error.tsx — the page didn't load; the book is safe. */
@Composable
fun ErrorPage(reason: String, onRetry: () -> Unit, onLedger: (() -> Unit)?) = Column(Modifier.fillMaxWidth().padding(horizontal = Gutter).padding(top = 48.dp)) {
  EmptyState(
    title = "This page didn't load.",
    body = "$reason Your book is safe — nothing was changed.",
    action = {
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Btn("Try again", onRetry, style = BtnStyle.Ink)
        onLedger?.let { Btn("Back to the ledger", it) }
      }
    },
  )
}
