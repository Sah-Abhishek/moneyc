import { daysBetween, wallClock } from "../../lib/dates.ts";
import { rupees } from "../../lib/money.ts";
import { all, insertId, one, run, withTx } from "../db/index.ts";
import { ConflictError, NotFoundError, nowUtc, UserError, type Ctx } from "./context.ts";

// The slate is a double-entry book of money between you and other people.
// A line's amount is from your side: positive = you gave them money (they owe
// you more), negative = they gave you money. A person's balance is the sum:
// positive → on the "owed to you" page, negative → on the "you owe" page.

export interface Person {
  id: number;
  name: string;
  matchNames: string[];
  phone: string | null;
  note: string | null;
  remindersSent: number;
  lastRemindedAt: string | null;
  archived: boolean;
}

export interface Account extends Person {
  balance: number;
  lineCount: number;
  /** when the current unsettled balance started (wall clock), null if settled */
  openSince: string | null;
  ageDays: number | null;
  firstLineAt: string | null;
}

export interface SlateLine {
  id: number;
  occurredAt: string;
  amount: number;
  note: string;
  entryId: number | null;
  fromWire: boolean;
  ref: string | null;
  balance: number;
}

interface PersonRow {
  id: number; name: string; match_names: string; phone: string | null; note: string | null;
  reminders_sent: number; last_reminded_at: string | null; archived_at: string | null;
}

const toPerson = (r: PersonRow): Person => ({
  id: r.id, name: r.name, matchNames: r.match_names.split("\n").map((s) => s.trim()).filter(Boolean),
  phone: r.phone, note: r.note, remindersSent: r.reminders_sent, lastRemindedAt: r.last_reminded_at,
  archived: r.archived_at != null,
});

interface LineRow { id: number; person_id: number; occurred_at: string; amount: number; note: string; entry_id: number | null; source: string | null; ref: string | null }

function linesFor(ctx: Ctx, personId?: number): Promise<LineRow[]> {
  return all<LineRow>(
    ctx.db,
    `SELECT l.id, l.person_id, l.occurred_at, l.amount, l.note, l.entry_id, e.source, e.ref
     FROM slate_lines l LEFT JOIN entries e ON e.id = l.entry_id
     WHERE l.user_id = :user AND l.deleted_at IS NULL ${personId != null ? "AND l.person_id = :person" : ""}
     ORDER BY l.occurred_at, l.id`,
    personId != null ? { user: ctx.userId, person: personId } : { user: ctx.userId },
  );
}

/** When did the current run of non-zero balance begin? */
function openSince(lines: LineRow[]): string | null {
  let bal = 0;
  let since: string | null = null;
  for (const l of lines) {
    const before = bal;
    bal += l.amount;
    if (bal === 0) since = null;
    else if (before === 0 || Math.sign(before) !== Math.sign(bal)) since = l.occurred_at;
  }
  return bal === 0 ? null : since;
}

export async function listAccounts(ctx: Ctx, opts: { includeArchived?: boolean; q?: string } = {}): Promise<Account[]> {
  const [people, allLines] = await Promise.all([
    all<PersonRow>(ctx.db, "SELECT * FROM people WHERE user_id = ? ORDER BY lower(name), id", [ctx.userId]).then((rows) => rows.map(toPerson)),
    linesFor(ctx),
  ]);
  const byPerson = new Map<number, LineRow[]>();
  for (const l of allLines) byPerson.set(l.person_id, [...(byPerson.get(l.person_id) ?? []), l]);
  const today = wallClock(ctx.tz);
  const q = opts.q?.trim().toLowerCase();
  return people
    .filter((p) => opts.includeArchived || !p.archived)
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.matchNames.some((m) => m.toLowerCase().includes(q)))
    .map((p) => {
      const lines = byPerson.get(p.id) ?? [];
      const since = openSince(lines);
      return {
        ...p,
        balance: lines.reduce((s, l) => s + l.amount, 0),
        lineCount: lines.length,
        openSince: since,
        ageDays: since ? daysBetween(since, today) : null,
        firstLineAt: lines[0]?.occurred_at ?? null,
      };
    });
}

