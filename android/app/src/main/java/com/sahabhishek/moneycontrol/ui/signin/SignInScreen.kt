package com.sahabhishek.moneycontrol.ui.signin

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sahabhishek.moneycontrol.R
import com.sahabhishek.moneycontrol.auth.rememberGoogleFlow
import com.sahabhishek.moneycontrol.ui.theme.Ledger
import com.sahabhishek.moneycontrol.ui.theme.Serif
import com.sahabhishek.moneycontrol.ui.theme.mono
import com.sahabhishek.moneycontrol.ui.theme.sans
import com.sahabhishek.moneycontrol.ui.theme.serif
import com.sahabhishek.moneycontrol.ui.web.AutoBadge
import com.sahabhishek.moneycontrol.ui.web.Caption
import com.sahabhishek.moneycontrol.ui.web.DoubleRule
import com.sahabhishek.moneycontrol.ui.web.Eyebrow
import com.sahabhishek.moneycontrol.ui.web.Gutter
import com.sahabhishek.moneycontrol.ui.web.Rule
import com.sahabhishek.moneycontrol.ui.web.RuleHair
import com.sahabhishek.moneycontrol.ui.web.Stamp
import com.sahabhishek.moneycontrol.ui.web.mix
import com.sahabhishek.moneycontrol.util.longDate
import java.time.LocalDateTime
import java.time.ZoneId
import kotlinx.coroutines.launch

