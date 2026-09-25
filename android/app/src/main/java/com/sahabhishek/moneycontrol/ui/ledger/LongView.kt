package com.sahabhishek.moneycontrol.ui.ledger

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sahabhishek.moneycontrol.R
import com.sahabhishek.moneycontrol.data.api.Merchant
import com.sahabhishek.moneycontrol.data.api.MonthSpend
import com.sahabhishek.moneycontrol.ui.theme.Ledger
import com.sahabhishek.moneycontrol.ui.theme.mono
import com.sahabhishek.moneycontrol.ui.theme.sans
import com.sahabhishek.moneycontrol.ui.theme.serif
import com.sahabhishek.moneycontrol.ui.web.Caption
import com.sahabhishek.moneycontrol.ui.web.Chip
import com.sahabhishek.moneycontrol.ui.web.Chips
import com.sahabhishek.moneycontrol.ui.web.Eyebrow
import com.sahabhishek.moneycontrol.ui.web.Gutter
import com.sahabhishek.moneycontrol.ui.web.Rule
import com.sahabhishek.moneycontrol.ui.web.RuleHair
import com.sahabhishek.moneycontrol.ui.web.SectionHead
import com.sahabhishek.moneycontrol.ui.web.over
import com.sahabhishek.moneycontrol.util.firstWeekday
import com.sahabhishek.moneycontrol.util.monthLong
import com.sahabhishek.moneycontrol.util.monthShort
import com.sahabhishek.moneycontrol.util.monthTitle
import com.sahabhishek.moneycontrol.util.rupees

private val WEEK = listOf("MO", "TU", "WE", "TH", "FR", "SA", "SU")
private val RANGES = listOf("6m" to "6 months", "1y" to "1 year", "all" to "All time")

/** LongView.tsx at the phone layout: months, the calendar and the merchants, stacked. */
@Composable
fun LongView(
  ym: String,
  months: List<MonthSpend>,
  daily: List<Long>,
  daysElapsed: Int,
  merchants: List<Merchant>,
  range: String,
  full: Boolean,
  onRange: (String) -> Unit,
  onExport: () -> Unit,
  onMerchant: (Merchant) -> Unit,
  onSeeAll: () -> Unit,
) = Column(Modifier.fillMaxWidth().padding(start = Gutter, end = Gutter, bottom = 38.dp)) {
  Rule()
  SectionHead("The Long View", small = "How the months compare", controls = {
    Chips {
      RANGES.forEach { (key, label) -> Chip(label, { onRange(key) }, current = key == range) }
      Chip("Export ${monthShort(ym)}", onExport)
    }
  })
  Column(verticalArrangement = Arrangement.spacedBy(32.dp)) {
    MonthBars(ym, months)
    Calendar(ym, daily, daysElapsed)
    Merchants(ym, merchants, full, onMerchant, onSeeAll)
  }
}

