package com.sahabhishek.moneycontrol.util

import java.time.Instant
import java.time.LocalDate
import kotlin.math.abs
import kotlin.math.roundToLong

// Straight ports of the website's src/lib/money.ts and src/lib/dates.ts, so
// every figure and date reads exactly as it does on the web.

// ─── money ──────────────────────────────────────────────────────────────────

/** 4821000 → "48,210" (Indian grouping: 1,00,000). */
fun groupIndian(whole: Long): String {
  val s = abs(whole).toString()
  if (s.length <= 3) return s
  val last3 = s.takeLast(3)
  val rest = s.dropLast(3).reversed().chunked(2).joinToString(",").reversed()
  return "$rest,$last3"
}

/** Whole rupees, rounded, no sign: 4860050 → "48,601". */
fun rupees(paise: Long): String = groupIndian((abs(paise) / 100.0).roundToLong())
fun rupees(paise: Double): String = groupIndian((abs(paise) / 100.0).roundToLong())

/** Rupees with paise, no sign: 4821000 → "48,210.00". */
fun rupeesExact(paise: Long): String {
  val a = abs(paise)
  return "${groupIndian(a / 100)}.${(a % 100).toString().padStart(2, '0')}"
}

/** "−486.00" / "+2,500.00" */
fun signedAmount(paise: Long): String = "${if (paise < 0) "−" else "+"}${rupeesExact(paise)}"

/** For the big serif figures: 4821000 → ("48,210", ".00") */
fun splitRupees(paise: Long): Pair<String, String> = rupeesExact(paise).split(".").let { (w, f) -> w to ".$f" }

/** "12.5%" — like the web's percent(). */
fun percent(part: Double, whole: Double, digits: Int = 0): String =
  if (whole == 0.0) "0%" else "%.${digits}f%%".format(part / whole * 100)
fun percent(part: Long, whole: Long, digits: Int = 0) = percent(part.toDouble(), whole.toDouble(), digits)

// ─── dates (wall-clock strings "YYYY-MM-DDTHH:MM:SS") ────────────────────────

private val MON = listOf("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC")
private val MONTH = listOf("JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER")
private val WEEKDAY = listOf("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY")

private fun pad(n: Int) = n.toString().padStart(2, '0')
private fun y(iso: String) = iso.substring(0, 4).toInt()
private fun m(iso: String) = iso.substring(5, 7).toInt()
private fun d(iso: String) = iso.substring(8, 10).toInt()
private fun time(iso: String) = if (iso.length >= 16) iso.substring(11, 16) else "00:00"
private fun seconds(iso: String) = if (iso.length >= 19) iso.substring(11, 19) else "00:00:00"

fun ymOf(wall: String) = wall.take(7)
fun monthShort(ym: String) = MON[ym.substring(5, 7).toInt() - 1]
fun monthLong(ym: String) = MONTH[ym.substring(5, 7).toInt() - 1]
/** "September" */
fun monthTitle(ym: String) = monthLong(ym).let { it[0] + it.substring(1).lowercase() }

fun shiftYm(ym: String, delta: Int): String {
  val total = y(ym) * 12 + (m(ym) - 1) + delta
  return "${total / 12}-${pad(total % 12 + 1)}"
}

fun daysInMonth(ym: String): Int = LocalDate.of(y(ym), m(ym), 1).lengthOfMonth()

/** Monday = 0 … Sunday = 6, for the first day of the month. */
fun firstWeekday(ym: String): Int = LocalDate.of(y(ym), m(ym), 1).dayOfWeek.value - 1

/** "22 SEP" */
fun dayMonth(iso: String) = "${pad(d(iso))} ${MON[m(iso) - 1]}"
/** "22 SEP 2026" */
fun dayMonthYear(iso: String) = "${dayMonth(iso)} ${y(iso)}"
/** "11:18" */
fun clock(iso: String) = time(iso)
/** "11:18 AM" */
fun clock12(iso: String): String {
  val (h, mm) = time(iso).split(":").map { it.toInt() }
  return "${pad(h % 12).let { if (it == "00") "12" else it }}:${pad(mm)} ${if (h < 12) "AM" else "PM"}"
}
/** "22-09-2026 11:18:42" */
fun posted(iso: String) = "${pad(d(iso))}-${pad(m(iso))}-${y(iso)} ${seconds(iso)}"
/** "TUE 22 SEP" */
fun dayHeader(iso: String): String = "${WEEKDAY[LocalDate.of(y(iso), m(iso), d(iso)).dayOfWeek.value - 1].take(3)} ${dayMonth(iso)}"
/** "FRIDAY, 25 SEPTEMBER 2026" */
fun longDate(iso: String): String = "${WEEKDAY[LocalDate.of(y(iso), m(iso), d(iso)).dayOfWeek.value - 1]}, ${d(iso)} ${MONTH[m(iso) - 1]} ${y(iso)}"

/** Whole days between two wall-clock dates (b − a). */
fun daysBetween(a: String, b: String): Long = java.time.temporal.ChronoUnit.DAYS.between(LocalDate.of(y(a), m(a), d(a)), LocalDate.of(y(b), m(b), d(b)))

/** "2 MIN AGO" for a UTC instant — like the web's ago(). */
fun ago(instant: String?, now: Instant = Instant.now()): String? {
  val then = instant?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return null
  val s = Math.round((now.toEpochMilli() - then.toEpochMilli()) / 1000.0).coerceAtLeast(0)
  if (s < 60) return "JUST NOW"
  if (s < 3600) return "${Math.round(s / 60.0)} MIN AGO"
  if (s < 86400) return "${Math.round(s / 3600.0)} HR AGO"
  val days = Math.round(s / 86400.0)
  return "$days DAY${if (days == 1L) "" else "S"} AGO"
}

/** 626412345672 → "626xxxxx72", the way the design shows references (lib/wire/parse.ts). */
fun maskRef(ref: String): String = if (ref.length <= 5) ref else "${ref.take(3)}${"x".repeat(minOf(5, ref.length - 5))}${ref.takeLast(2)}"
