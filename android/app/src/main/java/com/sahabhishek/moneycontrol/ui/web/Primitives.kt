package com.sahabhishek.moneycontrol.ui.web

import androidx.annotation.DrawableRes
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sahabhishek.moneycontrol.R
import com.sahabhishek.moneycontrol.ui.theme.Ledger
import com.sahabhishek.moneycontrol.ui.theme.mono
import com.sahabhishek.moneycontrol.ui.theme.sans
import com.sahabhishek.moneycontrol.ui.theme.serif

// The website's shared classes (src/app/globals.css), one composable each.
// Sizes are the CSS px values in dp/sp.

/** color-mix(in srgb, c p%, transparent) */
fun Color.mix(p: Float) = copy(alpha = alpha * p)
/** color-mix(in srgb, c p%, base) */
fun Color.over(base: Color, p: Float) = lerp(base, this, p)

/** The web's phone gutter (--gutter at ≤720px). */
val Gutter = 22.dp

// ─── rules ──────────────────────────────────────────────────────────────────

/** .rule */
@Composable
fun Rule(modifier: Modifier = Modifier, color: Color = Ledger.colors.inkBase, thickness: Dp = 1.dp) =
  Box(modifier.fillMaxWidth().height(thickness).background(color))

/** .rule-hair */
@Composable
fun RuleHair(modifier: Modifier = Modifier) = Rule(modifier, Ledger.colors.ruleHair)

/** .double-rule (heavy over light) and .double-rule.flip (light over heavy) */
@Composable
fun DoubleRule(modifier: Modifier = Modifier, flip: Boolean = false) = Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(3.dp)) {
  Rule(thickness = if (flip) 1.dp else 3.dp)
  Rule(thickness = if (flip) 3.dp else 1.dp)
}

// ─── type voices ────────────────────────────────────────────────────────────

/** .eyebrow — inherits the ink colour unless told otherwise. */
@Composable
fun Eyebrow(text: String, modifier: Modifier = Modifier, color: Color = Ledger.colors.inkBase) =
  Text(text.uppercase(), modifier, style = Ledger.type.eyebrow, color = color, maxLines = 1, overflow = TextOverflow.Ellipsis)

/** .caption */
@Composable
fun Caption(text: String, modifier: Modifier = Modifier, color: Color = Ledger.colors.inkFaint, maxLines: Int = Int.MAX_VALUE) =
  Text(text.uppercase(), modifier, style = Ledger.type.caption, color = color, maxLines = maxLines, overflow = TextOverflow.Ellipsis)

/** .hint — the small mono note under a field. */
@Composable
fun Hint(text: String, modifier: Modifier = Modifier) =
  Text(text, modifier.padding(top = 5.dp), style = mono(9.5.sp, spacing = 0.03), color = Ledger.colors.inkFaint)

/** .page-lede */
@Composable
fun PageLede(text: String, modifier: Modifier = Modifier) =
  Text(text, modifier.widthIn(max = 520.dp).padding(bottom = 24.dp), style = sans(14.sp, lineHeight = 1.6), color = Ledger.colors.inkMuted)

// ─── chips & buttons ────────────────────────────────────────────────────────

/** .chip — aria-current/pressed chips are solid ink. */
@Composable
fun Chip(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, current: Boolean = false, enabled: Boolean = true) {
  val c = Ledger.colors
  Box(
    modifier
      .alpha(if (enabled) 1f else 0.45f)
      .background(if (current) c.inkBase else Color.Transparent)
      .border(1.dp, c.inkBase)
      .clickable(enabled = enabled && !current, role = Role.Button, onClick = onClick)
      .padding(horizontal = 11.dp, vertical = 6.dp),
  ) {
    Text(
      text.uppercase(),
      style = Ledger.type.chip.copy(fontWeight = if (current) FontWeight.Medium else FontWeight.Normal),
      color = if (current) c.paperBase else c.inkMuted,
      maxLines = 1,
    )
  }
}

enum class BtnStyle { Ink, Line, Danger }

