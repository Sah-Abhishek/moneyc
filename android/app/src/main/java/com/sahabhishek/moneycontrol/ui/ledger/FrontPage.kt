package com.sahabhishek.moneycontrol.ui.ledger

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sahabhishek.moneycontrol.R
import com.sahabhishek.moneycontrol.data.api.MonthSummary
import com.sahabhishek.moneycontrol.ui.theme.Ledger
import com.sahabhishek.moneycontrol.ui.theme.mono
import com.sahabhishek.moneycontrol.ui.theme.serif
import com.sahabhishek.moneycontrol.ui.web.Gutter
import com.sahabhishek.moneycontrol.ui.web.mix
import com.sahabhishek.moneycontrol.util.monthLong
import com.sahabhishek.moneycontrol.util.monthShort
import com.sahabhishek.moneycontrol.util.percent
import com.sahabhishek.moneycontrol.util.rupees
import com.sahabhishek.moneycontrol.util.shiftYm
import com.sahabhishek.moneycontrol.util.splitRupees
import kotlin.math.abs
import kotlin.math.max

private val SoftGreen = Color(0xFF8FC2A0)

/** FrontPage.tsx at the phone layout: only the dark spend panel (the key figures are hidden). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FrontPage(m: MonthSummary, onSetBudget: () -> Unit) {
  val c = Ledger.colors
  val paper = c.paperBase
  val (whole, frac) = splitRupees(m.spent)
  val delta = m.spent - m.prevSpent
  val used = m.budget?.let { if (it > 0) m.spent.toDouble() / it else 0.0 } ?: 0.0
  val avg = if (m.daysElapsed > 0) m.spent.toDouble() / m.daysElapsed else 0.0
  val daysLeft = m.days - m.daysElapsed
  val eyebrow = mono(10.sp, FontWeight.Medium, 0.16)

  Column(
    Modifier.fillMaxWidth().background(c.inkBase).padding(horizontal = Gutter, vertical = 22.dp),
    verticalArrangement = Arrangement.spacedBy(18.dp),
  ) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
      Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text("SPENT · ${monthLong(m.ym)}", style = eyebrow, color = paper)
        Text("01 — ${m.days} ${monthShort(m.ym)}", style = eyebrow.copy(fontWeight = FontWeight.Normal), color = paper.mix(0.55f))
      }
      Row(Modifier.semantics { contentDescription = "₹$whole$frac spent" }, horizontalArrangement = Arrangement.spacedBy(7.dp), verticalAlignment = Alignment.Bottom) {
        Text("₹", Modifier.alignByBaseline(), style = mono(26.sp), color = paper.mix(0.55f))
        Text(whole, Modifier.alignByBaseline(), style = serif(64.sp, -0.03), color = paper)
        Text(frac, Modifier.alignByBaseline(), style = serif(28.sp), color = paper.mix(0.45f))
      }
      if (m.prevSpent > 0) {
        val down = delta < 0
        val deltaStyle = mono(10.sp, spacing = 0.11)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(11.dp), verticalArrangement = Arrangement.spacedBy(6.dp), itemVerticalAlignment = Alignment.CenterVertically) {
          if (!down) Image(painterResource(R.drawable.ic_up_triangle), null, Modifier.size(9.dp, 7.dp))
          else Canvas(Modifier.size(9.dp, 7.dp)) {
            drawPath(Path().apply { moveTo(0f, 0f); lineTo(size.width, 0f); lineTo(size.width / 2, size.height); close() }, SoftGreen)
          }
          Text(
            "${percent(abs(delta).toDouble(), m.prevSpent.toDouble(), 1)} ${if (down) "UNDER" else "ON"} ${monthLong(shiftYm(m.ym, -1))}",
            style = deltaStyle.copy(fontWeight = FontWeight.Medium),
            color = if (down) SoftGreen else c.spendBright,
          )
          Box(Modifier.size(1.dp, 11.dp).background(paper.mix(0.4f)))
          Text("₹${rupees(delta)} ${if (down) "LESS" else "MORE"}", style = deltaStyle, color = paper.mix(0.55f))
        }
      }
    }

    Column(verticalArrangement = Arrangement.spacedBy(11.dp)) {
      BurnRate(m.daily, m.daysElapsed, avg)
      Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        val axis = mono(9.sp, spacing = 0.11)
        Text("01 ${monthShort(m.ym)}", style = axis, color = paper.mix(0.45f))
        Text("${m.days} ${monthShort(m.ym)}", style = axis, color = paper.mix(0.45f))
      }
    }

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
      if (m.budget != null && m.budget > 0) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
          Text("BUDGET ₹${rupees(m.budget)}", style = eyebrow, color = paper)
          Text(
            (if (used > 1) "OVER BY ₹${rupees(m.spent - m.budget)}" else "${"%.1f".format(used * 100)}% USED") +
              if (m.isCurrent) " · $daysLeft DAY${if (daysLeft == 1) "" else "S"} LEFT" else "",
            style = eyebrow,
            color = paper,
          )
        }
        Box(
          Modifier.fillMaxWidth().height(7.dp).background(paper.mix(0.22f))
            .semantics { contentDescription = "${Math.round(used * 100)}% of the monthly budget used" },
        ) {
          val over = used > 1
          Canvas(Modifier.fillMaxWidth(minOf(1.0, used).toFloat()).fillMaxHeight()) {
            if (!over) drawRect(c.spendBright)
            else clipRect {
              // repeating-linear-gradient(135deg, spend-bright 0 6px, spend 6px 12px)
              drawRect(c.spendBright)
              val step = 12.dp.toPx()
              var x = -size.height
              while (x < size.width + size.height) {
                drawPath(Path().apply {
                  moveTo(x + step / 2, 0f); lineTo(x + step, 0f); lineTo(x + step - size.height, size.height); lineTo(x + step / 2 - size.height, size.height); close()
                }, c.spend)
                x += step
              }
            }
          }
        }
      } else {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
          Text("NO MONTHLY BUDGET SET", style = eyebrow, color = paper)
          Text(
            "SET A BUDGET →",
            Modifier.clickable(role = Role.Button, onClick = onSetBudget),
            style = eyebrow.copy(textDecoration = TextDecoration.Underline),
            color = c.spendBright,
          )
        }
      }
    }
  }
}

/** BurnRate.tsx: daily spend; days over the running average burn orange; future days empty. */
@Composable
private fun BurnRate(daily: List<Long>, daysElapsed: Int, average: Double) {
  val c = Ledger.colors
  val max = max(daily.maxOrNull()?.toDouble() ?: 0.0, max(average, 1.0))
  Canvas(Modifier.fillMaxWidth().height(72.dp).semantics { contentDescription = "Daily spending, average ₹${rupees(average)} a day" }) {
    val n = daily.size.coerceAtLeast(1)
    val gap = 3.dp.toPx()
    val w = (size.width - gap * (n - 1)) / n
    daily.forEachIndexed { i, v ->
      val day = i + 1
      if (day > daysElapsed) return@forEachIndexed
      val h = if (v > 0) maxOf(v / max * size.height, 0.02 * size.height).toFloat() else 0f
      drawRect(
        if (v > average) c.spendBright else c.paperBase.mix(0.26f),
        topLeft = Offset(i * (w + gap), size.height - h),
        size = Size(w, h),
      )
    }
    val y = (size.height - average / max * size.height).toFloat()
    drawLine(c.paperBase.mix(0.45f), Offset(0f, y), Offset(size.width, y), 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 3.dp.toPx())))
  }
}