@Composable
private fun MonthBars(ym: String, months: List<MonthSpend>) = Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
  val c = Ledger.colors
  val max = maxOf(months.maxOfOrNull { it.spent } ?: 0, 1)
  val dense = months.size > 12
  Eyebrow(if (months.size <= 6) "Six months of spending" else if (months.size <= 12) "A year of spending" else "${months.size} months of spending")
  Column(verticalArrangement = Arrangement.spacedBy(if (dense) 8.dp else 14.dp)) {
    months.forEach { x ->
      val current = x.ym == ym
      Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
          Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
              monthShort(x.ym) + if (months.size > 6) " ’${x.ym.substring(2, 4)}" else "",
              style = mono(10.sp, if (current) FontWeight.SemiBold else FontWeight.Medium, 0.11),
              color = if (current) c.inkBase else c.inkMuted,
            )
            if (current) Text("SELECTED", style = mono(8.sp, spacing = 0.11), color = c.spend)
          }
          Text("₹${rupees(x.spent)}", style = mono(11.sp, if (current) FontWeight.Medium else FontWeight.Normal), color = if (current) c.inkBase else c.inkMuted)
        }
        Box(
          Modifier.fillMaxWidth().height(if (dense) 5.dp else 8.dp).background(c.ruleHair)
            .semantics { contentDescription = "${monthLong(x.ym)} ${x.ym.take(4)}: ₹${rupees(x.spent)}" },
        ) {
          Box(Modifier.fillMaxWidth((x.spent.toFloat() / max).coerceIn(0f, 1f)).height(if (dense) 5.dp else 8.dp).background(if (current) c.spend else c.inkBase.over(c.paperBase, 0.55f)))
        }
      }
    }
  }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Calendar(ym: String, daily: List<Long>, daysElapsed: Int) = Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
  val c = Ledger.colors
  val cells = List(firstWeekday(ym)) { null as Int? } + daily.indices.map { it + 1 }
  val padded = cells + List((7 - cells.size % 7) % 7) { null }
  // Five steps of one hue, split at quintiles of the days that had spending.
  val spentDays = daily.filterIndexed { i, v -> v > 0 && i < daysElapsed }.sorted()
  fun cut(q: Double) = spentDays.getOrNull(minOf(spentDays.size - 1, (q * spentDays.size).toInt())) ?: 0L
  val edges = listOf(cut(0.2), cut(0.4), cut(0.6), cut(0.8))
  fun level(v: Long) = if (v <= 0) 0 else 1 + edges.count { v > it }
  val busiest = daily.indices.maxByOrNull { daily[it] } ?: 0
  fun fill(l: Int): Color = when (l) {
    1 -> c.spend.over(c.paperBase, 0.18f)
    2 -> c.spend.over(c.paperBase, 0.32f)
    3 -> c.spend.over(c.paperBase, 0.48f)
    4 -> c.spend.over(c.paperBase, 0.70f)
    5 -> c.spend
    else -> c.ruleHair.copy(alpha = 0.6f)
  }

  Eyebrow("${monthTitle(ym)}, day by day")
  Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
    Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
      WEEK.forEach { Text(it, Modifier.weight(1f).widthIn(max = 51.dp).padding(bottom = 4.dp), style = mono(9.sp, FontWeight.Medium, 0.11), color = c.inkFaint, textAlign = TextAlign.Center) }
    }
    padded.chunked(7).forEach { week ->
      Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        week.forEach { day ->
          val future = day == null || day > daysElapsed
          val l = if (day == null || future) 0 else level(daily[day - 1])
          Box(
            Modifier.weight(1f).widthIn(max = 51.dp).height(34.dp).background(fill(l))
              .semantics { if (day != null) contentDescription = if (future) "$day ${monthShort(ym)}" else "$day ${monthShort(ym)}: ₹${rupees(daily[day - 1])}" },
            contentAlignment = Alignment.Center,
          ) {
            if (day != null && !future) Text("$day", style = mono(9.sp, spacing = 0.02), color = if (l >= 4) c.paperBase else if (l == 0) c.inkFaint else c.inkBase)
          }
        }
      }
    }
  }
  FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp), itemVerticalAlignment = Alignment.CenterVertically) {
    val legend = mono(8.sp, spacing = 0.11)
    Text("LIGHTER", style = legend, color = c.inkFaint)
    (1..5).forEach { Box(Modifier.size(16.dp, 10.dp).background(fill(it))) }
    Text("HEAVIER", style = legend, color = c.inkFaint)
    Box(Modifier.size(1.dp, 10.dp).background(c.ruleHair))
    Text(
      if ((daily.getOrNull(busiest) ?: 0) > 0) "BUSIEST: ${busiest + 1} ${monthShort(ym)} · ₹${rupees(daily[busiest])}" else "NO SPENDING YET",
      style = legend,
      color = c.inkMuted,
    )
  }
}

@Composable
private fun Merchants(ym: String, merchants: List<Merchant>, full: Boolean, onMerchant: (Merchant) -> Unit, onSeeAll: () -> Unit) = Column {
  val c = Ledger.colors
  val shown = if (full) merchants else merchants.take(5)
  Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
    Eyebrow("Where it leaks")
    Caption("By total · ${monthShort(ym)}")
  }
  Rule()
  if (shown.isEmpty()) {
    Text("No spending recorded in ${monthTitle(ym)}.", Modifier.padding(vertical = 16.dp), style = sans(13.sp), color = c.inkMuted)
  } else {
    shown.forEachIndexed { i, x ->
      Column {
        Row(Modifier.fillMaxWidth().padding(vertical = 13.dp), horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
          Text("${i + 1}", Modifier.width(14.dp), style = serif(24.sp), color = c.inkFaint)
          Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
              x.payee,
              Modifier.clickable(role = Role.Button) { onMerchant(x) },
              style = sans(13.sp, FontWeight.SemiBold),
              color = c.inkBase,
              maxLines = 1,
              overflow = TextOverflow.Ellipsis,
            )
            Text("${x.count} payment${if (x.count == 1) "" else "s"}${x.tag?.let { " · ${it.name}" } ?: ""}", style = mono(9.sp, spacing = 0.02), color = c.inkFaint)
          }
          Text("₹${rupees(x.total)}", style = mono(12.sp, FontWeight.Medium), color = c.inkBase)
        }
        RuleHair()
      }
    }
  }
  if (!full && merchants.size > 5) {
    Row(
      Modifier.padding(top = 14.dp).clickable(role = Role.Button, onClick = onSeeAll),
      horizontalArrangement = Arrangement.spacedBy(7.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Text("SEE ALL ${merchants.size} MERCHANTS", style = mono(9.sp, FontWeight.Medium, 0.11), color = c.inkBase)
      Image(painterResource(R.drawable.ic_arrow_right), null, Modifier.size(11.dp))
    }
  }
}