/** .btn .btn-ink / .btn-line / .btn-danger */
@Composable
fun Btn(
  text: String,
  onClick: () -> Unit,
  modifier: Modifier = Modifier,
  style: BtnStyle = BtnStyle.Line,
  enabled: Boolean = true,
  @DrawableRes icon: Int? = null,
  iconSize: Dp = 12.dp,
  trailingIcon: Int? = null,
  padding: PaddingValues = PaddingValues(horizontal = 15.dp, vertical = 10.dp),
  textStyle: TextStyle = Ledger.type.button,
  borderColor: Color? = null,
  contentColor: Color? = null,
) {
  val c = Ledger.colors
  val (bg, fg, border) = when (style) {
    BtnStyle.Ink -> Triple(c.inkBase, c.paperBase, c.inkBase)
    BtnStyle.Line -> Triple(Color.Transparent, c.inkBase, c.inkBase)
    BtnStyle.Danger -> Triple(c.spend, c.paperBase, c.spend)
  }
  Row(
    modifier
      .alpha(if (enabled) 1f else 0.5f)
      .background(bg)
      .border(BorderStroke(1.dp, borderColor ?: border))
      .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
      .padding(padding),
    horizontalArrangement = Arrangement.spacedBy(9.dp, Alignment.CenterHorizontally),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    icon?.let { Image(painterResource(it), null, Modifier.size(iconSize)) }
    Text(
      text.uppercase(),
      style = textStyle.copy(fontWeight = if (style == BtnStyle.Line) textStyle.fontWeight ?: FontWeight.Medium else FontWeight.SemiBold),
      color = contentColor ?: fg,
      maxLines = 1,
    )
    trailingIcon?.let { Image(painterResource(it), null, Modifier.size(11.dp)) }
  }
}

/**
 * Destructive actions ask twice, in place (components/ui/Confirm.tsx): the
 * button becomes "question · [Delete] [Cancel]". No dialog.
 */
@Composable
fun ConfirmButton(
  label: String,
  question: String,
  onConfirm: () -> Unit,
  modifier: Modifier = Modifier,
  confirmLabel: String = "Yes",
  pending: Boolean = false,
  style: BtnStyle = BtnStyle.Line,
  borderColor: Color? = null,
  contentColor: Color? = null,
  padding: PaddingValues = PaddingValues(horizontal = 15.dp, vertical = 10.dp),
) {
  var asking by rememberSaveable { mutableStateOf(false) }
  if (!asking) {
    Btn(if (pending) "Working…" else label, { asking = true }, modifier, style, enabled = !pending, borderColor = borderColor, contentColor = contentColor, padding = padding)
    return
  }
  @OptIn(ExperimentalLayoutApi::class)
  FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), itemVerticalAlignment = Alignment.CenterVertically) {
    Text(question, style = mono(10.sp, spacing = 0.06), color = Ledger.colors.spend)
    Btn(confirmLabel, { asking = false; onConfirm() }, style = BtnStyle.Danger)
    Btn("Cancel", { asking = false })
  }
}

// ─── stamps & badges ────────────────────────────────────────────────────────

/** .swatch — a solid square in a tag colour. */
@Composable
fun Swatch(colorName: String, size: Dp = 6.dp) = Box(Modifier.size(size).background(Ledger.colors.stamp(colorName)))

