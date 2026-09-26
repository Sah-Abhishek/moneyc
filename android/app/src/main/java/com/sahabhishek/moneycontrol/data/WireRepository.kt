package com.sahabhishek.moneycontrol.data

import com.sahabhishek.moneycontrol.data.api.ApiClient
import com.sahabhishek.moneycontrol.data.api.ApiResult
import com.sahabhishek.moneycontrol.data.api.Entry
import com.sahabhishek.moneycontrol.data.api.SyncResult
import com.sahabhishek.moneycontrol.data.api.WireData
import com.sahabhishek.moneycontrol.data.api.body
import kotlinx.serialization.builtins.serializer

/** How a slip is filed. Sending payee/amount means the person edited what was read. */
data class Filing(
  val tagId: Long?,
  val personId: Long?,
  val payee: String? = null,
  val amount: String? = null,
  /** what the money was for; the payee stays who was paid */
  val item: String = "",
  /** an ATM withdrawal: wallet | spent (the server requires one) */
  val cash: String? = null,
)

/** The wire: bank mail waiting to be confirmed, and what was decided. */
class WireRepository(private val api: ApiClient, private val changes: BookChanges) {
  suspend fun load() = api.get("wire", WireData.serializer())

  suspend fun readMail(force: Boolean) = api.post("wire/sync", body("force" to force), SyncResult.serializer()).also(::announce)

  suspend fun file(id: Long, f: Filing) =
    api.post("wire/$id/file", body("tagId" to f.tagId, "personId" to f.personId, "payee" to f.payee, "amount" to f.amount, "item" to f.item, "cash" to f.cash), Entry.serializer()).also(::announce)

  suspend fun unfile(id: Long) = api.post("wire/$id/unfile").also(::announce)
  suspend fun archive(id: Long) = api.post("wire/$id/archive").also(::announce)
  suspend fun restore(id: Long) = api.post("wire/$id/restore").also(::announce)
  suspend fun sameAs(id: Long, entryId: Long) = api.post("wire/$id/duplicate", body("entryId" to entryId)).also(::announce)
  suspend fun notSame(id: Long) = api.post("wire/$id/unduplicate").also(::announce)
  suspend fun delete(id: Long) = api.delete("wire/$id", Unit.serializer()).also(::announce)

  suspend fun setAutoFile(on: Boolean) = api.put("settings/auto-file", body("on" to on), Unit.serializer())

  private fun announce(r: ApiResult<*>) {
    if (r is ApiResult.Ok) changes.changed()
  }
}
