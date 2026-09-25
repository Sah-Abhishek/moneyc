package com.sahabhishek.moneycontrol

import android.content.Context
import com.sahabhishek.moneycontrol.auth.GoogleAuth
import com.sahabhishek.moneycontrol.data.AccountRepository
import com.sahabhishek.moneycontrol.data.BookChanges
import com.sahabhishek.moneycontrol.data.BookRepository
import com.sahabhishek.moneycontrol.data.Messenger
import com.sahabhishek.moneycontrol.data.WireRepository
import com.sahabhishek.moneycontrol.data.api.ApiClient
import com.sahabhishek.moneycontrol.data.session.SessionStore

/** The app's few long-lived objects, made once in [MoneyControlApp]. */
class AppGraph(context: Context) {
  val session = SessionStore(context)
  val account: AccountRepository
  val book: BookRepository
  val wire: WireRepository
  val changes = BookChanges()
  val messages = Messenger()
  val google = GoogleAuth(BuildConfig.GOOGLE_WEB_CLIENT_ID)

  init {
    lateinit var repo: AccountRepository
    val api = ApiClient(
      baseUrl = BuildConfig.API_BASE_URL,
      token = { session.current() },
      onSignedOut = { repo.sessionEnded() },
    )
    repo = AccountRepository(api, session)
    account = repo
    book = BookRepository(api, changes)
    wire = WireRepository(api, changes)
  }
}
