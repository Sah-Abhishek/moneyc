package com.sahabhishek.moneycontrol.data.api

import kotlinx.serialization.Serializable

// Shapes of the API's `data`, as documented in docs/api-v1.md. Money is integer
// paise; wall-clock times are "YYYY-MM-DDTHH:MM:SS" in the user's timezone.
// Unknown fields are ignored, so the server can add fields without breaking
// installed apps.

@Serializable
data class User(
  val id: Long,
  val email: String,
  val name: String? = null,
  val timezone: String,
  val monthlyBudget: Long? = null,
  val autoFile: Boolean = true,
  val mailSenders: List<String> = emptyList(),
  val createdAt: String,
) {
  /** "Abhishek", else the part of the email before the @. */
  val firstName: String get() = name?.trim()?.split(" ")?.firstOrNull()?.takeIf { it.isNotBlank() } ?: email.substringBefore("@")
}

@Serializable
data class AuthResult(
  val token: String,
  val expiresAt: String,
  val created: Boolean,
  /** false when the person didn't allow mail access */
  val gmail: Boolean,
  val user: User,
)

/** How the server stands with the person's Gmail. */
@Serializable
enum class Connection {
  @kotlinx.serialization.SerialName("connected") Connected,
  @kotlinx.serialization.SerialName("reconnect") Reconnect,
  @kotlinx.serialization.SerialName("no_gmail_scope") NoGmailScope,
  @kotlinx.serialization.SerialName("not_configured") NotConfigured,
}

@Serializable
data class SyncState(
  val runningSince: String? = null,
  val lastStartedAt: String? = null,
  val lastSuccessAt: String? = null,
  val lastError: String? = null,
  val lastErrorAt: String? = null,
)

@Serializable
data class BookTotals(val entries: Int = 0, val tracked: Long = 0, val since: String? = null)

/** GET me — everything the app shell needs on launch. */
@Serializable
data class Me(
  val user: User,
  val connection: Connection,
  val sync: SyncState = SyncState(),
  val waiting: Int = 0,
  val book: BookTotals = BookTotals(),
  val hasEntries: Boolean = false,
  /** the user's wall clock right now */
  val today: String,
  val bankCount: Int = 0,
)

@Serializable
data class SyncResult(
  /** done | busy | too_soon */
  val state: String,
  val added: Int = 0,
  val autoFiled: Int = 0,
  val more: Boolean = false,
)

// ─── the book ───────────────────────────────────────────────────────────────

@Serializable
data class Tag(
  val id: Long,
  val name: String,
  /** spend | ink | pending | plum | teal | indigo | credit | faint */
  val color: String,
  /** spend | income */
  val kind: String = "spend",
  val budget: Long? = null,
)

/** A named set of spending tags to read the month through ("Health": Healthy, Junk, Leisure). */
@Serializable
data class TagGroup(val id: Long, val name: String, val tagIds: List<Long> = emptyList())

/** GET tag-groups */
@Serializable
data class TagGroupsData(val groups: List<TagGroup> = emptyList(), val tags: List<Tag> = emptyList())

@Serializable
data class Entry(
  val id: Long,
  val occurredAt: String,
  /** who was paid; null when only what it was for was written */
  val payee: String? = null,
  /** paise; negative = money out */
  val amount: Long,
  val channel: String,
  val ref: String? = null,
  val account: String? = null,
  /** what the money was for ("Biscuits"), apart from who was paid */
  val item: String? = null,
  val note: String? = null,
  val tag: Tag? = null,
  /** hand | wire */
  val source: String = "hand",
  /** filed by a rule without review */
  val auto: Boolean = false,
  val personId: Long? = null,
  val personName: String? = null,
  /** cash taken out to spend by hand: it only moved to the wallet, so it's neither spending nor in the balance */
  val toWallet: Boolean = false,
  /** send back when editing; the server refuses a stale one */
  val version: Int = 1,
  /** running balance of the whole book after this line */
  val balance: Long = 0,
) {
  val isIncoming get() = amount > 0
  /** What the line is called: who was paid, else what it was for. */
  val title get() = payee ?: item ?: "Untitled line"
}

@Serializable
data class EntriesPage(
  val ym: String,
  val filter: String = "all",
  val q: String? = null,
  val tagId: Long? = null,
  val groupId: Long? = null,
  val entries: List<Entry> = emptyList(),
  val total: Int = 0,
  val page: Int = 1,
  val pages: Int = 1,
)

@Serializable
data class TagTotal(val tag: Tag? = null, val total: Long = 0, val count: Int = 0)

@Serializable
data class MonthSummary(
  val ym: String,
  val days: Int,
  val daysElapsed: Int,
  val isCurrent: Boolean,
  val spent: Long = 0,
  val prevSpent: Long = 0,
  val received: Long = 0,
  val receivedCount: Int = 0,
  val entryCount: Int = 0,
  val wireCount: Int = 0,
  val budget: Long? = null,
  val daily: List<Long> = emptyList(),
  val byTag: List<TagTotal> = emptyList(),
)

@Serializable
data class TagUsage(val entries: Int = 0, val rules: Int = 0)

/** GET tags — `usage` is keyed by tag id (as a string, JSON-style). */
@Serializable
data class TagsData(val tags: List<Tag> = emptyList(), val usage: Map<String, TagUsage> = emptyMap())

