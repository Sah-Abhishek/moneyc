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
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
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
import com.sahabhishek.moneycontrol.data.api.TagGroup
import com.sahabhishek.moneycontrol.data.session.QUICK_CHANNELS
import com.sahabhishek.moneycontrol.ui.theme.Ledger
import com.sahabhishek.moneycontrol.ui.theme.mono
import com.sahabhishek.moneycontrol.ui.theme.sans
import com.sahabhishek.moneycontrol.ui.web.AutoBadge
import com.sahabhishek.moneycontrol.ui.web.Btn
import com.sahabhishek.moneycontrol.ui.web.BtnStyle
import com.sahabhishek.moneycontrol.ui.web.Chip
import com.sahabhishek.moneycontrol.ui.web.Chips
import com.sahabhishek.moneycontrol.ui.web.EmptyState
import com.sahabhishek.moneycontrol.ui.web.Gutter
import com.sahabhishek.moneycontrol.ui.web.Option
import com.sahabhishek.moneycontrol.ui.web.RuleHair
import com.sahabhishek.moneycontrol.ui.web.SectionHead
import com.sahabhishek.moneycontrol.ui.web.Stamp
import com.sahabhishek.moneycontrol.ui.web.Swatch
import com.sahabhishek.moneycontrol.ui.web.WebSelect
import com.sahabhishek.moneycontrol.util.clock
import com.sahabhishek.moneycontrol.util.dayHeader
import com.sahabhishek.moneycontrol.util.groupIndian
import com.sahabhishek.moneycontrol.util.maskRef
import com.sahabhishek.moneycontrol.util.monthTitle
import com.sahabhishek.moneycontrol.util.rupeesExact
import com.sahabhishek.moneycontrol.util.shiftYm
import com.sahabhishek.moneycontrol.util.signedAmount
import kotlin.math.abs
import kotlin.math.roundToLong

private val FILTERS = listOf("all" to "All", "wire" to "From the wire", "hand" to "By hand", "untagged" to "Untagged")
private const val PAGE_SIZE = 20

/** What the ledger is showing — the web keeps this in the URL (?m&filter&q&tag&group&page). */
@kotlinx.serialization.Serializable
data class LedgerQuery(val ym: String, val filter: String = "all", val q: String? = null, val tag: Tag? = null, val page: Int = 1, val group: TagGroup? = null)

