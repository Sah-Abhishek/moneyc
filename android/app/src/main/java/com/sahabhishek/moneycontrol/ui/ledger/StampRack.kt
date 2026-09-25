package com.sahabhishek.moneycontrol.ui.ledger

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sahabhishek.moneycontrol.R
import com.sahabhishek.moneycontrol.data.api.MonthSummary
import com.sahabhishek.moneycontrol.data.api.Tag
import com.sahabhishek.moneycontrol.ui.theme.Ledger
import com.sahabhishek.moneycontrol.ui.theme.mono
import com.sahabhishek.moneycontrol.ui.theme.serif
import com.sahabhishek.moneycontrol.ui.web.Chip
import com.sahabhishek.moneycontrol.ui.web.Chips
import com.sahabhishek.moneycontrol.ui.web.Gutter
import com.sahabhishek.moneycontrol.ui.web.Rule
import com.sahabhishek.moneycontrol.ui.web.SectionHead
import com.sahabhishek.moneycontrol.util.percent
import com.sahabhishek.moneycontrol.util.rupees

private data class Card(val tag: Tag?, val total: Long, val count: Int)

/** StampRack.tsx — every spending tag gets a card, used this month or not; two to a row on a phone. */
@Composable
fun StampRack(m: MonthSummary, tags: List<Tag>, onTag: (Tag) -> Unit, onUntagged: () -> Unit, onTags: () -> Unit, onBudgets: () -> Unit, onNewTag: () -> Unit) =
  Column(Modifier.fillMaxWidth().padding(start = Gutter, end = Gutter, bottom = 44.dp)) {
    val max = maxOf(m.byTag.maxOfOrNull { it.total } ?: 0, 1)
    val cards = tags.filter { it.kind == "spend" }
      .map { t -> m.byTag.firstOrNull { it.tag?.id == t.id }.let { Card(t, it?.total ?: 0, it?.count ?: 0) } }
      .sortedWith(compareByDescending<Card> { it.total }.thenBy { it.tag!!.name.lowercase() })
    val untagged = m.byTag.firstOrNull { it.tag == null }?.let { Card(null, it.total, it.count) }

    Rule()
    SectionHead("The Stamp Rack", small = "Every tag you stamp on a line", controls = {
      Chips {
        Chip("Rename · merge", onTags)
        Chip("Budget per tag", onBudgets)
      }
    })
    // Tag cards, then Untagged, then the dashed "New tag" — two to a row, each row as tall as its tallest card.
    val items: List<Card?> = cards + listOfNotNull(untagged) + listOf(null)
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
      items.chunked(2).forEach { pair ->
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
          pair.forEach { card ->
            val mod = Modifier.weight(1f).fillMaxHeight()
            when {
              card == null -> NewTagCard(mod, onNewTag)
              card.tag == null -> TagCard(card, max, m.spent, mod, onUntagged)
              else -> TagCard(card, max, m.spent, mod) { onTag(card.tag) }
            }
          }
          if (pair.size == 1) Spacer(Modifier.weight(1f))
        }
      }
    }
  }

@Composable
private fun TagCard(card: Card, max: Long, spent: Long, modifier: Modifier, onClick: () -> Unit) {
  val c = Ledger.colors
  val tone = card.tag?.let { c.stamp(it.color) } ?: c.inkFaint
  val budget = card.tag?.budget
  val over = budget != null && card.total > budget
  val name = card.tag?.name ?: "Untagged"
  Column(
    modifier.border(1.dp, c.inkBase).clickable(role = Role.Button, onClick = onClick).padding(15.dp)
      .semantics { contentDescription = "$name: ₹${rupees(card.total)}" },
    verticalArrangement = Arrangement.spacedBy(11.dp),
  ) {
    Row(horizontalArrangement = Arrangement.spacedBy(7.dp), verticalAlignment = Alignment.CenterVertically) {
      Box(Modifier.size(9.dp).background(tone))
      Text(name.uppercase(), style = mono(9.sp, FontWeight.Medium, 0.09), color = c.inkBase, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
    Row(horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.Bottom) {
      Text("₹", Modifier.alignByBaseline(), style = mono(12.sp), color = c.inkMuted)
      Text(rupees(card.total), Modifier.alignByBaseline(), style = serif(27.sp, -0.01), color = c.inkBase)
    }
    val fraction = (if (budget != null && budget > 0) card.total.toFloat() / budget else card.total.toFloat() / max).coerceIn(0f, 1f)
    Box(Modifier.fillMaxWidth().height(5.dp).background(c.ruleHair)) {
      Canvas(Modifier.fillMaxWidth(fraction).height(5.dp)) {
        drawRect(tone)
        if (over) clipRect {
          // repeating-linear-gradient(135deg, c 0 4px, spend 4px 8px)
          val step = 8.dp.toPx()
          var x = -size.height
          while (x < size.width + size.height) {
            drawPath(Path().apply { moveTo(x + step / 2, 0f); lineTo(x + step, 0f); lineTo(x + step - size.height, size.height); lineTo(x + step / 2 - size.height, size.height); close() }, c.spend)
            x += step
          }
        }
      }
    }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
      val foot = mono(8.sp, spacing = 0.1)
      Text(
        if (card.tag == null) "${card.count} TO STAMP" else "${card.count} ${if (card.count == 1) "ENTRY" else "ENTRIES"}",
        style = foot,
        color = c.inkFaint,
      )
      Text(
        when {
          card.tag == null || budget == null -> percent(card.total, spent)
          over -> "OVER ₹${rupees(card.total - budget)}"
          else -> "OF ₹${rupees(budget)}"
        },
        style = foot,
        color = c.inkMuted,
      )
    }
  }
}

@Composable
private fun NewTagCard(modifier: Modifier, onClick: () -> Unit) {
  val c = Ledger.colors
  Column(
    modifier.heightIn(min = 69.dp).dashedBorder().clickable(role = Role.Button, onClick = onClick).padding(15.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.spacedBy(9.dp, Alignment.CenterVertically),
  ) {
    Image(painterResource(R.drawable.ic_plus_ink), null, Modifier.size(16.dp))
    Text("NEW TAG", style = mono(9.sp, FontWeight.Medium, 0.11), color = c.inkMuted)
  }
}