export async function getAccount(ctx: Ctx, personId: number): Promise<{ account: Account; lines: SlateLine[] }> {
  const account = (await listAccounts(ctx, { includeArchived: true })).find((a) => a.id === personId);
  if (!account) throw new NotFoundError("That account no longer exists.");
  let bal = 0;
  const lines = (await linesFor(ctx, personId)).map((l) => {
    bal += l.amount;
    return { id: l.id, occurredAt: l.occurred_at, amount: l.amount, note: l.note, entryId: l.entry_id, fromWire: l.source === "wire", ref: l.ref, balance: bal };
  });
  return { account, lines };
}

async function assertPerson(ctx: Ctx, id: number): Promise<Person> {
  const r = await one<PersonRow>(ctx.db, "SELECT * FROM people WHERE id = ? AND user_id = ?", [id, ctx.userId]);
  if (!r) throw new NotFoundError("That account no longer exists. It may have been removed in another tab.");
  return toPerson(r);
}

type PersonInput = { name: string; matchNames: string | null; phone: string | null; note: string | null };

const cleanMatchNames = (s: string | null) =>
  [...new Set((s ?? "").split(/[\n,]/).map((x) => x.trim()).filter(Boolean))].join("\n");

export function createPerson(ctx: Ctx, input: PersonInput): Promise<number> {
  return withTx(ctx, async (ctx) => {
    if (await one(ctx.db, "SELECT 1 FROM people WHERE user_id = ? AND lower(name) = lower(?)", [ctx.userId, input.name]))
      throw new UserError(`You already have an account for “${input.name}”`, { name: "That name is taken" });
    return insertId(ctx.db, "INSERT INTO people (user_id, name, match_names, phone, note, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
      ctx.userId, input.name, cleanMatchNames(input.matchNames), input.phone, input.note, nowUtc(),
    ]);
  });
}

export async function updatePerson(ctx: Ctx, id: number, input: PersonInput) {
  await withTx(ctx, async (ctx) => {
    await assertPerson(ctx, id);
    if (await one(ctx.db, "SELECT 1 FROM people WHERE user_id = ? AND lower(name) = lower(?) AND id <> ?", [ctx.userId, input.name, id]))
      throw new UserError(`You already have an account for “${input.name}”`, { name: "That name is taken" });
    await run(ctx.db, "UPDATE people SET name = ?, match_names = ?, phone = ?, note = ? WHERE id = ? AND user_id = ?", [
      input.name, cleanMatchNames(input.matchNames), input.phone, input.note, id, ctx.userId,
    ]);
  });
}

/** "Lend to someone": opens an account, optionally with its first line — both or neither. */
export function openAccount(
  ctx: Ctx,
  input: PersonInput,
  first: { amount: number; direction: "gave" | "got"; occurredAt: string; note: string; clientKey: string } | null,
): Promise<number> {
  return withTx(ctx, async (ctx) => {
    const personId = await createPerson(ctx, input);
    if (first) await addSlateLine(ctx, { ...first, personId });
    return personId;
  });
}

/** Settled accounts can be archived out of the way; open ones cannot. */
export async function setArchived(ctx: Ctx, id: number, archived: boolean) {
  await withTx(ctx, async (ctx) => {
    const acct = (await listAccounts(ctx, { includeArchived: true })).find((a) => a.id === id);
    if (!acct) throw new NotFoundError("That account no longer exists.");
    if (archived && acct.balance !== 0) throw new UserError("Settle the balance before archiving this account.");
    await run(ctx.db, "UPDATE people SET archived_at = ? WHERE id = ? AND user_id = ?", [archived ? nowUtc() : null, id, ctx.userId]);
  });
}

/** Hand-written slate line (cash lent, a split dinner…). Idempotent on clientKey. */
export function addSlateLine(
  ctx: Ctx,
  input: { personId: number; amount: number; direction: "gave" | "got"; occurredAt: string; note: string; clientKey: string },
): Promise<{ id: number; duplicate: boolean }> {
  return withTx(ctx, async (ctx) => {
    const existing = await one<{ id: number }>(ctx.db, "SELECT id FROM slate_lines WHERE user_id = ? AND client_key = ?", [ctx.userId, input.clientKey]);
    if (existing) return { id: existing.id, duplicate: true };
    const person = await assertPerson(ctx, input.personId);
    if (person.archived) await run(ctx.db, "UPDATE people SET archived_at = NULL WHERE id = ?", [person.id]);
    const id = await insertId(ctx.db, "INSERT INTO slate_lines (user_id, person_id, occurred_at, amount, note, client_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
      ctx.userId, input.personId, input.occurredAt, input.direction === "gave" ? input.amount : -input.amount, input.note, input.clientKey, nowUtc(),
    ]);
    return { id, duplicate: false };
  });
}