/** The quick line's typing, owned by the view model so a failed add keeps it. */
data class QuickLine(
  val payee: String = "",
  /** what it was for; never required */
  val item: String = "",
  val amount: String = "",
  /** how it was paid; remembered on the device, Cash until another is picked */
  val mode: String = "Cash",
  val tagId: Long? = null,
  val pending: Boolean = false,
  val error: String? = null,
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LedgerList(
  page: EntriesPage,
  query: LedgerQuery,
  groups: List<TagGroup>,
  tags: List<Tag>,
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
      afterTitle = if (query.tag == null && query.group == null) null else {
        {
          FlowRow(horizontalArrangement = Arrangement.spacedBy(13.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            query.tag?.let { t -> Stamp("${t.name} ×", t.color, onClick = { onQuery(query.copy(tag = null, page = 1)) }, spacing = 0.08) }
            query.group?.let { g -> Stamp("Group · ${g.name} ×", "ink", onClick = { onQuery(query.copy(group = null, page = 1)) }, spacing = 0.08) }
          }
        }
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
          if (groups.isNotEmpty()) GroupPicker(groups, query.group?.id) { g -> onQuery(query.copy(group = g, page = 1)) }
        }
      },
    )

    if (ym == currentYm) QuickEntry(quick, tags, onQuickChange, onQuickAdd)
    else Text(
      "+ ADD A LINE TO ${monthTitle(ym).uppercase()} $year",
      Modifier.padding(horizontal = Gutter).fillMaxWidth().dashedBorder().clickable(role = Role.Button, onClick = onAddPast).padding(horizontal = 13.dp, vertical = 14.dp),
      style = mono(10.sp, spacing = 0.1),
      color = Ledger.colors.inkMuted,
    )

    if (page.entries.isEmpty()) {
      Box(Modifier.padding(horizontal = Gutter)) { Empty(bookIsEmpty, query, ym) { onQuery(query.copy(q = null, filter = "all", tag = null, group = null, page = 1)) } }
    } else {
      // Cash moved to the wallet isn't counted in the day's net, as in the balance.
      val dayNet = page.entries.groupBy { it.occurredAt.take(10) }.mapValues { (_, v) -> v.filter { !it.toWallet }.sumOf { it.amount } }
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

/** GroupPicker.tsx — reads the ledger through one tag group ("Every group" / "Group · Health"). */
@Composable
private fun GroupPicker(groups: List<TagGroup>, current: Long?, onPick: (TagGroup?) -> Unit) {
  val c = Ledger.colors
  WebSelect(
    listOf(Option<Long?>(null, "Every group")) + groups.map { Option<Long?>(it.id, "Group · ${it.name}") },
    current,
    { id -> onPick(groups.firstOrNull { it.id == id }) },
    Modifier.semantics { contentDescription = "Show one group of tags" },
    fill = false,
    textStyle = mono(10.sp, spacing = 0.06).copy(color = c.inkBase),
    uppercase = true,
    look = Modifier.heightIn(min = 30.dp).background(c.paperRaised).border(1.dp, c.ruleHair).padding(horizontal = 8.dp, vertical = 4.dp),
  )
}

/**
 * QuickEntry.tsx at the phone layout, three rows: "+ Who did you pay?  ₹ 0.00",
 * "What for?", then paid-by, tag and ADD LINE (ADDING… while it saves). Enter adds too.
 */
@Composable
private fun QuickEntry(quick: QuickLine, tags: List<Tag>, onChange: (QuickLine) -> Unit, onAdd: () -> Unit) {
  val c = Ledger.colors
  val source = remember { MutableInteractionSource() }
  val amountSource = remember { MutableInteractionSource() }
  val itemSource = remember { MutableInteractionSource() }
  val focused = source.collectIsFocusedAsState().value || amountSource.collectIsFocusedAsState().value || itemSource.collectIsFocusedAsState().value
  val amountFocus = remember { FocusRequester() }
  val itemFocus = remember { FocusRequester() }
  Column(Modifier.padding(horizontal = Gutter)) {
    Column(
      Modifier.fillMaxWidth().background(c.paperSunk).dashedBorder(solid = focused).padding(13.dp),
      verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
      Row(
        Modifier.fillMaxWidth(),
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
          keyboardActions = KeyboardActions(onNext = { itemFocus.requestFocus() }),
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
      BasicTextField(
        quick.item,
        { if (it.length <= 120) onChange(quick.copy(item = it, error = null)) },
        Modifier.fillMaxWidth().padding(start = 36.dp).focusRequester(itemFocus).semantics { contentDescription = "What for?" },
        textStyle = sans(14.sp, color = c.inkBase),
        singleLine = true,
        cursorBrush = SolidColor(c.inkBase),
        interactionSource = itemSource,
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
        keyboardActions = KeyboardActions(onNext = { amountFocus.requestFocus() }),
        decorationBox = { inner -> Box { if (quick.item.isEmpty()) Text("What for?", style = sans(14.sp), color = c.inkMuted); inner() } },
      )
      Row(
        Modifier.fillMaxWidth().padding(start = 36.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        QuickMode(quick.mode) { onChange(quick.copy(mode = it, error = null)) }
        QuickTag(tags, quick.tagId, Modifier.weight(1f, fill = false)) { onChange(quick.copy(tagId = it, error = null)) }
        Spacer(Modifier.weight(1f))
        Btn(
          if (quick.pending) "Adding…" else "Add line",
          { if (!quick.pending) onAdd() },
          style = BtnStyle.Ink,
          enabled = !quick.pending,
          padding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
        )
      }
    }
    quick.error?.let { Text(it, Modifier.padding(start = 51.dp, top = 4.dp), style = mono(9.sp, spacing = 0.08), color = c.spend) }
  }
}

/** The quick line's tag (.quickTag): dashed ink border, "+ TAG" until one is picked, spending then income. */
@Composable
private fun QuickTag(tags: List<Tag>, selected: Long?, modifier: Modifier = Modifier, onSelect: (Long?) -> Unit) {
  val c = Ledger.colors
  var open by remember { mutableStateOf(false) }
  val tag = tags.firstOrNull { it.id == selected }
  Box(modifier) {
    Row(
      Modifier
        .dashedBorder()
        .clickable(onClickLabel = "Choose a tag") { open = true }
        .padding(start = 8.dp, end = 10.dp, top = 4.dp, bottom = 4.dp)
        .semantics { contentDescription = tag?.let { "Tag: ${it.name}" } ?: "Tag" },
      horizontalArrangement = Arrangement.spacedBy(6.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Image(painterResource(R.drawable.ic_plus_tag), null, Modifier.size(9.dp))
      Text((tag?.name ?: "Tag").uppercase(), style = mono(9.sp, spacing = 0.09), color = if (tag == null) c.inkMuted else c.inkBase, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
    DropdownMenu(open, { open = false }, containerColor = c.paperRaised) {
      DropdownMenuItem(text = { Text("No tag", style = mono(12.sp), color = c.inkMuted) }, onClick = { open = false; onSelect(null) })
      listOf("spend" to "Spending", "income" to "Income").forEach { (kind, label) ->
        val group = tags.filter { it.kind == kind }
        if (group.isEmpty()) return@forEach
        Text(label.uppercase(), Modifier.padding(horizontal = 12.dp, vertical = 6.dp), style = mono(9.sp, spacing = 0.1), color = c.inkFaint)
        group.forEach { t ->
          DropdownMenuItem(
            text = { Text(t.name, style = sans(14.sp), color = c.inkBase) },
            leadingIcon = { Swatch(t.color) },
            onClick = { open = false; onSelect(t.id) },
          )
        }
      }
    }
  }
}

/** The quick line's "paid by" chip (.quickMode): solid ink border, mono caps, a menu of the ways to pay. */
@Composable
private fun QuickMode(mode: String, onSelect: (String) -> Unit) {
  val c = Ledger.colors
  var open by remember { mutableStateOf(false) }
  Box {
    Text(
      mode.uppercase(),
      Modifier
        .border(1.dp, c.inkBase)
        .clickable(onClickLabel = "Change how it was paid") { open = true }
        .padding(horizontal = 8.dp, vertical = 4.dp)
        .semantics { contentDescription = "Paid by $mode" },
      style = mono(9.sp, spacing = 0.09),
      color = c.inkBase,
    )
    DropdownMenu(open, { open = false }, containerColor = c.paperRaised) {
      QUICK_CHANNELS.forEach { m ->
        DropdownMenuItem(
          text = { Text(m, style = mono(12.sp, if (m == mode) FontWeight.SemiBold else FontWeight.Normal), color = c.inkBase) },
          onClick = { open = false; onSelect(m) },
        )
      }
    }
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
  val metaSm = listOfNotNull(clock(e.occurredAt), e.channel, e.ref?.let { if (e.channel == "Cheque") "No. $it" else maskRef(it) } ?: e.note).joinToString(" · ")
  Column(Modifier.fillMaxWidth().clickable(role = Role.Button) { onOpen(e) }) {
    Column(Modifier.fillMaxWidth().padding(horizontal = Gutter, vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        Row(Modifier.weight(1f).padding(end = 12.dp), horizontalArrangement = Arrangement.spacedBy(9.dp), verticalAlignment = Alignment.CenterVertically) {
          Text(e.payee, Modifier.weight(1f, fill = false), style = sans(16.sp, FontWeight.SemiBold, spacing = -0.005), color = c.inkBase, maxLines = 1, overflow = TextOverflow.Ellipsis)
          e.item?.let { Text(it, Modifier.weight(1f, fill = false), style = sans(14.sp), color = c.inkMuted, maxLines = 1, overflow = TextOverflow.Ellipsis) }
          if (e.source == "wire") AutoBadge(e.auto)
        }
        // Cash moved to the wallet: shown, but it isn't spending.
        Text(signedAmount(e.amount), style = mono(16.sp, FontWeight.Medium), color = if (e.toWallet) c.inkFaint else if (e.amount > 0) c.credit else c.inkBase)
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
            e.toWallet -> Text(
              "TO WALLET",
              Modifier.border(1.dp, c.inkBase).padding(horizontal = 9.dp, vertical = 4.dp)
                .semantics { contentDescription = "To wallet: cash taken out to spend. The cash lines you write down count as spending instead" },
              style = mono(9.sp, FontWeight.Medium, 0.08),
              color = c.inkBase,
              maxLines = 1,
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
    body = "Search looks at payee names, what things were for, notes, references and accounts in ${monthTitle(ym)}. Try another month or a shorter word.",
    action = { Btn("Clear search", onClear) },
  )
  q.tag != null || q.group != null || q.filter != "all" -> EmptyState(
    // The web shows the tag's message first, then the group's, then the filter's.
    when {
      q.tag != null -> "Nothing stamped with this tag this month."
      q.group != null -> "Nothing stamped with this group's tags this month."
      q.filter == "untagged" -> "Every spend this month has a tag."
      q.filter == "wire" -> "Nothing came from the wire this month."
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
