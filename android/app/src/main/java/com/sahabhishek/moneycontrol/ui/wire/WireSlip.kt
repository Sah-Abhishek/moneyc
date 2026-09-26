package com.sahabhishek.moneycontrol.ui.wire

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sahabhishek.moneycontrol.R
import com.sahabhishek.moneycontrol.data.Filing
import com.sahabhishek.moneycontrol.data.api.ParsedMail
import com.sahabhishek.moneycontrol.data.api.Rule
import com.sahabhishek.moneycontrol.data.api.Tag
import com.sahabhishek.moneycontrol.data.api.WireSlip
import com.sahabhishek.moneycontrol.ui.theme.Ledger
import com.sahabhishek.moneycontrol.ui.theme.Mono
import com.sahabhishek.moneycontrol.ui.theme.mono
import com.sahabhishek.moneycontrol.ui.theme.sans
import com.sahabhishek.moneycontrol.ui.web.Btn
import com.sahabhishek.moneycontrol.ui.web.BtnStyle
import com.sahabhishek.moneycontrol.ui.web.ConfirmButton
import com.sahabhishek.moneycontrol.ui.web.FieldError
import com.sahabhishek.moneycontrol.ui.web.Option
import com.sahabhishek.moneycontrol.ui.web.Rule as RuleLine
import com.sahabhishek.moneycontrol.ui.web.RuleHair
import com.sahabhishek.moneycontrol.ui.web.Segmented
import com.sahabhishek.moneycontrol.ui.web.WebSelect
import com.sahabhishek.moneycontrol.ui.web.mix
import com.sahabhishek.moneycontrol.util.clock12
import com.sahabhishek.moneycontrol.util.dayMonth
import com.sahabhishek.moneycontrol.util.groupIndian
import com.sahabhishek.moneycontrol.util.maskRef
import com.sahabhishek.moneycontrol.util.posted
import com.sahabhishek.moneycontrol.util.rupees
import com.sahabhishek.moneycontrol.util.rupeesExact
import kotlin.math.abs
import kotlin.math.roundToInt

