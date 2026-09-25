package com.sahabhishek.moneycontrol.ui.reports

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.BaselineShift
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sahabhishek.moneycontrol.data.api.GroupReport
import com.sahabhishek.moneycontrol.data.api.Tag
import com.sahabhishek.moneycontrol.data.api.TagGroup
import com.sahabhishek.moneycontrol.ui.theme.Ledger
import com.sahabhishek.moneycontrol.ui.theme.mono
import com.sahabhishek.moneycontrol.ui.theme.sans
import com.sahabhishek.moneycontrol.ui.theme.serif
import com.sahabhishek.moneycontrol.ui.web.Btn
import com.sahabhishek.moneycontrol.ui.web.Caption
import com.sahabhishek.moneycontrol.ui.web.Chip
import com.sahabhishek.moneycontrol.ui.web.Chips
import com.sahabhishek.moneycontrol.ui.web.EmptyState
import com.sahabhishek.moneycontrol.ui.web.Gutter
import com.sahabhishek.moneycontrol.ui.web.Rule
import com.sahabhishek.moneycontrol.ui.web.SectionHead
import com.sahabhishek.moneycontrol.ui.web.Swatch
import com.sahabhishek.moneycontrol.util.monthLong
import com.sahabhishek.moneycontrol.util.monthTitle
import com.sahabhishek.moneycontrol.util.percent
import com.sahabhishek.moneycontrol.util.rupees
import com.sahabhishek.moneycontrol.util.shiftYm

// GroupReports.tsx: spending read through tag groups, each group's month split
// by its tags. `selected` narrows it to one group (?group=); a tag in two groups
// counts in both, so the groups need not add up to the month.
@Composable
fun GroupReports(
  ym: String,
  reports: List<GroupReport>,
  selected: Long?,
  onSelect: (Long?) -> Unit,
  onMakeGroup: () -> Unit,
  onTag: (Tag) -> Unit,
  onLines: (TagGroup) -> Unit,
  modifier: Modifier = Modifier,
) = Column(modifier.fillMaxWidth().padding(start = Gutter, end = Gutter, bottom = 38.dp)) {
  val shown = if (selected == null) reports else reports.filter { it.group.id == selected }
  Rule()
  SectionHead(
    "By group",
    small = "${monthTitle(ym)} ${ym.take(4)}, read through your tag groups",
    controls = if (reports.size > 1) {
      {
        Chips {
          Chip("All groups", { onSelect(null) }, current = selected == null)
          reports.forEach { r -> Chip(r.group.name, { onSelect(r.group.id) }, current = r.group.id == selected) }
        }
      }
    } else null,
  )

  if (reports.isEmpty()) {
    EmptyState(
      "No tag groups yet.",
      body = "Gather tags under one name, like Health for Healthy, Junk and Leisure, to see what each group cost this month.",
      action = { Btn("Make a group", onMakeGroup) },
    )
  } else {
    Column(verticalArrangement = Arrangement.spacedBy(28.dp)) {
      shown.forEach { r -> Group(r, onTag, onLines) }
    }
  }
}

@Composable
private fun Group(r: GroupReport, onTag: (Tag) -> Unit, onLines: (TagGroup) -> Unit) = Column(Modifier.fillMaxWidth()) {
  val c = Ledger.colors
  val byTag = r.byTag.filter { it.tag != null }
  val max = maxOf(byTag.maxOfOrNull { it.total } ?: 0, 1)
  val delta = r.spent - r.prevSpent
  val prev = monthLong(shiftYm(r.ym, -1))
  Rule()
  Column(Modifier.fillMaxWidth().padding(top = 14.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
      Text(r.group.name.uppercase(), Modifier.semantics { heading() }, style = mono(10.sp, FontWeight.Medium, 0.12), color = c.inkMuted)
      Text(
        buildAnnotatedString {
          withStyle(SpanStyle(fontSize = (34 * 0.55).sp, baselineShift = BaselineShift(0.5f), color = c.inkMuted)) { append("₹") }
          append(" ") // margin-right: 3px
          append(rupees(r.spent))
        },
        style = serif(34.sp, lineHeight = 1.1),
        color = c.inkBase,
      )
      Caption(
        "${r.count} line${if (r.count == 1) "" else "s"}" + when {
          r.prevSpent > 0 -> " · ${if (delta == 0L) "same as" else "₹${rupees(delta)} ${if (delta < 0) "less than" else "more than"}"} $prev"
          r.spent > 0 -> " · nothing in $prev"
          else -> ""
        },
      )
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
      byTag.forEach { t ->
        val tag = t.tag!!
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
          Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Row(
              Modifier.weight(1f).clickable(role = Role.Button) { onTag(tag) },
              horizontalArrangement = Arrangement.spacedBy(7.dp),
              verticalAlignment = Alignment.CenterVertically,
            ) {
              Swatch(tag.color)
              Text(tag.name, style = sans(14.sp), color = c.inkBase, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
              Text("₹${rupees(t.total)}", style = mono(11.sp), color = c.inkBase, maxLines = 1)
              Text(
                if (r.spent != 0L) percent(t.total, r.spent) else "—",
                Modifier.widthIn(min = 26.dp),
                style = mono(11.sp),
                color = c.inkFaint,
                textAlign = TextAlign.End,
                maxLines = 1,
              )
            }
          }
          Box(
            Modifier.fillMaxWidth().height(6.dp).background(c.ruleHair)
              .semantics { contentDescription = "${tag.name}: ₹${rupees(t.total)} over ${t.count} line${if (t.count == 1) "" else "s"}" },
          ) {
            Box(
              Modifier.fillMaxWidth((t.total.toFloat() / max).coerceIn(0f, 1f)).fillMaxHeight()
                .clip(RoundedCornerShape(topEnd = 3.dp, bottomEnd = 3.dp)).background(c.stamp(tag.color)),
            )
          }
        }
      }
    }
    if (r.count > 0) {
      Text(
        "SEE THE ${r.count} LINE${if (r.count == 1) "" else "S"} →",
        Modifier.clickable(role = Role.Button) { onLines(r.group) },
        style = mono(10.sp, spacing = 0.08).copy(textDecoration = TextDecoration.Underline),
        color = c.inkBase,
      )
    } else {
      Caption("Nothing spent on these tags in ${monthLong(r.ym)}.")
    }
  }
}
