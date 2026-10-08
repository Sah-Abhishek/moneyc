package com.sahabhishek.moneycontrol.ui.web

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sahabhishek.moneycontrol.data.api.PayeeHistory
import com.sahabhishek.moneycontrol.ui.theme.Ledger
import com.sahabhishek.moneycontrol.ui.theme.mono

// components/PastUses.tsx: what a payee was paid for, and how it was tagged,
// the last times — chips under the fields, so a regular payment is one tap.

private fun times(n: Int) = "$n time${if (n == 1) "" else "s"}"

/** "BEFORE  MILK  BREAD" under What for. Tapping one fills it in. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ItemChips(history: PayeeHistory?, value: String, onPick: (String) -> Unit, modifier: Modifier = Modifier) {
  if (history == null || history.items.isEmpty()) return
  val c = Ledger.colors
  val now = value.trim().lowercase()
  PastRow("BEFORE", modifier) {
    history.items.forEach { i ->
      val on = i.text.lowercase() == now
      Box(
        Modifier
          .background(if (on) c.inkBase else Color.Transparent)
          .border(1.dp, c.inkBase)
          .clickable(role = Role.Button) { onPick(i.text) }
          .semantics {
            selected = on
            contentDescription = "${i.text}, used ${times(i.uses)}"
          }
          .padding(horizontal = 9.dp, vertical = 4.dp),
      ) {
        Text(
          i.text.uppercase(),
          style = Ledger.type.chip.copy(fontWeight = if (on) FontWeight.Medium else FontWeight.Normal),
          color = if (on) c.paperBase else c.inkMuted,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis,
        )
      }
    }
  }
}

/** The tags this payee's lines carried. Tapping one picks it; [skip] leaves out the one already shown beside. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TagChips(history: PayeeHistory?, value: Long?, onPick: (Long) -> Unit, modifier: Modifier = Modifier, skip: Long? = null) {
  val tags = history?.tags?.filter { it.tag.id != skip }.orEmpty()
  if (tags.isEmpty()) return
  PastRow("TAGGED", modifier) {
    tags.forEach { (tag, uses) ->
      val on = tag.id == value
      val tone = Ledger.colors.stamp(tag.color)
      Box(
        Modifier
          .then(if (on) Modifier.border(1.dp, tone) else Modifier)
          .padding(2.dp)
          .semantics {
            selected = on
            contentDescription = "Tagged ${tag.name} ${times(uses)}"
          },
      ) {
        Stamp(tag.name, tag.color, onClick = { onPick(tag.id) })
      }
    }
  }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PastRow(label: String, modifier: Modifier, content: @Composable () -> Unit) {
  FlowRow(
    modifier.padding(top = 7.dp),
    horizontalArrangement = Arrangement.spacedBy(6.dp),
    verticalArrangement = Arrangement.spacedBy(6.dp),
    itemVerticalAlignment = Alignment.CenterVertically,
  ) {
    Text(label, Modifier.padding(end = 2.dp), style = mono(9.sp, spacing = 0.11), color = Ledger.colors.inkFaint)
    content()
  }
}
