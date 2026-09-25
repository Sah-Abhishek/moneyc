package com.sahabhishek.moneycontrol.util

import com.sahabhishek.moneycontrol.ui.wire.firstSentence
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Test

/** The ports of src/lib/money.ts and src/lib/dates.ts must read exactly like the web. */
class FormatTest {
  @Test fun `money is grouped the Indian way and rounded like the web`() {
    assertEquals("0", groupIndian(0))
    assertEquals("999", groupIndian(999))
    assertEquals("1,000", groupIndian(1000))
    assertEquals("1,00,000", groupIndian(100000))
    assertEquals("12,34,56,789", groupIndian(123456789))
    assertEquals("48,601", rupees(4860050)) // rounds half up, like Math.round
    assertEquals("48,210.00", rupeesExact(4821000))
    assertEquals("0.05", rupeesExact(5))
    assertEquals("−486.00", signedAmount(-48600))
    assertEquals("+2,500.00", signedAmount(250000))
    assertEquals("48,210" to ".00", splitRupees(4821000))
    assertEquals("12.5%", percent(125, 1000, 1))
    assertEquals("0%", percent(5, 0))
  }

  @Test fun `dates read like the web`() {
    val at = "2026-09-22T11:18:42"
    assertEquals("22 SEP", dayMonth(at))
    assertEquals("22 SEP 2026", dayMonthYear(at))
    assertEquals("11:18", clock(at))
    assertEquals("11:18 AM", clock12(at))
    assertEquals("12:05 PM", clock12("2026-09-22T12:05:00"))
    assertEquals("12:05 AM", clock12("2026-09-22T00:05:00"))
    assertEquals("22-09-2026 11:18:42", posted(at))
    assertEquals("TUE 22 SEP", dayHeader(at))
    assertEquals("FRIDAY, 25 SEPTEMBER 2026", longDate("2026-09-25T15:40:00"))
    assertEquals("September", monthTitle("2026-09"))
    assertEquals("2026-08", shiftYm("2026-09", -1))
    assertEquals("2027-01", shiftYm("2026-12", 1))
    assertEquals(1, firstWeekday("2026-09")) // 1 Sep 2026 is a Tuesday; Monday = 0
    assertEquals(30, daysInMonth("2026-09"))
  }

  @Test fun `ago matches the web's wording`() {
    val now = Instant.parse("2026-09-25T10:00:00Z")
    assertEquals("JUST NOW", ago("2026-09-25T09:59:31Z", now))
    assertEquals("2 MIN AGO", ago("2026-09-25T09:58:00Z", now))
    assertEquals("3 HR AGO", ago("2026-09-25T07:00:00Z", now))
    assertEquals("1 DAY AGO", ago("2026-09-24T10:00:00Z", now))
    assertEquals(null, ago(null, now))
  }

  @Test fun `references are masked and first sentences found`() {
    assertEquals("626xxxxx72", maskRef("626412345672"))
    assertEquals("12345", maskRef("12345"))
    assertEquals(
      "Rs.10.00 has been debited from account **4721 to VPA vinodsi@okaxis VINOD SI on 22-09-26.",
      firstSentence("Dear Customer, Rs.10.00 has been debited from account **4721 to VPA vinodsi@okaxis VINOD SI on 22-09-26. Your UPI transaction reference number is 626412345672."),
    )
  }
}
