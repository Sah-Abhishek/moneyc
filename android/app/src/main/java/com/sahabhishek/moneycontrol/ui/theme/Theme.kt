package com.sahabhishek.moneycontrol.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.unit.dp

// "Radius 0 everywhere", as globals.css says: every Material shape is square.
private val Square = RoundedCornerShape(0.dp)
private val LedgerShapes = Shapes(extraSmall = Square, small = Square, medium = Square, large = Square, extraLarge = Square)

private fun scheme(c: LedgerColors) = lightColorScheme(
  primary = c.inkBase, onPrimary = c.paperBase,
  primaryContainer = c.paperSunk, onPrimaryContainer = c.inkBase,
  secondary = c.spend, onSecondary = c.paperBase,
  tertiary = c.credit, onTertiary = c.paperBase,
  background = c.paperBase, onBackground = c.inkBase,
  surface = c.paperBase, onSurface = c.inkBase,
  surfaceVariant = c.paperSunk, onSurfaceVariant = c.inkMuted,
  surfaceContainerLowest = c.paperRaised, surfaceContainerLow = c.paperRaised, surfaceContainer = c.paperRaised,
  surfaceContainerHigh = c.paperRaised, surfaceContainerHighest = c.paperSunk,
  inverseSurface = c.inkBase, inverseOnSurface = c.paperBase,
  outline = c.inkBase, outlineVariant = c.ruleHair,
  error = c.spend, onError = c.paperBase,
)

@Composable
fun MoneyControlTheme(content: @Composable () -> Unit) {
  CompositionLocalProvider(LocalLedgerColors provides DayPaper, LocalLedgerType provides LedgerType()) {
    MaterialTheme(colorScheme = scheme(DayPaper), typography = LedgerTypography, shapes = LedgerShapes) {
      // body { font-family: sans; font-size: 14px; color: ink; tabular-nums }
      CompositionLocalProvider(LocalTextStyle provides Ledger.baseText, content = content)
    }
  }
}

/** Shorthand: `Ledger.colors.spend`, `Ledger.type.eyebrow`. */
object Ledger {
  val colors: LedgerColors
    @Composable @ReadOnlyComposable get() = LocalLedgerColors.current
  val type: LedgerType
    @Composable @ReadOnlyComposable get() = LocalLedgerType.current
  val baseText = BaseText
}