/** app/welcome/page.tsx at the phone layout: the door comes first, then the columns and the example. */
@Composable
fun SignInScreen(vm: SignInViewModel) {
  val state by vm.state.collectAsStateWithLifecycle()
  val ended by vm.endedNotice.collectAsStateWithLifecycle()
  val deleted by vm.deletedNotice.collectAsStateWithLifecycle()
  val signIn = rememberGoogleFlow(vm.google, vm::onStep)
  val c = Ledger.colors
  val scroll = rememberScrollState()
  val scope = rememberCoroutineScope()
  var notesTop by remember { mutableIntStateOf(0) }
  val today = LocalDateTime.now(ZoneId.of("Asia/Kolkata")).withNano(0).toString()

  Column(Modifier.fillMaxSize().background(c.paperBase).verticalScroll(scroll)) {
    // The cover
    Column(Modifier.fillMaxWidth().padding(start = Gutter, end = Gutter, top = 22.dp)) {
      Row(Modifier.fillMaxWidth().padding(bottom = 16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        val folio = mono(10.sp, FontWeight.Medium, 0.16)
        Text("VOL. 1 · NO. 1", style = folio, color = c.inkMuted)
        Text(longDate(today), style = folio, color = c.inkMuted)
      }
      Rule()
      Column(Modifier.fillMaxWidth().padding(top = 34.dp, bottom = 30.dp), verticalArrangement = Arrangement.spacedBy(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("Money Control", Modifier.semantics { heading() }, style = serif(54.sp, -0.04), color = c.inkBase, textAlign = TextAlign.Center)
        Text("A personal ledger that reads your bank mail so you don’t have to.", style = serif(20.sp, lineHeight = 1.3, italic = true), color = c.inkMuted, textAlign = TextAlign.Center)
      }
      DoubleRule()
    }

    Column(Modifier.fillMaxWidth().padding(start = Gutter, end = Gutter, top = 40.dp, bottom = 44.dp), verticalArrangement = Arrangement.spacedBy(40.dp)) {
      // The only door
      Column(Modifier.fillMaxWidth().background(c.inkBase).padding(horizontal = 22.dp, vertical = 26.dp)) {
        Text("THE ONLY DOOR", style = mono(10.sp, FontWeight.Medium, 0.16), color = c.paperBase.mix(0.7f))
        Text("There is one way in.", Modifier.padding(top = 8.dp, bottom = 14.dp), style = serif(36.sp, -0.015, 1.08), color = c.paperBase)
        Text(
          "Money Control works by reading the transaction mail your bank already sends you. That needs Google — so Google is the only door. Nothing to set, no password to forget.",
          style = sans(13.sp, lineHeight = 1.72),
          color = c.paperBase.mix(0.82f),
        )
        if (deleted) Text(
          "Your account and everything in it has been deleted, and our access to your mail has been revoked.",
          Modifier.padding(top = 18.dp).fillMaxWidth().border(1.dp, c.paperBase.mix(0.4f)).padding(horizontal = 13.dp, vertical = 11.dp),
          style = sans(13.sp, lineHeight = 1.5),
          color = c.paperBase,
        )
        ended?.let {
          Text(it, Modifier.padding(top = 18.dp).fillMaxWidth().border(1.dp, c.paperBase.mix(0.4f)).padding(horizontal = 13.dp, vertical = 11.dp), style = sans(13.sp, lineHeight = 1.5), color = c.paperBase)
        }
        state.error?.let {
          Text(
            it,
            Modifier.padding(top = 18.dp).fillMaxWidth().background(c.spendBright.mix(0.22f)).border(1.dp, c.spendBright).padding(horizontal = 13.dp, vertical = 11.dp),
            style = sans(13.sp, lineHeight = 1.5),
            color = c.paperBase,
          )
        }
        val configured = vm.google.isConfigured
        Row(
          Modifier.padding(top = 24.dp, bottom = 20.dp).fillMaxWidth().alpha(if (configured) 1f else 0.55f).background(c.paperBase)
            .clickable(enabled = configured && !state.working, role = Role.Button) { if (vm.starting()) signIn() }
            .padding(17.dp),
          horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Image(painterResource(R.drawable.ic_google), null, Modifier.size(19.dp))
          Text(
            if (!configured) "Sign-in not set up on this server" else if (state.working) "Waiting for Google…" else "Continue with Google",
            style = sans(15.sp, if (configured) FontWeight.SemiBold else FontWeight.Medium, spacing = -0.003),
            color = c.inkBase,
          )
        }
        Column(verticalArrangement = Arrangement.spacedBy(11.dp)) {
          listOf(
            "Read-only, and only mail from bank and wallet senders",
            "Your Google password never reaches this app",
            "Revoke the access any time, here or from your Google account",
          ).forEach {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
              Image(painterResource(R.drawable.ic_check_bright), null, Modifier.padding(top = 2.dp).size(13.dp))
              Text(it, style = mono(10.sp, spacing = 0.02).copy(lineHeight = 16.sp), color = c.paperBase.mix(0.85f))
            }
          }
        }
        Column(Modifier.padding(top = 22.dp)) {
          Rule(color = c.paperBase.mix(0.25f))
          Row(Modifier.fillMaxWidth().padding(top = 14.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            val foot = mono(8.5.sp, spacing = 0.12)
            Text("PRIVACY NOTE", Modifier.clickable(role = Role.Button) { scope.launch { scroll.animateScrollTo(notesTop) } }, style = foot, color = c.paperBase.mix(0.6f))
            Row(Modifier.clickable(role = Role.Button) { scope.launch { scroll.animateScrollTo(notesTop) } }, horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
              Text("WHY ONLY GOOGLE?", style = foot.copy(fontWeight = FontWeight.Medium), color = c.spendBright)
              Image(painterResource(R.drawable.ic_arrow_bright), null, Modifier.size(10.dp))
            }
          }
        }
      }

      // The three columns
      Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
        Feature("One", "It reads the mail", "Every UPI alert, card swipe and NEFT credit your bank already emails you gets parsed into a line — payee, amount, channel, reference, time. You confirm it; the book files it.")
        Feature("Two", "It keeps the book", "Entries land in a ruled ledger with a running balance down the right margin. Stamp them with tags, budget against them, and watch the month burn down day by day.")
        Feature("Three", "It settles the slate", "Money you lent friends and money you borrowed from family sits on an open slate. When a repayment turns up in your inbox, it clears the debt for you.")
      }

      Specimen()
    }

    // Notes
    Column(
      Modifier.fillMaxWidth().padding(start = Gutter, end = Gutter, bottom = 32.dp).onGloballyPositioned { notesTop = it.positionInParent().y.toInt() },
      verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
      Note(
        "Why only Google?",
        "The wire — the part that turns bank alerts into ledger lines — needs to read those alerts, and they arrive in Gmail. A separate password would add a second door without removing the need for the first. If you'd rather not share mail access, Money Control can't do its main job for you.",
      )
      Note(
        "Privacy note",
        "We ask Google for read-only mail access and search only for mail from bank and wallet senders (plus any sender you add in Rules) — or, if you prefer, only the senders you list in Settings. Alerts that aren't transactions are skipped and their text is never stored. Your Google tokens are encrypted at rest. Disconnect Gmail or delete your account from Settings at any time; deleting removes everything.",
      )
    }

    // Footer
    Column(Modifier.fillMaxWidth().padding(horizontal = Gutter)) {
      Rule()
      Column(Modifier.padding(top = 26.dp, bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        listOf(
          "No bank logins" to "We never ask for net-banking credentials",
          "No password" to "Google holds the key, not us",
          "Read-only Gmail scope" to "We can read the alerts, nothing else",
        ).forEach { (t, s) ->
          Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Eyebrow(t)
            Caption(s)
          }
        }
      }
    }
  }
}

@Composable
private fun Feature(n: String, title: String, body: String) = Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
  val c = Ledger.colors
  Text(
    buildAnnotatedString {
      withStyle(SpanStyle(fontFamily = Serif, fontWeight = FontWeight.Normal, fontSize = 19.sp, color = c.spend)) { append(n) }
      append("  ")
      append(title)
    },
    Modifier.semantics { heading() },
    style = sans(17.sp, FontWeight.SemiBold, spacing = -0.01),
    color = c.inkBase,
  )
  RuleHair()
  Text(body, style = sans(13.5.sp, lineHeight = 1.65), color = c.inkMuted)
}

