package com.sahabhishek.moneycontrol.ui.ledger

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sahabhishek.moneycontrol.R
import com.sahabhishek.moneycontrol.data.api.EntriesPage
import com.sahabhishek.moneycontrol.data.api.Entry
import com.sahabhishek.moneycontrol.data.api.Tag
import com.sahabhishek.moneycontrol.ui.theme.Ledger
import com.sahabhishek.moneycontrol.ui.theme.mono
import com.sahabhishek.moneycontrol.ui.theme.sans
import com.sahabhishek.moneycontrol.ui.web.AutoBadge
import com.sahabhishek.moneycontrol.ui.web.Btn
import com.sahabhishek.moneycontrol.ui.web.Chip
import com.sahabhishek.moneycontrol.ui.web.Chips
import com.sahabhishek.moneycontrol.ui.web.EmptyState
import com.sahabhishek.moneycontrol.ui.web.Gutter
import com.sahabhishek.moneycontrol.ui.web.RuleHair
import com.sahabhishek.moneycontrol.ui.web.SectionHead
import com.sahabhishek.moneycontrol.ui.web.Stamp
import com.sahabhishek.moneycontrol.util.clock
import com.sahabhishek.moneycontrol.util.dayHeader
import com.sahabhishek.moneycontrol.util.groupIndian
import com.sahabhishek.moneycontrol.util.monthTitle
import com.sahabhishek.moneycontrol.util.rupeesExact
import com.sahabhishek.moneycontrol.util.shiftYm
import com.sahabhishek.moneycontrol.util.signedAmount
import com.sahabhishek.moneycontrol.util.maskRef
import kotlin.math.abs
import kotlin.math.roundToLong

private val FILTERS = listOf("all" to "All", "wire" to "From the wire", "hand" to "By hand", "untagged" to "Untagged")
private const val PAGE_SIZE = 20

/** What the ledger is showing — the web keeps this in the URL (?m&filter&q&tag&page). */
@kotlinx.serialization.Serializable
data class LedgerQuery(val ym: String, val filter: String = "all", val q: String? = null, val tag: Tag? = null, val page: Int = 1)

/** The quick line's typing, owned by the view model so a failed add keeps it. */
data class QuickLine(val payee: String = "", val amount: String = "", val pending: Boolean = false, val error: String? = null)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LedgerList(
  page: EntriesPage,
  query: LedgerQuery,
  currentYm: String,
  bookIsEmpty: Boolean,
  quick: QuickLine,
  onQuery: (LedgerQuery) -> Unit,
  onQuickChange: (QuickLine) -> Unit,
  onQuickAdd: () -> Unit,
  onAddPast: () -> Unit,
  onOpen: (Entry) -> Unit,
  onSlate: (Long) -> Unit,
) {
  val ym = query.ym
  val year = ym.take(4)
  Column(Modifier.fillMaxWidth().padding(bottom = 30.dp)) {
    SectionHead(
      title = "The Ledger",
      small = "${page.total} ${if (page.total == 1) "entry" else "entries"} · ${monthTitle(ym).uppercase()} $year" + (query.q?.let { " · matching “$it”" } ?: ""),
      titleSize = 26.sp,
      padding = androidx.compose.foundation.layout.PaddingValues(start = Gutter, end = Gutter, top = 22.dp, bottom = 14.dp),
      afterTitle = query.tag?.let { t ->
        { Stamp("${t.name} ×", t.color, onClick = { onQuery(query.copy(tag = null, page = 1)) }, spacing = 0.08) }
      },
      controls = {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
          Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Chip("‹ ${monthTitle(shiftYm(ym, -1)).take(3)}", { onQuery(query.copy(ym = shiftYm(ym, -1), page = 1)) })
            if (ym < currentYm) Chip("${monthTitle(shiftYm(ym, 1)).take(3)} ›", { onQuery(query.copy(ym = shiftYm(ym, 1), page = 1)) })
            if (ym != currentYm) Chip("This month", { onQuery(query.copy(ym = currentYm, page = 1)) })
          }
          Chips {
            FILTERS.forEach { (key, label) -> Chip(label, { onQuery(query.copy(filter = key, page = 1)) }, current = key == query.filter) }
          }
        }
      },
    )

    if (ym == currentYm) QuickEntry(quick, onQuickChange, onQuickAdd)
    else Text(
      "+ ADD A LINE TO ${monthTitle(ym).uppercase()} $year",
      Modifier.padding(horizontal = Gutter).fillMaxWidth().dashedBorder().clickable(role = Role.Button, onClick = onAddPast).padding(horizontal = 13.dp, vertical = 14.dp),
      style = mono(10.sp, spacing = 0.1),
      color = Ledger.colors.inkMuted,
    )

    if (page.entries.isEmpty()) {
      Box(Modifier.padding(horizontal = Gutter)) { Empty(bookIsEmpty, query, ym) { onQuery(query.copy(q = null, filter = "all", tag = null, page = 1)) } }
    } else {
      val dayNet = page.entries.groupBy { it.occurredAt.take(10) }.mapValues { (_, v) -> v.sumOf { it.amount } }
      page.entries.forEachIndexed { i, e ->
        val day = e.occurredAt.take(10)
        if (i == 0 || page.entries[i - 1].occurredAt.take(10) != day) DayHead(e.occurredAt, dayNet[day] ?: 0)
        LedgerRow(e, onOpen, onSlate)
      }
    }

    if (page.pages > 1) {
      Box(Modifier.fillMaxWidth().padding(start = Gutter, end = Gutter, top = 18.dp), contentAlignment = Alignment.Center) {
        Pager(page.page, page.pages) { onQuery(query.copy(page = it)) }
      }
    }
  }
}

