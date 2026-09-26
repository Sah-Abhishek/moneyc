package com.sahabhishek.moneycontrol.data

import com.sahabhishek.moneycontrol.data.api.ApiClient
import com.sahabhishek.moneycontrol.data.api.ApiResult
import com.sahabhishek.moneycontrol.data.api.BudgetsData
import com.sahabhishek.moneycontrol.data.api.Tag
import com.sahabhishek.moneycontrol.data.api.EntriesPage
import com.sahabhishek.moneycontrol.data.api.Entry
import com.sahabhishek.moneycontrol.data.api.MonthSummary
import com.sahabhishek.moneycontrol.data.api.ReportData
import com.sahabhishek.moneycontrol.data.api.RulesData
import com.sahabhishek.moneycontrol.data.api.SlateData
import com.sahabhishek.moneycontrol.data.api.TagGroup
import com.sahabhishek.moneycontrol.data.api.TagGroupsData
import com.sahabhishek.moneycontrol.data.api.TagsData
import com.sahabhishek.moneycontrol.data.api.body
import kotlinx.serialization.builtins.serializer

/** What the line form sends. Amount is the text as typed; the server parses it. */
data class LineDraft(
  val payee: String,
  val amount: String,
  /** out | in */
  val direction: String,
  /** "YYYY-MM-DDTHH:MM" on the user's clock */
  val occurredAt: String,
  val channel: String,
  val tagId: Long?,
  val note: String,
  /** what the money was for; empty = nothing written */
  val item: String = "",
  /** digits; kept as the line's ref when the channel is Cheque */
  val chequeNo: String? = null,
  /** ATM money out: wallet | spent */
  val cash: String? = null,
)

/** The ledger: lines, the month's summary and tags. Writes announce themselves on [BookChanges]. */
class BookRepository(private val api: ApiClient, private val changes: BookChanges) {
  suspend fun summary(ym: String?) = api.get("summary", MonthSummary.serializer(), mapOf("m" to ym))

  suspend fun entries(ym: String?, filter: String, q: String?, tagId: Long?, page: Int, groupId: Long? = null) = api.get(
    "entries",
    EntriesPage.serializer(),
    mapOf(
      "m" to ym, "filter" to filter, "q" to q?.takeIf { it.isNotBlank() }, "tag" to tagId?.toString(), "group" to groupId?.toString(),
      "page" to page.toString(),
    ),
  )

  suspend fun entry(id: Long) = api.get("entries/$id", Entry.serializer())

  suspend fun tags() = api.get("tags", TagsData.serializer())

  // ─── tags ─────────────────────────────────────────────────────────────────

  suspend fun createTag(name: String, color: String, kind: String, budget: String) =
    api.post("tags", body("name" to name, "color" to color, "kind" to kind, "budget" to budget), Tag.serializer()).also(::announce)

  suspend fun updateTag(id: Long, name: String, color: String, kind: String, budget: String) =
    api.put("tags/$id", body("name" to name, "color" to color, "kind" to kind, "budget" to budget), Tag.serializer()).also(::announce)

  suspend fun deleteTag(id: Long) = api.delete("tags/$id", Unit.serializer()).also(::announce)

  suspend fun mergeTag(from: Long, into: Long) = api.post("tags/$from/merge", body("into" to into)).also(::announce)

  // ─── tag groups ───────────────────────────────────────────────────────────

  suspend fun tagGroups() = api.get("tag-groups", TagGroupsData.serializer())

  /** Spending tags only, at least one. Errors come keyed "name" / "tagIds". */
  suspend fun createGroup(name: String, tagIds: List<Long>) =
    api.post("tag-groups", body("name" to name, "tagIds" to tagIds), TagGroup.serializer()).also(::announce)

  suspend fun updateGroup(id: Long, name: String, tagIds: List<Long>) =
    api.put("tag-groups/$id", body("name" to name, "tagIds" to tagIds), TagGroup.serializer()).also(::announce)

  /** The group only; its tags and lines stay. */
  suspend fun deleteGroup(id: Long) = api.delete("tag-groups/$id", Unit.serializer()).also(::announce)

  // ─── budgets ──────────────────────────────────────────────────────────────

  suspend fun budgets() = api.get("budgets", BudgetsData.serializer())

  /** Every tag sent is saved; blank clears it. Errors come keyed "monthly" / "tag-<id>". */
  suspend fun saveBudgets(monthly: String, perTag: Map<Long, String>) = api.put(
    "budgets",
    body("monthly" to monthly, "tags" to kotlinx.serialization.json.JsonObject(perTag.map { (k, v) -> k.toString() to kotlinx.serialization.json.JsonPrimitive(v) }.toMap())),
    Unit.serializer(),
  ).also(::announce)

  // ─── rules ────────────────────────────────────────────────────────────────

  suspend fun createRule(field: String, value: String, action: String, tagId: Long?) =
    api.post("rules", body("field" to field, "value" to value, "action" to action, "tagId" to tagId)).also(::announce)

  suspend fun updateRule(id: Long, field: String, value: String, action: String, tagId: Long?) =
    api.put("rules/$id", body("field" to field, "value" to value, "action" to action, "tagId" to tagId), Unit.serializer()).also(::announce)

  suspend fun deleteRule(id: Long) = api.delete("rules/$id", Unit.serializer()).also(::announce)

  suspend fun moveRule(id: Long, direction: String) = api.post("rules/$id/move", body("direction" to direction)).also(::announce)

  /** One month of the ledger as CSV (money-control-YYYY-MM.csv). */
  suspend fun exportCsv(ym: String) = api.download("export", mapOf("month" to ym))

  suspend fun rules() = api.get("rules", RulesData.serializer())

  /** The months, calendar and merchants for the Long View and Reports. */
  suspend fun report(ym: String?, range: String) = api.get("reports", ReportData.serializer(), mapOf("m" to ym, "range" to range))

  /** Everyone on the slate (for "Put on their slate"). */
  suspend fun people() = api.get("slate", SlateData.serializer())

  suspend fun putOnSlate(entryId: Long, personId: Long) =
    api.put("entries/$entryId/slate", body("personId" to personId), Entry.serializer()).also(::announce)

  suspend fun takeOffSlate(entryId: Long) = api.delete("entries/$entryId/slate", Unit.serializer()).also(::announce)

  suspend fun create(d: LineDraft, clientKey: String) =
    api.post("entries", d.json("clientKey" to clientKey), Entry.serializer()).also(::announce)

  /** The one-line form: "+2500" is money in. */
  suspend fun quick(payee: String, item: String, amount: String, tagId: Long?, channel: String, clientKey: String) =
    api.post("entries/quick", body("payee" to payee, "item" to item, "amount" to amount, "tagId" to tagId, "channel" to channel, "clientKey" to clientKey), Entry.serializer())
      .also(::announce)

  suspend fun update(id: Long, d: LineDraft, version: Int) =
    api.put("entries/$id", d.json("version" to version), Entry.serializer()).also(::announce)

  suspend fun delete(id: Long) = api.delete("entries/$id", Unit.serializer()).also(::announce)

  suspend fun restore(id: Long) = api.post("entries/$id/restore", null, Entry.serializer()).also(::announce)

  private fun LineDraft.json(extra: Pair<String, Any?>) = body(
    "payee" to payee, "amount" to amount, "direction" to direction, "occurredAt" to occurredAt,
    "channel" to channel, "tagId" to tagId, "item" to item, "note" to note, "chequeNo" to chequeNo, "cash" to cash, extra,
  )

  private fun announce(r: ApiResult<*>) {
    if (r is ApiResult.Ok) changes.changed()
  }
}
