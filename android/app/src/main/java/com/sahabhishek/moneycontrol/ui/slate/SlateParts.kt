package com.sahabhishek.moneycontrol.ui.slate

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sahabhishek.moneycontrol.data.api.Account
import com.sahabhishek.moneycontrol.data.api.SlateStats
import com.sahabhishek.moneycontrol.ui.theme.Ledger
import com.sahabhishek.moneycontrol.ui.theme.Mono
import com.sahabhishek.moneycontrol.ui.theme.mono
import com.sahabhishek.moneycontrol.ui.theme.sans
import com.sahabhishek.moneycontrol.ui.theme.serif
import com.sahabhishek.moneycontrol.ui.web.Caption
import com.sahabhishek.moneycontrol.ui.web.Eyebrow
import com.sahabhishek.moneycontrol.ui.web.Gutter
import com.sahabhishek.moneycontrol.ui.web.Rule
import com.sahabhishek.moneycontrol.ui.web.RuleHair
import com.sahabhishek.moneycontrol.ui.web.mix
import com.sahabhishek.moneycontrol.util.dayMonth
import com.sahabhishek.moneycontrol.util.rupees
import kotlin.math.abs

/** SlateOverview.tsx at the phone layout: only the dark net-position panel. */
@Composable
fun SlateOverview(stats: SlateStats, openCount: Int) {
  val c = Ledger.colors
  val paper = c.paperBase
  val eyebrow = mono(10.sp, FontWeight.Medium, 0.16)
  val total = stats.owedToYou + stats.youOwe
  Column(Modifier.fillMaxWidth().background(c.inkBase).padding(horizontal = Gutter, vertical = 22.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
      Text("NET POSITION · THE SLATE", style = eyebrow, color = paper)
      Text("$openCount OPEN ACCOUNT${if (openCount == 1) "" else "S"}", style = eyebrow.copy(fontWeight = FontWeight.Normal), color = paper.mix(0.55f))
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
      Text("₹", Modifier.alignByBaseline(), style = mono(26.sp), color = paper.mix(0.55f))
      Text(rupees(stats.net), Modifier.alignByBaseline(), style = serif(60.sp, -0.03), color = paper)
    }
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
      Text(
        if (stats.net == 0L) "all square" else if (stats.net > 0) "in your favour" else "you owe, net",
        style = serif(22.sp, italic = true),
        color = paper.mix(0.7f),
      )
      if ((stats.oldestDays ?: 0) > 0) {
        Box(Modifier.size(1.dp, 14.dp).background(paper.mix(0.4f)))
        Text("OLDEST DEBT ${stats.oldestDays} DAYS", style = mono(10.sp, spacing = 0.11), color = c.spendBright)
      }
    }
    if (total == 0L) {
      Text("NO MONEY IS OUTSTANDING IN EITHER DIRECTION.", Modifier.padding(top = 22.dp), style = mono(10.sp, spacing = 0.1), color = paper.mix(0.55f))
    } else {
      Row(Modifier.fillMaxWidth().padding(top = 22.dp)) {
        PageCol("Owed to you", stats.owedToYou, stats.owedCount, owe = false, weight = maxOf(stats.owedToYou, 1).toFloat())
        PageCol("You owe", stats.youOwe, stats.oweCount, owe = true, weight = maxOf(stats.youOwe, 1).toFloat())
      }
    }
  }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.PageCol(label: String, amount: Long, count: Int, owe: Boolean, weight: Float) {
  val c = Ledger.colors
  val tone = if (owe) c.spendBright else c.paperBase
  Row(Modifier.weight(weight).widthIn(min = 90.dp)) {
    if (owe) Box(Modifier.width(1.dp).height(90.dp).background(c.paperBase.mix(0.4f)))
    Column(Modifier.padding(start = if (owe) 12.dp else 0.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      Text(label.uppercase(), style = mono(9.sp, FontWeight.Medium, 0.12), color = tone, maxLines = 1)
      Text("₹${rupees(amount)}", style = mono(17.sp, FontWeight.Medium), color = tone)
      Box(Modifier.fillMaxWidth().height(32.dp).background(tone))
      Text("$count ACCOUNT${if (count == 1) "" else "S"}", style = mono(8.5.sp, spacing = 0.1), color = c.paperBase.mix(0.45f), maxLines = 1)
    }
  }
}

/** SlatePages.tsx — "Owed to you" then "You owe", stacked on a phone, then the settled names. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SlatePages(accounts: List<Account>, openId: Long?, busy: String?, onOpen: (Account) -> Unit, onRemind: (Account) -> Unit, onPayBack: (Account) -> Unit) {
  if (accounts.isEmpty()) return
  val owed = accounts.filter { it.balance > 0 }.sortedByDescending { it.ageDays ?: 0 }
  val owe = accounts.filter { it.balance < 0 }.sortedByDescending { it.ageDays ?: 0 }
  val settled = accounts.filter { it.balance == 0L }
  Column(Modifier.fillMaxWidth()) {
    Rule()
    SlatePage("Owed to you", "They borrowed from you", owed, openId, owed = true, busy, onOpen, onRemind, onPayBack)
    SlatePage("You owe", "You borrowed from them", owe, openId, owed = false, busy, onOpen, onRemind, onPayBack)
    if (settled.isNotEmpty()) {
      RuleHair()
      FlowRow(Modifier.fillMaxWidth().padding(vertical = 14.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), itemVerticalAlignment = Alignment.Bottom) {
        Eyebrow("Settled")
        FlowRow {
          settled.forEachIndexed { i, a ->
            if (i > 0) Text(" · ", style = sans(13.sp), color = Ledger.colors.inkMuted)
            Text(a.name, Modifier.clickable(role = Role.Button) { onOpen(a) }, style = sans(13.sp), color = Ledger.colors.inkMuted)
          }
        }
      }
    }
  }
}

@Composable
private fun SlatePage(
  title: String, dek: String, rows: List<Account>, openId: Long?, owed: Boolean, busy: String?,
  onOpen: (Account) -> Unit, onRemind: (Account) -> Unit, onPayBack: (Account) -> Unit,
) {
  val c = Ledger.colors
  val total = rows.sumOf { abs(it.balance) }
  Column(Modifier.fillMaxWidth().padding(top = 22.dp)) {
    Row(Modifier.fillMaxWidth().padding(bottom = 16.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
      Text(
        buildAnnotatedString {
          append(title)
          withStyle(SpanStyle(fontFamily = Mono, fontSize = 9.sp, letterSpacing = androidx.compose.ui.unit.TextUnit(0.11f, androidx.compose.ui.unit.TextUnitType.Em), color = c.inkFaint)) { append("   ${dek.uppercase()}") }
        },
        Modifier.weight(1f).alignByBaseline(),
        style = serif(31.sp),
        color = c.inkBase,
      )
      Row(Modifier.alignByBaseline(), verticalAlignment = Alignment.Bottom) {
        Text("₹", Modifier.alignByBaseline().padding(end = 3.dp), style = mono(13.sp), color = c.inkMuted)
        Text(rupees(total), Modifier.alignByBaseline(), style = serif(31.sp), color = c.inkBase)
      }
    }
    if (rows.isEmpty()) {
      Column {
        Rule()
        Text(if (owed) "Nobody owes you money." else "You don't owe anyone.", Modifier.padding(vertical = 20.dp), style = sans(13.sp), color = c.inkMuted)
      }
    } else {
      Row(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        val head = mono(9.sp, FontWeight.Medium, 0.14)
        Text("WHO", Modifier.weight(1f), style = head, color = c.inkFaint)
        Text("AMOUNT ₹", Modifier.width(86.dp), style = head, color = c.inkFaint, textAlign = TextAlign.End)
        Text("DO", Modifier.width(70.dp), style = head, color = c.inkFaint, textAlign = TextAlign.End)
      }
      Rule()
      rows.forEach { a ->
        val age = a.ageDays ?: 0
        Column(Modifier.fillMaxWidth().background(if (a.id == openId) c.paperRaised else Color.Transparent)) {
          Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            val tone = c.stamp(if (owed) "indigo" else "plum")
            Box(Modifier.size(34.dp).background(tone.mix(0.12f)).border(1.dp, tone), contentAlignment = Alignment.Center) {
              Text(a.name.trim().take(1).uppercase(), style = serif(19.sp), color = tone)
            }
            Column(Modifier.weight(1f).padding(start = 14.dp)) {
              Text(a.name, Modifier.clickable(role = Role.Button) { onOpen(a) }, style = sans(15.sp, FontWeight.SemiBold), color = c.inkBase, maxLines = 1, overflow = TextOverflow.Ellipsis)
              Text(
                "${a.lineCount} ${if (a.lineCount == 1) "entry" else "entries"}" + (a.openSince?.let { " · since ${dayMonth(it)}" } ?: ""),
                style = mono(9.5.sp),
                color = c.inkFaint,
              )
            }
            Text(rupees(a.balance), Modifier.width(86.dp), style = mono(15.sp, FontWeight.Medium), color = c.inkBase, textAlign = TextAlign.End)
            val label = if (owed) (if (busy == "remind-${a.id}") "…" else if (age > 90) "Chase" else if (age > 60) "Remind" else "Nudge") else "Pay back"
            Text(
              label.uppercase(),
              Modifier.width(70.dp).clickable(role = Role.Button) { if (owed) onRemind(a) else onPayBack(a) },
              style = mono(9.sp, FontWeight.Medium, 0.12),
              color = c.spend,
              textAlign = TextAlign.End,
            )
          }
          RuleHair()
        }
      }
    }
    Row(Modifier.fillMaxWidth().padding(top = 16.dp, bottom = 24.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
      Caption("${rows.size} open account${if (rows.size == 1) "" else "s"}")
      FootTotal("Total", total)
    }
  }
}

/** .pageFootTotal — "TOTAL ₹1,200" */
@Composable
fun FootTotal(label: String, amount: Long) = Text(
  buildAnnotatedString {
    append(label.uppercase())
    withStyle(SpanStyle(fontSize = 16.sp, letterSpacing = androidx.compose.ui.unit.TextUnit.Unspecified, fontWeight = FontWeight.Bold)) { append("  ₹${rupees(amount)}") }
  },
  style = mono(9.sp, FontWeight.Medium, 0.12),
  color = Ledger.colors.inkBase,
)

/** .age — a round swatch and "12 DAYS", green / ochre / vermillion by age. */
@Composable
fun AgeBadge(days: Int) {
  val c = Ledger.colors
  val tone = if (days > 90) c.spend else if (days > 30) c.pending else c.credit
  Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
    Box(Modifier.size(6.dp).background(tone, CircleShape))
    Text("$days DAY${if (days == 1) "" else "S"}", style = mono(9.sp, FontWeight.Medium, 0.1), color = tone)
  }
}