/** One parsed mail on the desk (WireSlip.tsx). What the parser read is highlighted; Edit turns it into inputs. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun WireSlipCard(
  slip: WireSlip,
  tags: List<Tag>,
  busy: String?,
  error: String?,
  fieldErrors: Map<String, String>,
  onFile: (Filing) -> Unit,
  onArchive: () -> Unit,
  onDelete: () -> Unit,
  onSameAs: (Long) -> Unit,
) {
  val c = Ledger.colors
  val p = slip.parsed
  val incomplete = slip.incomplete
  var editing by rememberSaveable(slip.id) { mutableStateOf(incomplete) }
  var payee by rememberSaveable(slip.id) { mutableStateOf(p.payee.orEmpty()) }
  var amount by rememberSaveable(slip.id) { mutableStateOf(p.amountPaise?.let(::rupeesExact).orEmpty()) }
  var toSlate by rememberSaveable(slip.id) { mutableStateOf(slip.person != null) }
  var dismissedDuplicate by rememberSaveable(slip.id) { mutableStateOf(false) }
  var tagId by rememberSaveable(slip.id) { mutableStateOf(slip.suggestion?.tag?.id) }
  // Cash from an ATM: spending only if the owner won't write down what it buys. Always asked.
  val atm = p.channel == "ATM" && p.direction == "debit"
  var cash by rememberSaveable(slip.id) { mutableStateOf<String?>(null) }

  val needsReview = slip.suggestion == null || slip.confidence < 0.8 || slip.askFirst || atm
  val tone = if (slip.confidence >= 0.9) c.credit else c.pending
  val credit = p.isCredit
  val person = slip.person
  val personAfter = if (person != null && p.amountPaise != null) person.balance + (if (credit) -p.amountPaise else p.amountPaise) else null
  val pending = busy == "file"

  Column(Modifier.fillMaxWidth().background(c.paperRaised).border(1.dp, c.inkBase).semantics { contentDescription = "Mail from ${slip.bank}" }) {
    // head
    Row(Modifier.fillMaxWidth().background(c.paperSunk).padding(horizontal = 13.dp, vertical = 10.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
      FlowRow(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(8.dp), itemVerticalAlignment = Alignment.CenterVertically) {
        Image(painterResource(R.drawable.ic_mail), null, Modifier.size(13.dp))
        Text(
          buildAnnotatedString {
            append(slip.bank.uppercase())
            withStyle(SpanStyle(fontWeight = FontWeight.Normal, color = c.inkFaint)) { append(" · ${clock12(slip.receivedAt)}") }
          },
          style = mono(10.sp, FontWeight.Medium, 0.09),
          color = c.inkBase,
        )
      }
      when {
        slip.askFirst -> Badge("Check this one", c.paperBase, c.pending)
        needsReview -> Badge("Needs review", c.paperBase, c.pending)
        else -> Text(
          if (credit) "CREDIT" else "DEBIT",
          Modifier.background((if (credit) c.credit else c.inkBase).mix(if (credit) 0.12f else 0.08f))
            .border(1.dp, (if (credit) c.credit else c.inkBase).mix(if (credit) 0.5f else 0.45f)).padding(horizontal = 8.dp, vertical = 3.dp),
          style = mono(8.sp, FontWeight.Medium, 0.11),
          color = if (credit) c.credit else c.inkBase,
        )
      }
    }
    RuleLine()

    val dup = slip.duplicateOf
    if (dup != null && !dismissedDuplicate) {
      Column(
        Modifier.fillMaxWidth().background(c.pending.mix(0.10f)).padding(horizontal = 13.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
      ) {
        Text(
          buildAnnotatedString {
            withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append("Looks like a line you already have:") }
            append(" ${dup.payee}, ₹${rupeesExact(abs(dup.amount))} on ${dayMonth(dup.occurredAt)}.")
          },
          style = sans(13.sp, lineHeight = 1.45),
          color = c.inkBase,
        )
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
          Btn(if (busy == "dup") "Matching…" else "It’s the same one", { onSameAs(dup.id) }, style = BtnStyle.Ink, enabled = busy == null)
          Btn("No, it's separate", { dismissedDuplicate = true })
        }
      }
      RuleLine(color = c.pending.mix(0.4f))
    }

    // body
    Column(Modifier.fillMaxWidth().padding(13.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
      Text(
        // A <p> on the web: line breaks in the mail read as spaces.
        (if ((slip.subject?.length ?: 0) > 30) slip.subject!! else firstSentence(slip.body)).replace(Regex("\\s+"), " ").trim(),
        style = sans(13.sp, FontWeight.Medium, lineHeight = 1.38),
        color = c.inkBase,
      )
      Column {
        Field("Payee", first = true) {
          if (editing) {
            SlipInput(payee, { payee = it }, fieldErrors["payee"] != null, "Payee")
            FieldError(fieldErrors["payee"])
          } else Found(p.payee)
        }
        Field("Amount") {
          if (editing) {
            SlipInput(amount, { amount = it }, fieldErrors["amount"] != null, "Amount", KeyboardType.Decimal)
            FieldError(fieldErrors["amount"])
          } else Found(p.amountPaise?.let { "₹ ${rupeesExact(it)}" })
        }
        Field(accountLabel(p)) { Found(p.account?.let { "${slip.bank} ****$it" }) }
        Field(if (p.channel == "Cheque") "Cheque no." else "Ref / RRN") { Found(p.ref?.let(::maskRef)) }
        Field("Posted") { Text(posted(slip.occurredAt), style = mono(11.sp, spacing = 0.01), color = c.inkBase) }
      }

      if (person != null) {
        Column(Modifier.fillMaxWidth().background(c.paperSunk).padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
          Text(
            buildAnnotatedString {
              append("${if (credit) "${person.name} owes you" else "On the slate with ${person.name}"}: ₹${rupees(abs(person.balance))}")
              if (personAfter != null) {
                append(" → ")
                withStyle(SpanStyle(fontFamily = Mono, fontWeight = FontWeight.SemiBold)) { append("₹${rupees(abs(personAfter))}") }
                if (personAfter < 0) append(" (you'd owe them)")
              }
            },
            style = sans(13.sp, lineHeight = 1.45),
            color = c.inkBase,
          )
          Segmented(
            listOf(true to (if (credit) "Settles the slate" else "Add to slate"), false to (if (credit) "Just income" else "Just an expense")),
            toSlate,
            { toSlate = it },
          )
        }
      }

      if (!toSlate && atm) {
        Column(Modifier.fillMaxWidth().background(c.paperSunk).padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
          Text(
            when (cash) {
              "wallet" -> "Moves to your wallet: not counted as spending. The cash lines you write down are."
              "spent" -> "Counted as spent now. Don't also write down what you buy with it."
              else -> "Cash from an ATM. Will you write down what you spend it on?"
            },
            style = sans(13.sp, lineHeight = 1.45),
            color = c.inkBase,
          )
          Segmented(listOf("wallet" to "Log each spend", "spent" to "Count as spent"), cash, { cash = it })
          FieldError(fieldErrors["cash"])
        }
      }

      if (!toSlate && !(atm && cash == "wallet")) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp), itemVerticalAlignment = Alignment.CenterVertically) {
          Text(
            if (slip.suggestion != null) "SUGGESTED TAG" else "NEEDS A TAG",
            Modifier.width(86.dp),
            style = mono(9.sp, FontWeight.Medium, 0.13),
            color = if (slip.suggestion != null) c.inkFaint else c.pending,
          )
          TagPicker(tags, tagId, credit) { tagId = it }
          slip.suggestion?.let { Text(it.basis, style = mono(9.sp, spacing = 0.03), color = c.inkFaint) }
        }
      }
    }
    RuleHair()

    // foot
    FlowRow(
      Modifier.fillMaxWidth().padding(horizontal = 13.dp, vertical = 12.dp),
      horizontalArrangement = Arrangement.spacedBy(12.dp),
      verticalArrangement = Arrangement.spacedBy(10.dp),
      itemVerticalAlignment = Alignment.CenterVertically,
    ) {
      Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("MATCH CONFIDENCE", style = mono(8.sp, FontWeight.Medium, 0.13), color = c.inkFaint)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
          val pct = (slip.confidence * 100).roundToInt()
          Box(Modifier.width(104.dp).heightIn(4.dp, 4.dp).background(c.ruleHair).semantics { contentDescription = "$pct percent" }) {
            Box(Modifier.fillMaxWidth(slip.confidence.toFloat().coerceIn(0f, 1f)).fillMaxHeight().background(tone))
          }
          Text("$pct%", style = mono(10.sp, FontWeight.Medium), color = tone)
        }
      }
      FlowRow(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        val quiet = PaddingValues(horizontal = 6.dp, vertical = 10.dp)
        ConfirmButton(
          "Delete", "Delete this mail for good?", onDelete, confirmLabel = "Delete", pending = busy == "delete",
          borderColor = Color.Transparent, contentColor = c.inkFaint, padding = quiet,
        )
        Btn(if (busy == "archive") "…" else "Archive", onArchive, enabled = busy == null, borderColor = Color.Transparent, contentColor = c.inkFaint, padding = quiet)
        if (!incomplete) Btn(if (editing) "Cancel edit" else "Edit", { editing = !editing }, enabled = !pending)
        Btn(
          if (pending) "Filing…" else if (toSlate && person != null) (if (credit) "Settle it" else "Add to slate") else if (slip.suggestion != null && !editing) "Confirm" else "File it",
          {
            onFile(
              Filing(
                tagId = if (toSlate && person != null) null else if (atm && cash == "wallet") null else tagId,
                personId = if (toSlate) person?.id else null,
                payee = if (editing) payee else null,
                amount = if (editing) amount else null,
                cash = if (atm && !toSlate) cash else null,
              ),
            )
          },
          style = BtnStyle.Ink,
          enabled = busy == null,
        )
      }
    }
    error?.takeIf { fieldErrors.isEmpty() || it !in fieldErrors.values }?.let {
      Text(it, Modifier.padding(start = 13.dp, end = 13.dp, bottom = 12.dp), style = mono(9.sp), color = c.spend)
    }
  }
}

@Composable
private fun Badge(text: String, fg: Color, bg: Color) =
  Text(text.uppercase(), Modifier.background(bg).padding(start = 7.dp, end = 8.dp, top = 3.dp, bottom = 3.dp), style = mono(8.sp, FontWeight.Medium, 0.11), color = fg)

/** Which of your accounts the money moved through, named by the way it moved. */
private fun accountLabel(p: ParsedMail) = when {
  p.channel == "Card" -> "Card"
  p.direction == "credit" -> "Into account"
  p.direction == "debit" -> "From account"
  else -> "Account"
}

