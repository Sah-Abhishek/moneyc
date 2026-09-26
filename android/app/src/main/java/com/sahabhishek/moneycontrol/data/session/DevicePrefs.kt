package com.sahabhishek.moneycontrol.data.session

import android.content.Context

/** The ways to pay the ledger's one-line form offers: every channel but ATM, whose cash needs the full form's question. */
val QUICK_CHANNELS = listOf("Cash", "UPI", "Card", "Cheque", "NEFT", "IMPS", "RTGS", "Bank")

/**
 * Small per-device conveniences, like the website's localStorage: nothing
 * here is part of the book, and losing it only resets a default.
 */
class DevicePrefs(context: Context) {
  private val prefs = context.getSharedPreferences("device", Context.MODE_PRIVATE)

  /** The quick line's last "paid by", Cash until another is picked. */
  var quickMode: String
    get() = prefs.getString("quick_mode", null)?.takeIf { it in QUICK_CHANNELS } ?: "Cash"
    set(value) = prefs.edit().putString("quick_mode", value).apply()
}