@Serializable
data class BudgetsData(val summary: MonthSummary, val tags: List<Tag> = emptyList(), val monthly: Long? = null)

// ─── the wire ───────────────────────────────────────────────────────────────

@Serializable
data class ParsedMail(
  /** debit | credit | null */
  val direction: String? = null,
  val amountPaise: Long? = null,
  val payee: String? = null,
  val channel: String = "Other",
  val ref: String? = null,
  val account: String? = null,
  val postedAt: String? = null,
  val confidence: Double = 0.0,
) {
  val isCredit get() = direction == "credit"
}

@Serializable
data class Suggestion(val tag: Tag, val basis: String)

/** A slate account, as much of it as the wire and line screens need. */
@Serializable
data class Account(
  val id: Long,
  val name: String,
  /** paise; positive = they owe you */
  val balance: Long = 0,
  val matchNames: List<String> = emptyList(),
  val phone: String? = null,
  val note: String? = null,
  val archived: Boolean = false,
  val lineCount: Int = 0,
  val openSince: String? = null,
  val ageDays: Int? = null,
  val remindersSent: Int = 0,
  val lastRemindedAt: String? = null,
  val firstLineAt: String? = null,
  /** the day (YYYY-MM-DD) the open balance was promised back by */
  val promisedBy: String? = null,
)

@Serializable
data class WireSlip(
  val id: Long,
  val bank: String,
  val sender: String,
  val subject: String? = null,
  val body: String = "",
  val receivedAt: String,
  /** waiting | filed | ignored (archived) | duplicate | skipped | deleted */
  val status: String,
  val parsed: ParsedMail = ParsedMail(),
  val occurredAt: String,
  val suggestion: Suggestion? = null,
  val duplicateOf: Entry? = null,
  val person: Account? = null,
  val askFirst: Boolean = false,
  val confidence: Double = 0.0,
) {
  /** The parser couldn't read who or how much: the slip opens ready to edit. */
  val incomplete get() = parsed.payee == null || parsed.amountPaise == null
}

@Serializable
data class WireStats(val ym: String, val autoFiled: Int = 0, val accuracy: Double? = null, val banksSeen: Int = 0)

@Serializable
data class WireData(
  val waiting: List<WireSlip> = emptyList(),
  val decided: List<WireSlip> = emptyList(),
  val stats: WireStats,
  val connection: Connection,
  val sync: SyncState = SyncState(),
  val autoFile: Boolean = true,
)

// ─── rules, slate, reports, settings ────────────────────────────────────────

@Serializable
data class Rule(
  val id: Long,
  /** sender | payee_prefix | amount_over */
  val field: String,
  val value: String,
  /** file | tag | ask */
  val action: String,
  val tag: Tag? = null,
  val position: Int = 0,
)

@Serializable
data class RulesData(val rules: List<Rule> = emptyList(), val tags: List<Tag> = emptyList())

@Serializable
data class AgingBucket(val label: String, val total: Long = 0, val color: String = "credit")

@Serializable
data class SlateStats(
  val net: Long = 0,
  val owedToYou: Long = 0,
  val youOwe: Long = 0,
  val owedCount: Int = 0,
  val oweCount: Int = 0,
  val lentThisWeek: Long = 0,
  val newAccountsThisWeek: Int = 0,
  val cameBackThisWeek: Long = 0,
  val repaymentsThisWeek: Int = 0,
  val reminders: Int = 0,
  val remindedPeople: Int = 0,
  val overdue: Long = 0,
  val oldestDays: Int? = null,
  val aging: List<AgingBucket> = emptyList(),
)

/** GET slate — everyone (archived too), the net position, and wire mail that looks like slate money. */
@Serializable
data class SlateData(val accounts: List<Account> = emptyList(), val stats: SlateStats = SlateStats(), val fromWire: List<WireSlip> = emptyList())

@Serializable
data class SlateLine(
  val id: Long,
  val occurredAt: String,
  /** paise, from your side: positive = you gave them money */
  val amount: Long,
  val note: String,
  val entryId: Long? = null,
  val fromWire: Boolean = false,
  val ref: String? = null,
  val balance: Long = 0,
)

/** GET slate/:id — one person's account and every line on it (oldest first). */
@Serializable
data class AccountDetail(val account: Account, val lines: List<SlateLine> = emptyList())

@Serializable
data class Reminder(val text: String, val phone: String? = null)

@Serializable
data class MonthSpend(val ym: String, val spent: Long = 0)

@Serializable
data class Merchant(val payee: String, val total: Long = 0, val count: Int = 0, val tag: Tag? = null)

/** One tag group's month, split by its tags (largest first); a tag in two groups counts in both. */
@Serializable
data class GroupReport(
  val group: TagGroup,
  val ym: String,
  val spent: Long = 0,
  val prevSpent: Long = 0,
  val count: Int = 0,
  val byTag: List<TagTotal> = emptyList(),
)

@Serializable
data class ReportData(
  val ym: String,
  val range: String = "6m",
  val summary: MonthSummary,
  val months: List<MonthSpend> = emptyList(),
  val merchants: List<Merchant> = emptyList(),
  val groups: List<GroupReport> = emptyList(),
)

@Serializable
data class SettingsData(val user: User, val connection: Connection, val sync: SyncState = SyncState(), val bankCount: Int = 0)

@Serializable
data class SendersResult(val senders: List<String> = emptyList(), val widened: Boolean = false)