@Composable
private fun Field(label: String, first: Boolean = false, content: @Composable () -> Unit) = Column {
  if (!first) RuleHair()
  Row(Modifier.fillMaxWidth().heightIn(min = 31.dp).padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
    Text(label.uppercase(), Modifier.width(86.dp), style = mono(9.sp, FontWeight.Medium, 0.13), color = Ledger.colors.inkFaint)
    Column(Modifier.weight(1f)) { content() }
  }
}

/** What the parser pulled out, highlighted — or a note that it couldn't. */
@Composable
private fun Found(value: String?) {
  val c = Ledger.colors
  if (value != null) Text(value, Modifier.background(c.spendBright.mix(0.2f)).padding(horizontal = 5.dp, vertical = 2.dp), style = mono(11.sp, FontWeight.Medium, 0.01), color = c.inkBase)
  else Text("couldn't read this", style = mono(10.sp).copy(fontStyle = FontStyle.Italic), color = c.inkFaint)
}

@Composable
private fun SlipInput(value: String, onChange: (String) -> Unit, invalid: Boolean, label: String, keyboard: KeyboardType = KeyboardType.Text) {
  val c = Ledger.colors
  BasicTextField(
    value,
    { if (it.length <= 120) onChange(it) },
    Modifier.fillMaxWidth().background(c.paperBase).border(1.dp, if (invalid) c.spend else c.inkBase).padding(horizontal = 5.dp, vertical = 3.dp).semantics { contentDescription = label },
    textStyle = mono(11.sp, FontWeight.Medium).copy(color = c.inkBase),
    singleLine = true,
    cursorBrush = SolidColor(c.inkBase),
    keyboardOptions = KeyboardOptions(keyboardType = keyboard),
  )
}

