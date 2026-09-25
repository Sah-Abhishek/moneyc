package com.sahabhishek.moneycontrol.ui.web

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.takeOrElse
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sahabhishek.moneycontrol.R
import com.sahabhishek.moneycontrol.ui.theme.Ledger
import com.sahabhishek.moneycontrol.ui.theme.mono
import com.sahabhishek.moneycontrol.ui.theme.sans

// Forms — "ruled lines, not boxes" (globals.css .form-rows / .form-row / .input
// / .select / .segmented), at the phone layout: the label sits above the field.

/** .form-row */
@Composable
fun FormRow(label: String, modifier: Modifier = Modifier, content: @Composable () -> Unit) = Column(modifier.fillMaxWidth()) {
  Column(Modifier.fillMaxWidth().heightIn(min = 54.dp).padding(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
    Text(label.uppercase(), style = mono(9.sp, FontWeight.Medium, 0.14), color = Ledger.colors.inkFaint)
    content()
  }
  RuleHair()
}

/** .input (and .input.mono) — a single-line text field. */
@Composable
fun WebInput(
  value: String,
  onValueChange: (String) -> Unit,
  modifier: Modifier = Modifier,
  placeholder: String = "",
  monoFace: Boolean = false,
  invalid: Boolean = false,
  keyboardType: KeyboardType = KeyboardType.Text,
  imeAction: ImeAction = ImeAction.Next,
  onDone: (() -> Unit)? = null,
  maxLength: Int = 280,
  singleLine: Boolean = true,
  minLines: Int = 1,
) {
  val c = Ledger.colors
  val source = remember { MutableInteractionSource() }
  val focused by source.collectIsFocusedAsState()
  val style = if (monoFace) mono(13.sp) else sans(15.sp)
  BasicTextField(
    value = value,
    onValueChange = { if (it.length <= maxLength) onValueChange(it) },
    modifier = modifier
      .fillMaxWidth()
      .heightIn(min = 36.dp)
      .background(c.paperRaised)
      .border(if (focused) 2.dp else 1.dp, if (invalid) c.spend else if (focused) c.inkBase else c.ruleHair),
    textStyle = style.copy(color = c.inkBase),
    singleLine = singleLine,
    minLines = minLines,
    cursorBrush = SolidColor(c.inkBase),
    interactionSource = source,
    keyboardOptions = KeyboardOptions(keyboardType = keyboardType, imeAction = imeAction),
    keyboardActions = KeyboardActions(onDone = { onDone?.invoke() }, onGo = { onDone?.invoke() }, onSend = { onDone?.invoke() }),
    decorationBox = { inner ->
      Box(Modifier.padding(horizontal = 10.dp, vertical = 7.dp), contentAlignment = Alignment.CenterStart) {
        if (value.isEmpty()) Text(placeholder, style = style, color = c.inkFaint)
        inner()
      }
    },
  )
}

enum class Chevron { Native, Ochre, None }

/** One choice in a [WebSelect]; `group` headers mirror the web's <optgroup>. */
data class Option<T>(val value: T, val label: String, val group: String? = null)

/** .select — shows the chosen option; tapping opens the list (the native <select>). */
@Composable
fun <T> WebSelect(
  options: List<Option<T>>,
  selected: T,
  onSelect: (T) -> Unit,
  modifier: Modifier = Modifier,
  monoFace: Boolean = false,
  fill: Boolean = true,
  textStyle: TextStyle? = null,
  /** replaces the .select box look (border, fill, padding); the tap-to-open stays */
  look: Modifier? = null,
  /** show the chosen value in capitals (stamps), as CSS text-transform does */
  uppercase: Boolean = false,
  /** the arrow: the browser's dark one (default), the slip's ochre "pick a tag" one, or none */
  chevron: Chevron = Chevron.Native,
) {
  val c = Ledger.colors
  var open by remember { mutableStateOf(false) }
  val style = textStyle ?: if (monoFace) mono(13.sp) else sans(15.sp)
  Box(modifier) {
    Row(
      (if (fill) Modifier.fillMaxWidth() else Modifier)
        .clickable(role = Role.DropdownList) { open = true }
        .then(look ?: Modifier.heightIn(min = 36.dp).background(c.paperRaised).border(1.dp, c.ruleHair).padding(horizontal = 10.dp, vertical = 7.dp)),
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      Text(
        (options.firstOrNull { it.value == selected }?.label ?: "").let { if (uppercase) it.uppercase() else it },
        if (fill) Modifier.weight(1f) else Modifier,
        style = style,
        color = style.color.takeOrElse { c.inkBase },
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
      )
      when (chevron) {
        Chevron.Native -> Image(painterResource(R.drawable.ic_chevron_down), null, Modifier.size(9.dp), colorFilter = ColorFilter.tint(c.inkBase))
        Chevron.Ochre -> Image(painterResource(R.drawable.ic_chevron_down), null, Modifier.size(9.dp))
        Chevron.None -> Unit
      }
    }
    DropdownMenu(open, { open = false }, containerColor = c.paperRaised) {
      var lastGroup: String? = null
      options.forEach { o ->
        if (o.group != null && o.group != lastGroup) {
          lastGroup = o.group
          Text(o.group, Modifier.padding(horizontal = 12.dp, vertical = 6.dp), style = sans(13.sp, FontWeight.SemiBold), color = c.inkMuted)
        }
        DropdownMenuItem(
          text = { Text(o.label, style = style, color = if (o.value == selected) c.inkBase else c.inkMuted) },
          onClick = { open = false; onSelect(o.value) },
          modifier = if (o.group != null) Modifier.padding(start = 8.dp) else Modifier,
        )
      }
    }
  }
}

/** .segmented — radio choices as joined ink boxes (UPI / CARD / CASH, Went out / Came in). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun <T> Segmented(options: List<Pair<T, String>>, selected: T?, onSelect: (T) -> Unit, modifier: Modifier = Modifier) {
  val c = Ledger.colors
  FlowRow(modifier) {
    options.forEachIndexed { i, (value, label) ->
      val on = value == selected
      Box(
        Modifier
          .offset(x = (-i).dp) // margin-left: -1px, so neighbouring borders overlap
          .background(if (on) c.inkBase else Color.Transparent)
          .border(1.dp, c.inkBase)
          .selectable(on, role = Role.RadioButton) { onSelect(value) }
          .padding(horizontal = 14.dp, vertical = 8.dp),
      ) {
        Text(label.uppercase(), style = mono(9.5.sp, if (on) FontWeight.SemiBold else FontWeight.Normal, 0.12), color = if (on) c.paperBase else c.inkMuted)
      }
    }
  }
}

/** The auto-file switch (WireControls.module.css .toggle): a square ink track. */
@Composable
fun Toggle(label: String, on: Boolean, onChange: (Boolean) -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
  val c = Ledger.colors
  Row(
    modifier.alpha(if (enabled) 1f else 0.5f).toggleable(value = on, enabled = enabled, role = Role.Switch, onValueChange = onChange),
    horizontalArrangement = Arrangement.spacedBy(10.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Text(label.uppercase(), style = mono(9.5.sp, FontWeight.Medium, 0.12), color = c.inkBase)
    Row(
      Modifier.width(34.dp).heightIn(min = 20.dp).background(if (on) c.inkBase else c.paperRaised).border(1.5.dp, c.inkBase).padding(3.5.dp),
      horizontalArrangement = if (on) Arrangement.End else Arrangement.Start,
    ) {
      Box(Modifier.width(14.dp).heightIn(min = 13.dp).background(if (on) c.paperBase else c.inkBase))
    }
  }
}

/** .field — a small faint label over its control (tags, rules, slate forms). */
@Composable
fun LabeledField(label: String, modifier: Modifier = Modifier, content: @Composable () -> Unit) =
  Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(7.dp)) {
    Text(label.uppercase(), style = mono(9.sp, FontWeight.Medium, 0.14), color = Ledger.colors.inkFaint)
    content()
  }

/** TagEditor.tsx ColorPicker: 26px squares — colour, a 2px paper ring, and an ink ring when chosen. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ColorPicker(selected: String, onSelect: (String) -> Unit) {
  val c = Ledger.colors
  FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
    listOf("spend" to "Vermillion", "ink" to "Ink", "pending" to "Ochre", "plum" to "Plum", "teal" to "Teal", "indigo" to "Indigo", "credit" to "Green", "faint" to "Stone")
      .forEach { (name, label) ->
        val tone = c.stamp(name)
        Box(
          Modifier.size(26.dp)
            .background(if (name == selected) c.inkBase else tone)
            .padding(2.dp).background(c.paperBase).padding(2.dp).background(tone)
            .selectable(name == selected, role = Role.RadioButton) { onSelect(name) }
            .semantics { contentDescription = label },
        )
      }
  }
}