/** QuickEntry.tsx at the phone layout: "+ | Who did you pay?   ₹ 0.00", Enter adds. */
@Composable
private fun QuickEntry(quick: QuickLine, onChange: (QuickLine) -> Unit, onAdd: () -> Unit) {
  val c = Ledger.colors
  val source = remember { MutableInteractionSource() }
  val amountSource = remember { MutableInteractionSource() }
  val focused = source.collectIsFocusedAsState().value || amountSource.collectIsFocusedAsState().value
  val amountFocus = remember { FocusRequester() }
  Column(Modifier.padding(horizontal = Gutter)) {
    Row(
      Modifier.fillMaxWidth().background(c.paperSunk).dashedBorder(solid = focused).padding(13.dp),
      horizontalArrangement = Arrangement.spacedBy(12.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Box(Modifier.size(24.dp).background(c.inkBase), contentAlignment = Alignment.Center) {
        Image(painterResource(R.drawable.ic_plus_entry), null, Modifier.size(13.dp))
      }
      Box(Modifier.size(1.dp, 18.dp).background(c.inkBase))
      BasicTextField(
        quick.payee,
        { if (it.length <= 120) onChange(quick.copy(payee = it, error = null)) },
        Modifier.weight(1f).semantics { contentDescription = "Who did you pay?" },
        textStyle = sans(14.sp, color = c.inkBase),
        singleLine = true,
        cursorBrush = SolidColor(c.inkBase),
        interactionSource = source,
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
        keyboardActions = KeyboardActions(onNext = { amountFocus.requestFocus() }),
        decorationBox = { inner -> Box { if (quick.payee.isEmpty()) Text("Who did you pay?", style = sans(14.sp), color = c.inkMuted); inner() } },
      )
      Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("₹", style = mono(14.sp, FontWeight.Medium), color = c.inkFaint)
        BasicTextField(
          quick.amount,
          { if (it.length <= 20) onChange(quick.copy(amount = it, error = null)) },
          Modifier.widthIn(min = 40.dp, max = 110.dp).focusRequester(amountFocus).semantics { contentDescription = "Amount — start with + for money in" },
          textStyle = mono(14.sp, FontWeight.Medium, 0.02).copy(color = c.inkBase, textAlign = TextAlign.End),
          singleLine = true,
          cursorBrush = SolidColor(c.inkBase),
          interactionSource = amountSource,
          keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text, imeAction = ImeAction.Done),
          keyboardActions = KeyboardActions(onDone = { if (!quick.pending) onAdd() }),
          decorationBox = { inner ->
            Box(contentAlignment = Alignment.CenterEnd) {
              if (quick.amount.isEmpty()) Text("0.00", style = mono(14.sp, FontWeight.Medium, 0.02), color = c.inkBase)
              inner()
            }
          },
        )
      }
    }
    quick.error?.let { Text(it, Modifier.padding(start = 51.dp, top = 4.dp), style = mono(9.sp, spacing = 0.08), color = c.spend) }
  }
}

/** A 1px dashed ink border (solid while typing), like the quick line and "Add a line to…". */
fun Modifier.dashedBorder(solid: Boolean = false, width: Dp = 1.dp, color: androidx.compose.ui.graphics.Color = com.sahabhishek.moneycontrol.ui.theme.DayPaper.inkBase) = this.then(Modifier.drawBehind {
  val w = width.toPx()
  drawRect(
    color = color,
    topLeft = Offset(w / 2, w / 2),
    size = androidx.compose.ui.geometry.Size(size.width - w, size.height - w),
    style = Stroke(w, pathEffect = if (solid) null else PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 2.dp.toPx()))),
  )
})