/**
 * Removes a slate line. If it came from a ledger line (money that moved through
 * your bank), that ledger line stays — it just stops counting as a loan and
 * becomes an ordinary line again.
 */
export async function deleteSlateLine(ctx: Ctx, id: number) {
  await withTx(ctx, async (ctx) => {
    const l = await one<{ entry_id: number | null }>(ctx.db, "SELECT entry_id FROM slate_lines WHERE id = ? AND user_id = ? AND deleted_at IS NULL", [id, ctx.userId]);
    if (!l) throw new ConflictError("That line was already removed.");
    await run(ctx.db, "UPDATE slate_lines SET deleted_at = ? WHERE id = ? AND user_id = ?", [nowUtc(), id, ctx.userId]);
    if (l.entry_id != null) await run(ctx.db, "UPDATE entries SET person_id = NULL, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?", [nowUtc(), l.entry_id, ctx.userId]);
  });
}

/**
 * Puts an existing ledger line on someone's slate: money you paid them becomes
 * money they owe you; money they paid you reduces what they owe.
 */
export async function linkEntryToPerson(ctx: Ctx, entryId: number, personId: number, note: string) {
  await withTx(ctx, async (ctx) => {
    await assertPerson(ctx, personId);
    const e = await one<{ amount: number; occurred_at: string; person_id: number | null }>(
      ctx.db, "SELECT amount, occurred_at, person_id FROM entries WHERE id = ? AND user_id = ? AND deleted_at IS NULL", [entryId, ctx.userId],
    );
    if (!e) throw new NotFoundError("That line no longer exists.");
    if (e.person_id != null) throw new ConflictError("That line is already on the slate.");
    await run(ctx.db, "UPDATE entries SET person_id = ?, tag_id = NULL, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?", [personId, nowUtc(), entryId, ctx.userId]);
    await run(ctx.db, "INSERT INTO slate_lines (user_id, person_id, occurred_at, amount, note, entry_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
      ctx.userId, personId, e.occurred_at, -e.amount, note, entryId, nowUtc(),
    ]);
  });
}

export async function unlinkEntry(ctx: Ctx, entryId: number) {
  await withTx(ctx, async (ctx) => {
    const l = await one<{ id: number }>(ctx.db, "SELECT id FROM slate_lines WHERE entry_id = ? AND user_id = ? AND deleted_at IS NULL", [entryId, ctx.userId]);
    if (l) await deleteSlateLine(ctx, l.id);
  });
}

const norm = (s: string) => s.normalize("NFKD").replace(/[^\p{L}\p{N}@.]+/gu, " ").trim().toLowerCase();

/**
 * Finds the account a wire payee most likely refers to (name, or one of its
 * other names/VPAs). Pass `accounts` when matching many payees at once.
 */
export async function matchPerson(ctx: Ctx, payee: string | null, accounts?: Account[]): Promise<Account | null> {
  if (!payee) return null;
  const p = norm(payee);
  if (p.length < 3) return null;
  const candidates = (accounts ?? await listAccounts(ctx)).filter((a) => !a.archived).filter((a) => [a.name, ...a.matchNames].some((n) => {
    const x = norm(n);
    return x.length >= 3 && (x === p || p.startsWith(`${x} `) || x.startsWith(`${p} `) || (x.includes("@") && p.includes(x)));
  }));
  // Prefer an account with money outstanding; never guess between two open ones.
  const open = candidates.filter((a) => a.balance !== 0);
  if (open.length === 1) return open[0];
  return candidates.length === 1 ? candidates[0] : null;
}

/** Records that a reminder was sent and returns the message to share. */
export async function recordReminder(ctx: Ctx, personId: number, amountText: string): Promise<{ text: string; phone: string | null }> {
  const p = await assertPerson(ctx, personId);
  await run(ctx.db, "UPDATE people SET reminders_sent = reminders_sent + 1, last_reminded_at = ? WHERE id = ? AND user_id = ?", [nowUtc(), personId, ctx.userId]);
  return { text: `Hi ${p.name.split(" ")[0]}, a gentle reminder about the ₹${amountText} from our slate. No rush — whenever you can.`, phone: p.phone };
}

