package com.sahabhishek.moneycontrol.util

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File

/** Hands a CSV to the share sheet (save to Drive, email it, open in Sheets…). */
fun shareCsv(context: Context, filename: String, csv: String): Boolean {
  val dir = File(context.cacheDir, "exports").apply { mkdirs() }
  // The server sends a UTF-8 byte-order mark so spreadsheets read ₹ correctly; the HTTP
  // client drops it when decoding, so it goes back on here.
  val file = File(dir, filename).apply { writeText("\uFEFF" + csv.removePrefix("\uFEFF"), Charsets.UTF_8) }
  val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
  val send = Intent(Intent.ACTION_SEND).apply {
    type = "text/csv"
    putExtra(Intent.EXTRA_STREAM, uri)
    putExtra(Intent.EXTRA_SUBJECT, filename)
    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
  }
  return try {
    context.startActivity(Intent.createChooser(send, filename).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    true
  } catch (e: ActivityNotFoundException) {
    false
  }
}

/** Opens a page of the website (screens the app doesn't have yet). */
fun openWeb(context: Context, url: String): Boolean = try {
  context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  true
} catch (e: ActivityNotFoundException) {
  false
}