/** "What actually happens" — one mail becoming one line. */
@Composable
private fun Specimen() {
  val c = Ledger.colors
  Column(Modifier.fillMaxWidth().border(1.dp, c.inkBase).background(c.paperRaised)) {
    Row(
      Modifier.fillMaxWidth().background(c.paperSunk).padding(horizontal = 16.dp, vertical = 11.dp),
      horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      Eyebrow("What actually happens", Modifier.weight(1f))
      Caption("An example · one mail · one line · no typing", Modifier.weight(1f))
    }
    Rule()
    Column(Modifier.padding(horizontal = 16.dp, vertical = 18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
          Image(painterResource(R.drawable.ic_mail_faint), null, Modifier.size(12.dp))
          Text("BANK ALERTS · 11:18 AM", style = mono(9.sp, spacing = 0.1), color = c.inkFaint)
        }
        Text(
          "Dear Customer,\nYour fund transfer request through UPI has been\nprocessed successfully.\n\n1. Payee Name : A SHOPKEEPER\n2. Amount : Rs. 10.00\n3. Channel : UPI\n4. Transaction ID/RRN : 626xxxxx72\n5. Date and Time : 22-09-2026 11:18:42",
          style = mono(10.sp).copy(lineHeight = 16.sp),
          color = c.inkBase,
        )
      }
      Row(horizontalArrangement = Arrangement.spacedBy(9.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(34.dp).background(c.inkBase), contentAlignment = Alignment.Center) {
          Image(painterResource(R.drawable.ic_arrow_paper), null, Modifier.size(15.dp).rotate(90f))
        }
        Text("PARSED", style = mono(8.sp, FontWeight.Medium, 0.12), color = c.spend)
      }
      Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Caption("The line it files")
        RuleHair()
        Text("22 SEP · 11:18", Modifier.padding(top = 6.dp), style = mono(10.sp, FontWeight.Medium, 0.08), color = c.inkBase)
        Row(horizontalArrangement = Arrangement.spacedBy(9.dp), verticalAlignment = Alignment.CenterVertically) {
          Text("A SHOPKEEPER", style = sans(17.sp, FontWeight.SemiBold), color = c.inkBase)
          AutoBadge(auto = true)
        }
        Text("UPI · RRN 626xxxxx72", style = mono(9.sp), color = c.inkFaint)
        Column {
          Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Stamp("Food & delivery", "spend")
            Text("−10.00", style = mono(18.sp, FontWeight.Medium), color = c.inkBase)
          }
          RuleHair()
        }
      }
    }
  }
}

@Composable
private fun Note(title: String, body: String) = Column {
  Eyebrow(title)
  Text(body, Modifier.padding(top = 10.dp), style = sans(13.sp, lineHeight = 1.65), color = Ledger.colors.inkMuted)
}