/** A reminder for what someone owes you, recorded as sent. Refused when they owe nothing. */
export async function remind(ctx: Ctx, personId: number): Promise<{ text: string; phone: string | null }> {
  const { account } = await getAccount(ctx, personId);
  if (account.balance <= 0) throw new UserError(`${account.name} doesn't owe you anything right now.`);
  return recordReminder(ctx, personId, rupees(account.balance));
}

export async function deletePerson(ctx: Ctx, id: number) {
  await withTx(ctx, async (ctx) => {
    await assertPerson(ctx, id);
    if (await one(ctx.db, "SELECT 1 FROM slate_lines WHERE person_id = ? AND user_id = ? AND deleted_at IS NULL", [id, ctx.userId]))
      throw new UserError("This account has lines on it. Settle it and archive it instead, so its history is kept.");
    await run(ctx.db, "UPDATE entries SET person_id = NULL, version = version + 1 WHERE person_id = ? AND user_id = ?", [id, ctx.userId]);
    await run(ctx.db, "DELETE FROM people WHERE id = ? AND user_id = ?", [id, ctx.userId]);
  });
}

export interface SlateStats {
  net: number;
  owedToYou: number;
  youOwe: number;
  owedCount: number;
  oweCount: number;
  lentThisWeek: number;
  newAccountsThisWeek: number;
  cameBackThisWeek: number;
  repaymentsThisWeek: number;
  reminders: number;
  remindedPeople: number;
  overdue: number;
  oldestDays: number | null;
  aging: { label: string; total: number; color: "credit" | "pending" | "spend" }[];
}

export async function slateStats(ctx: Ctx, accounts: Account[]): Promise<SlateStats> {
  const today = wallClock(ctx.tz);
  const weekAgo = wallClock(ctx.tz, new Date(Date.now() - 7 * 86_400_000));
  const week = (await one<{ lent: number; back: number; repayments: number }>(
    ctx.db,
    `SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount END), 0) AS lent,
            COALESCE(SUM(CASE WHEN amount < 0 THEN -amount END), 0) AS back,
            COUNT(CASE WHEN amount < 0 THEN 1 END) AS repayments
     FROM slate_lines WHERE user_id = ? AND deleted_at IS NULL AND occurred_at >= ? AND occurred_at <= ?`,
    [ctx.userId, weekAgo, today],
  ))!;
  const owed = accounts.filter((a) => a.balance > 0);
  const owe = accounts.filter((a) => a.balance < 0);
  const bucket = (lo: number, hi: number) => owed.filter((a) => (a.ageDays ?? 0) >= lo && (a.ageDays ?? 0) < hi).reduce((s, a) => s + a.balance, 0);
  return {
    owedToYou: owed.reduce((s, a) => s + a.balance, 0),
    youOwe: -owe.reduce((s, a) => s + a.balance, 0),
    net: accounts.reduce((s, a) => s + a.balance, 0),
    owedCount: owed.length,
    oweCount: owe.length,
    lentThisWeek: week.lent,
    newAccountsThisWeek: accounts.filter((a) => a.openSince && a.openSince >= weekAgo).length,
    cameBackThisWeek: week.back,
    repaymentsThisWeek: week.repayments,
    reminders: owed.reduce((s, a) => s + a.remindersSent, 0),
    remindedPeople: owed.filter((a) => a.remindersSent > 0).length,
    overdue: owed.filter((a) => (a.ageDays ?? 0) > 90).reduce((s, a) => s + a.balance, 0),
    oldestDays: owed.reduce<number | null>((m, a) => (a.ageDays != null && (m == null || a.ageDays > m) ? a.ageDays : m), null),
    aging: [
      { label: "0 — 30 days", total: bucket(0, 31), color: "credit" },
      { label: "30 — 60 days", total: bucket(31, 61), color: "pending" },
      { label: "60 — 90 days", total: bucket(61, 91), color: "pending" },
      { label: "90 days +", total: bucket(91, Infinity), color: "spend" },
    ],
  };
}
