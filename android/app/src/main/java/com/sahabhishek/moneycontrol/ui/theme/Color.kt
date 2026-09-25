package com.sahabhishek.moneycontrol.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

// "Ledger Broadsheet": paper, ink and a few signal colours — the same tokens as
// the website's globals.css. Like the website, there is one (light) palette.

@Immutable
data class LedgerColors(
  val paperBase: Color,
  val paperRaised: Color,
  val paperSunk: Color,
  val ruleHair: Color,
  val inkFaint: Color,
  val inkMuted: Color,
  val inkBase: Color,
  val spend: Color,
  val spendBright: Color,
  val credit: Color,
  val pending: Color,
  val indigo: Color,
  val plum: Color,
  val teal: Color,
) {
  /** A tag's stamp colour, by the colour name the server stores. */
  fun stamp(name: String): Color = when (name) {
    "spend" -> spend
    "ink" -> inkBase
    "pending" -> pending
    "plum" -> plum
    "teal" -> teal
    "indigo" -> indigo
    "credit" -> credit
    else -> inkFaint
  }
}

val DayPaper = LedgerColors(
  paperBase = Color(0xFFF4F1E8),
  paperRaised = Color(0xFFFBF9F3),
  paperSunk = Color(0xFFEAE5D7),
  ruleHair = Color(0xFFD8D2C0),
  inkFaint = Color(0xFF8F8B79),
  inkMuted = Color(0xFF5C594B),
  inkBase = Color(0xFF16150F),
  spend = Color(0xFFD8401C),
  spendBright = Color(0xFFF2613C),
  credit = Color(0xFF2E5D3F),
  pending = Color(0xFFB8860F),
  indigo = Color(0xFF3B4B7C),
  plum = Color(0xFF6E3A57),
  teal = Color(0xFF1F5F5B),
)

val LocalLedgerColors = staticCompositionLocalOf { DayPaper }
