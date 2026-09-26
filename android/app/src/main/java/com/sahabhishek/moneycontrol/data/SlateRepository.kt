package com.sahabhishek.moneycontrol.data

import com.sahabhishek.moneycontrol.data.api.AccountDetail
import com.sahabhishek.moneycontrol.data.api.ApiClient
import com.sahabhishek.moneycontrol.data.api.ApiResult
import com.sahabhishek.moneycontrol.data.api.Reminder
import com.sahabhishek.moneycontrol.data.api.SlateData
import com.sahabhishek.moneycontrol.data.api.body
import kotlinx.serialization.builtins.serializer

/** The slate: money lent and borrowed, one account per person. */
class SlateRepository(private val api: ApiClient, private val changes: BookChanges) {
  suspend fun load() = api.get("slate", SlateData.serializer())

  suspend fun account(id: Long) = api.get("slate/$id", AccountDetail.serializer())

  /** Opens an account; with an amount it opens with its first line (both or neither). */
  suspend fun open(name: String, direction: String, amount: String, lineNote: String, occurredAt: String, phone: String, clientKey: String) = api.post(
    "slate",
    body("name" to name, "direction" to direction, "amount" to amount, "lineNote" to lineNote, "occurredAt" to occurredAt, "phone" to phone, "clientKey" to clientKey),
    AccountDetail.serializer(),
  ).also(::announce)

  suspend fun update(id: Long, name: String, matchNames: String, phone: String, note: String) =
    api.put("slate/$id", body("name" to name, "matchNames" to matchNames, "phone" to phone, "note" to note), AccountDetail.serializer()).also(::announce)

  suspend fun delete(id: Long) = api.delete("slate/$id", Unit.serializer()).also(::announce)

  suspend fun archive(id: Long, archived: Boolean) = api.post("slate/$id/archive", body("archived" to archived)).also(::announce)

  suspend fun addLine(personId: Long, amount: String, direction: String, occurredAt: String, note: String, clientKey: String) = api.post(
    "slate/$personId/lines",
    body("amount" to amount, "direction" to direction, "occurredAt" to occurredAt, "note" to note, "clientKey" to clientKey),
    AccountDetail.serializer(),
  ).also(::announce)

  /** Settle up: an empty amount pays the whole balance; less leaves the rest, maybe promised by a day. */
  suspend fun settle(personId: Long, amount: String, promisedBy: String?, occurredAt: String, clientKey: String) = api.post(
    "slate/$personId/settle",
    body("amount" to amount, "promisedBy" to promisedBy, "occurredAt" to occurredAt, "clientKey" to clientKey),
    AccountDetail.serializer(),
  ).also(::announce)

  suspend fun clearPromise(personId: Long) =
    api.put("slate/$personId/promise", body("promisedBy" to null), AccountDetail.serializer()).also(::announce)

  suspend fun deleteLine(id: Long) = api.delete("slate/lines/$id", Unit.serializer()).also(::announce)

  suspend fun remind(id: Long) = api.post("slate/$id/remind", null, Reminder.serializer()).also(::announce)

  private fun announce(r: ApiResult<*>) {
    if (r is ApiResult.Ok) changes.changed()
  }
}