@Composable
private fun DayHead(at: String, net: Long) {
  val c = Ledger.colors
  Column(Modifier.fillMaxWidth()) {
    Row(Modifier.fillMaxWidth().padding(start = Gutter, end = Gutter, top = 22.dp, bottom = 10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
      Text(dayHeader(at), style = mono(10.sp, FontWeight.Medium, 0.12), color = c.inkBase)
      Text("${if (net < 0) "−" else "+"}${rupeesExact(net)}", style = mono(10.sp, spacing = 0.02), color = c.inkFaint)
    }
    com.sahabhishek.moneycontrol.ui.web.Rule(color = c.inkFaint)
  }
}

@Composable
private fun LedgerRow(e: Entry, onOpen: (Entry) -> Unit, onSlate: (Long) -> Unit) {
  val c = Ledger.colors
  val metaSm = listOfNotNull(clock(e.occurredAt), e.channel, e.ref?.let(::maskRef) ?: e.note).joinToString(" · ")
  Column(Modifier.fillMaxWidth().clickable(role = Role.Button) { onOpen(e) }) {
    Column(Modifier.fillMaxWidth().padding(horizontal = Gutter, vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        Row(Modifier.weight(1f).padding(end = 12.dp), horizontalArrangement = Arrangement.spacedBy(9.dp), verticalAlignment = Alignment.CenterVertically) {
          Text(e.payee, Modifier.weight(1f, fill = false), style = sans(16.sp, FontWeight.SemiBold, spacing = -0.005), color = c.inkBase, maxLines = 1, overflow = TextOverflow.Ellipsis)
          if (e.source == "wire") AutoBadge(e.auto)
        }
        Text(signedAmount(e.amount), style = mono(16.sp, FontWeight.Medium), color = if (e.amount > 0) c.credit else c.inkBase)
      }
      Row(verticalAlignment = Alignment.CenterVertically) {
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
          when {
            e.personId != null -> Text(
              "SLATE · ${e.personName.orEmpty().uppercase()}",
              Modifier.border(1.dp, c.inkBase).clickable(role = Role.Button) { onSlate(e.personId) }.padding(horizontal = 9.dp, vertical = 4.dp),
              style = mono(9.sp, FontWeight.Medium, 0.08),
              color = c.inkBase,
              maxLines = 1,
              overflow = TextOverflow.Ellipsis,
            )
            e.tag != null -> Stamp(e.tag.name, e.tag.color)
            e.amount < 0 -> Text(
              "+ TAG",
              Modifier.dashedBorder(color = c.inkFaint).clickable(role = Role.Button) { onOpen(e) }.padding(horizontal = 9.dp, vertical = 4.dp),
              style = mono(9.sp, spacing = 0.09),
              color = c.inkFaint,
            )
          }
          Text(metaSm, Modifier.weight(1f, fill = false), style = mono(9.sp), color = c.inkFaint, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(
          "${if (e.balance < 0) "−" else ""}${groupIndian((abs(e.balance) / 100.0).roundToLong())}",
          style = mono(10.sp, spacing = 0.01),
          color = c.inkFaint,
        )
      }
    }
    RuleHair()
  }
}

@Composable
private fun Empty(bookIsEmpty: Boolean, q: LedgerQuery, ym: String, onClear: () -> Unit) = when {
  bookIsEmpty -> EmptyState(
    "Your book is open.",
    body = "Write the first line above — who you paid and how much. Payments from your bank alerts will appear on the wire as they arrive; confirm them and they land here too.",
  )
  q.q != null -> EmptyState(
    "Nothing matches “${q.q}”.",
    body = "Search looks at payee names, notes, references and accounts in ${monthTitle(ym)}. Try another month or a shorter word.",
    action = { Btn("Clear search", onClear) },
  )
  q.tag != null || q.filter != "all" -> EmptyState(
    when {
      q.filter == "untagged" -> "Every spend this month has a tag."
      q.filter == "wire" -> "Nothing came from the wire this month."
      q.tag != null -> "Nothing stamped with this tag this month."
      else -> "Nothing written by hand this month."
    },
    action = { Btn("Show all lines", onClear) },
  )
  else -> EmptyState("No lines in ${monthTitle(ym)}.", body = "Nothing was recorded this month.")
}

/** Ledger.tsx Pager: ‹ 1 2 … 7 8 9 … 20 › */
@Composable
private fun Pager(page: Int, pages: Int, onPage: (Int) -> Unit) {
  val shown = listOf(1, 2, page - 1, page, page + 1, pages - 1, pages).filter { it in 1..pages }.distinct().sorted()
  Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
    Chip("‹", { onPage(maxOf(1, page - 1)) }, enabled = page > 1)
    shown.forEachIndexed { i, p ->
      if (i > 0 && p - shown[i - 1] > 1) Chip("…", {}, enabled = false)
      Chip("$p", { onPage(p) }, current = p == page)
    }
    Chip("›", { onPage(minOf(pages, page + 1)) }, enabled = page < pages)
  }
}