/** The slip's tag choice: the chosen tag as a stamp, or an ochre "Pick a tag". */
@Composable
private fun TagPicker(tags: List<Tag>, selected: Long?, credit: Boolean, onSelect: (Long?) -> Unit) {
  val c = Ledger.colors
  val tag = tags.firstOrNull { it.id == selected }
  val first = if (credit) "income" else "spend"
  val ordered = tags.sortedBy { if (it.kind == first) 0 else 1 }
  val options = listOf(Option<Long?>(null, if (credit) "No tag" else "Pick a tag")) + ordered.map { Option<Long?>(it.id, it.name) }
  val tone = tag?.let { c.stamp(it.color) } ?: c.pending
  WebSelect(
    options, selected, onSelect,
    fill = false,
    textStyle = mono(9.sp, FontWeight.Medium, 0.09).copy(color = tone),
    uppercase = true,
    chevron = if (tag == null) com.sahabhishek.moneycontrol.ui.web.Chevron.Ochre else com.sahabhishek.moneycontrol.ui.web.Chevron.None,
    look = Modifier.background(tone.mix(0.12f)).border(1.dp, tone.mix(if (tag == null) 0.5f else 0.4f)).padding(horizontal = 9.dp, vertical = 5.dp),
  )
}

/** The mail's opening sentence, minus the greeting (WireSlip.tsx firstSentence). */
fun firstSentence(body: String): String {
  val text = body.replace(Regex("^Dear (Customer|Sir|Madam|[A-Z][a-z]+),?\\s*", RegexOption.IGNORE_CASE), "")
  val first = text.split(Regex("(?<!\\b(?:Rs|no|No|Ref))\\.\\s+(?=[A-Z])"))[0]
  return first.replace(Regex("\\.?$"), ".").take(220)
}

/** ruleText.ts — plain-language rule descriptions. */
fun describeCondition(r: Rule): String = when (r.field) {
  "sender" -> "Sender is ${r.value}"
  "payee_prefix" -> "Payee starts with ${r.value}"
  else -> "Amount over ₹ ${groupIndian(r.value.replace(Regex("[^\\d.]"), "").toDoubleOrNull()?.toLong() ?: 0)}"
}

fun describeAction(r: Rule): String = when (r.action) {
  "file" -> "File automatically"
  "tag" -> "Tag ${r.tag?.name ?: "—"}"
  else -> "Ask me first"
}
