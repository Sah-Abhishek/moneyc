package com.sahabhishek.moneycontrol.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.sahabhishek.moneycontrol.R

// Three voices, no more (as on the web): serif for money and titles, sans for
// names and UI, mono for anything the bank would have typed. CSS px map 1:1 to
// sp/dp, and CSS letter-spacing (em) maps to em.

val Serif = FontFamily(
  Font(R.font.instrument_serif_regular, FontWeight.Normal),
  Font(R.font.instrument_serif_italic, FontWeight.Normal, FontStyle.Italic),
)

@OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)
private fun sans(weight: Int) =
  Font(R.font.instrument_sans, FontWeight(weight), variationSettings = FontVariation.Settings(FontVariation.weight(weight)))

val Sans = FontFamily(sans(400), sans(500), sans(600), sans(700))

val Mono = FontFamily(
  Font(R.font.ibm_plex_mono_regular, FontWeight.Normal),
  Font(R.font.ibm_plex_mono_medium, FontWeight.Medium),
  Font(R.font.ibm_plex_mono_semibold, FontWeight.SemiBold),
)

private const val TABULAR = "tnum"

/** body: sans 14, tabular figures. */
val BaseText = TextStyle(fontFamily = Sans, fontSize = 14.sp, fontFeatureSettings = TABULAR)

fun mono(size: TextUnit, weight: FontWeight = FontWeight.Normal, spacing: Double = 0.0, color: Color = Color.Unspecified) =
  TextStyle(fontFamily = Mono, fontWeight = weight, fontSize = size, letterSpacing = spacing.em, color = color, fontFeatureSettings = TABULAR)

fun sans(size: TextUnit, weight: FontWeight = FontWeight.Normal, lineHeight: Double? = null, color: Color = Color.Unspecified, spacing: Double = 0.0) =
  TextStyle(fontFamily = Sans, fontWeight = weight, fontSize = size, color = color, letterSpacing = spacing.em, fontFeatureSettings = TABULAR,
    lineHeight = lineHeight?.let { (size.value * it).sp } ?: TextUnit.Unspecified)

fun serif(size: TextUnit, spacing: Double = 0.0, lineHeight: Double = 1.0, color: Color = Color.Unspecified, italic: Boolean = false) =
  TextStyle(fontFamily = Serif, fontSize = size, letterSpacing = spacing.em, lineHeight = (size.value * lineHeight).sp, color = color,
    fontStyle = if (italic) FontStyle.Italic else FontStyle.Normal, fontFeatureSettings = TABULAR)

/** The web's reusable text classes (globals.css). */
@Immutable
data class LedgerType(
  /** .eyebrow — mono 500 10px 0.14em uppercase */
  val eyebrow: TextStyle = mono(10.sp, FontWeight.Medium, 0.14),
  /** .caption — mono 9px 0.11em uppercase faint */
  val caption: TextStyle = mono(9.sp, spacing = 0.11),
  /** .btn — mono 500 10px 0.12em uppercase */
  val button: TextStyle = mono(10.sp, FontWeight.Medium, 0.12),
  /** .chip — mono 9px 0.11em uppercase */
  val chip: TextStyle = mono(9.sp, spacing = 0.11),
  /** .section-head h2 — serif 31px, -0.01em */
  val sectionTitle: TextStyle = serif(31.sp, -0.01),
  /** .section-head h2 small — mono 10px 0.11em uppercase faint */
  val sectionSmall: TextStyle = mono(10.sp, spacing = 0.11),
)

val LocalLedgerType = staticCompositionLocalOf { LedgerType() }

// Material components (dialogs, menus, pickers) pick these up.
val LedgerTypography = Typography(
  headlineSmall = serif(24.sp),
  titleLarge = serif(24.sp),
  titleMedium = sans(15.sp, FontWeight.SemiBold),
  bodyLarge = sans(15.sp),
  bodyMedium = sans(14.sp),
  bodySmall = sans(13.sp),
  labelLarge = mono(10.sp, FontWeight.Medium, 0.12),
  labelMedium = mono(10.sp, FontWeight.Medium, 0.12),
  labelSmall = mono(9.sp, spacing = 0.11),
)