/** .stamp — a tag: tinted fill, tinted border, solid swatch. */
@Composable
fun Stamp(name: String, colorName: String, modifier: Modifier = Modifier, fontSize: TextUnit = 9.sp, spacing: Double = 0.09, onClick: (() -> Unit)? = null) {
  val tone = Ledger.colors.stamp(colorName)
  Row(
    modifier
      .background(tone.mix(0.12f))
      .border(1.dp, tone.mix(if (colorName == "ink") 0.45f else 0.40f))
      .then(if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier)
      .padding(start = 7.dp, end = 9.dp, top = 4.dp, bottom = 4.dp),
    horizontalArrangement = Arrangement.spacedBy(6.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Box(Modifier.size(6.dp).background(tone))
    Text(name.uppercase(), style = mono(fontSize, FontWeight.Medium, spacing), color = tone, maxLines = 1, overflow = TextOverflow.Ellipsis)
  }
}

/** .auto-badge — "● AUTO" / "● WIRE" beside a payee filed from the wire. */
@Composable
fun AutoBadge(auto: Boolean, modifier: Modifier = Modifier) {
  val c = Ledger.colors
  Row(
    modifier.background(c.spendBright.mix(0.18f)).padding(start = 6.dp, end = 7.dp, top = 2.dp, bottom = 2.dp),
    horizontalArrangement = Arrangement.spacedBy(5.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Image(painterResource(R.drawable.ic_auto_dot), null, Modifier.size(4.dp))
    Text(if (auto) "AUTO" else "WIRE", style = mono(8.sp, FontWeight.Medium, 0.12), color = c.spend)
  }
}

// ─── section heads & states ─────────────────────────────────────────────────

/**
 * .section-head — the serif title with its mono dek (`small`), then any
 * controls, which wrap underneath on a phone as they do on the web.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SectionHead(
  title: String,
  modifier: Modifier = Modifier,
  small: String? = null,
  titleSize: TextUnit = 31.sp,
  padding: PaddingValues = PaddingValues(top = 26.dp, bottom = 20.dp),
  afterTitle: (@Composable () -> Unit)? = null,
  controls: (@Composable () -> Unit)? = null,
) = Column(modifier.fillMaxWidth().padding(padding), verticalArrangement = Arrangement.spacedBy(16.dp)) {
  FlowRow(horizontalArrangement = Arrangement.spacedBy(13.dp), verticalArrangement = Arrangement.spacedBy(4.dp), itemVerticalAlignment = Alignment.Bottom) {
    Text(title, Modifier.semantics { heading() }, style = serif(titleSize, -0.01), color = Ledger.colors.inkBase)
    small?.let { Text(it.uppercase(), Modifier.padding(bottom = 3.dp), style = Ledger.type.sectionSmall, color = Ledger.colors.inkFaint) }
    afterTitle?.invoke()
  }
  controls?.invoke()
}

/** .chips — a wrapping row of chips. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun Chips(modifier: Modifier = Modifier, gap: Dp = 7.dp, content: @Composable () -> Unit) =
  FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(gap), verticalArrangement = Arrangement.spacedBy(gap)) { content() }

/** .empty-state — why it's empty, and what to do next. */
@Composable
fun EmptyState(title: String, modifier: Modifier = Modifier, body: String? = null, action: (@Composable () -> Unit)? = null) = Column(modifier.fillMaxWidth()) {
  Column(Modifier.padding(vertical = 36.dp)) {
    Text(title, style = serif(26.sp, lineHeight = 1.1), color = Ledger.colors.inkBase)
    body?.let { Text(it, Modifier.padding(top = 8.dp).widthIn(max = 460.dp), style = sans(14.sp, lineHeight = 1.6), color = Ledger.colors.inkMuted) }
    action?.let {
      Spacer(Modifier.height(16.dp))
      it()
    }
  }
  RuleHair()
}

/** FieldError — the mono message under a field. */
@Composable
fun FieldError(message: String?) {
  if (message.isNullOrBlank()) return
  Text(message, Modifier.padding(top = 4.dp), style = mono(9.5.sp, spacing = 0.04), color = Ledger.colors.spend)
}

/** FormError — a boxed message above a form's buttons. */
@Composable
fun FormError(message: String?, modifier: Modifier = Modifier) {
  if (message.isNullOrBlank()) return
  val c = Ledger.colors
  Text(
    message,
    modifier.fillMaxWidth().background(c.spendBright.mix(0.10f)).border(1.dp, c.spend.mix(0.5f)).padding(horizontal = 12.dp, vertical = 10.dp),
    style = sans(13.sp, lineHeight = 1.45),
    color = c.inkBase,
  )
}

/** A small spacer helper, for reading layouts like the CSS they came from. */
@Composable
fun Gap(h: Dp = 0.dp, w: Dp = 0.dp) = Spacer(Modifier.height(h).width(w))
