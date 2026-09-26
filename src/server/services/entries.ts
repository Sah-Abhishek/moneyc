import { wallClock } from "../../lib/dates.ts";
import type { Entry, LedgerFilter } from "../../lib/types.ts";
import { all, insertId, one, run, withTx } from "../db/index.ts";
import type { EntryInput } from "../validation.ts";
import { ConflictError, NotFoundError, nowUtc, UserError, type Ctx } from "./context.ts";
import { assertTag, tagMap } from "./tags.ts";

export const PAGE_SIZE = 20;

interface EntryRow {
  id: number; occurred_at: string; payee: string; amount: number; channel: string;
  ref: string | null; account: string | null; item: string | null; note: string | null; tag_id: number | null;
  source: "hand" | "wire"; auto: boolean; person_id: number | null; person_name: string | null;
  to_wallet: boolean; version: number; balance: number;
}

async function mapRows(ctx: Ctx, rows: EntryRow[]): Promise<Entry[]> {
  const tags = await tagMap(ctx);
  return rows.map((r) => ({
    id: r.id, occurredAt: r.occurred_at, payee: r.payee, amount: r.amount, channel: r.channel,
    ref: r.ref, account: r.account, item: r.item, note: r.note, source: r.source, auto: r.auto,
    personId: r.person_id, personName: r.person_name, toWallet: r.to_wallet, version: r.version, balance: r.balance,
    tag: r.tag_id == null ? null : tags.get(r.tag_id) ?? null,
  }));
}

// The running balance covers the whole book (every live line, in time order),
// so it is computed before any month/filter/search narrowing. Cash moved to
// the wallet doesn't lower it: the cash lines written by hand do.
const BOOK = `
  WITH book AS (
    SELECT e.*, p.name AS person_name,
      SUM(CASE WHEN e.to_wallet THEN 0 ELSE e.amount END) OVER (ORDER BY e.occurred_at, e.id ROWS UNBOUNDED PRECEDING) AS balance
    FROM entries e LEFT JOIN people p ON p.id = e.person_id
    WHERE e.user_id = :user AND e.deleted_at IS NULL
  )`;

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listEntries(
  ctx: Ctx,
  opts: { ym: string; filter: LedgerFilter; q?: string; tagId?: number | null; groupId?: number | null; page: number },
) {
  const where = ["substr(occurred_at, 1, 7) = :ym"];
  const params: Record<string, string | number> = { user: ctx.userId, ym: opts.ym };
  if (opts.filter === "wire") where.push("source = 'wire'");
  if (opts.filter === "hand") where.push("source = 'hand'");
  if (opts.filter === "untagged") where.push("tag_id IS NULL AND amount < 0 AND person_id IS NULL AND NOT to_wallet");
  if (opts.tagId != null) {
    where.push("tag_id = :tag");
    params.tag = opts.tagId;
  }
  if (opts.groupId != null) {
    where.push("tag_id IN (SELECT tag_id FROM tag_group_tags WHERE group_id = :group AND user_id = :user)");
    params.group = opts.groupId;
  }
  if (opts.q) {
    where.push("(payee ILIKE :q ESCAPE '\\' OR item ILIKE :q ESCAPE '\\' OR note ILIKE :q ESCAPE '\\' OR ref ILIKE :q ESCAPE '\\' OR account ILIKE :q ESCAPE '\\')");
    params.q = `%${likeEscape(opts.q)}%`;
  }
  const filtered = `${BOOK} SELECT * FROM book WHERE ${where.join(" AND ")}`;
  const { n } = (await one<{ n: number }>(ctx.db, `SELECT COUNT(*) AS n FROM (${filtered}) f`, params))!;
  const pages = Math.max(1, Math.ceil(n / PAGE_SIZE));
  const page = Math.min(Math.max(1, opts.page), pages);
  const rows = await all<EntryRow>(ctx.db, `${filtered} ORDER BY occurred_at DESC, id DESC LIMIT :limit OFFSET :offset`, {
    ...params, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
  });
  return { entries: await mapRows(ctx, rows), total: n, page, pages };
}

export async function getEntry(ctx: Ctx, id: number): Promise<Entry> {
  const row = await one<EntryRow>(ctx.db, `${BOOK} SELECT * FROM book WHERE id = :id`, { user: ctx.userId, id });
  if (!row) throw new NotFoundError("That line no longer exists. It may have been deleted in another tab.");
  return (await mapRows(ctx, [row]))[0];
}

/** Does this user have any lines at all? Distinguishes "new book" from "empty month". */
export async function hasAnyEntries(ctx: Ctx): Promise<boolean> {
  return !!await one(ctx.db, "SELECT 1 FROM entries WHERE user_id = ? AND deleted_at IS NULL LIMIT 1", [ctx.userId]);
}

/** The blank first line of the ledger: payee + amount (+ optional what for, tag and way paid, Cash by default), dated now. */
export function addQuickEntry(
  ctx: Ctx,
  input: { payee: string; item?: string | null; amount: { incoming: boolean; raw: number }; tagId: number | null; channel?: EntryInput["channel"]; clientKey: string },
): Promise<{ entry: Entry; duplicate: boolean }> {
  return addEntry(
    ctx,
    {
      payee: input.payee,
      amount: input.amount.raw,
      direction: input.amount.incoming ? "in" : "out",
      occurredAt: wallClock(ctx.tz),
      channel: input.channel ?? "Cash",
      tagId: input.tagId,
      item: input.item ?? null,
      note: null,
      ref: null,
      toWallet: false,
    },
    input.clientKey,
  );
}

/**
 * Adds a hand-written line. `clientKey` makes the submit idempotent: a double
 * click or a retried request returns the line already created instead of a copy.
 */
export function addEntry(ctx: Ctx, input: EntryInput, clientKey: string): Promise<{ entry: Entry; duplicate: boolean }> {
  return withTx(ctx, async (ctx) => {
    const existing = await one<{ id: number }>(ctx.db, "SELECT id FROM entries WHERE user_id = ? AND client_key = ?", [ctx.userId, clientKey]);
    if (existing) return { entry: await getEntry(ctx, existing.id), duplicate: true };
    await assertTag(ctx, input.tagId);
    const now = nowUtc();
    const id = await insertId(
      ctx.db,
      `INSERT INTO entries (user_id, occurred_at, payee, amount, channel, ref, item, note, tag_id, to_wallet, source, client_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'hand', ?, ?, ?)`,
      [ctx.userId, input.occurredAt, input.payee, input.direction === "in" ? input.amount : -input.amount,
        input.channel, input.ref, input.item, input.note, input.tagId, input.toWallet, clientKey, now, now],
    );
    return { entry: await getEntry(ctx, id), duplicate: false };
  });
}

/**
 * Edits a line. `expectedVersion` is the version the editor loaded; if the
 * line changed since (another tab, a sync), the edit is refused rather than
 * silently overwriting.
 */
export function updateEntry(ctx: Ctx, id: number, input: EntryInput, expectedVersion: number): Promise<Entry> {
  return withTx(ctx, async (ctx) => {
    const current = await getEntry(ctx, id);
    if (current.version !== expectedVersion)
      throw new ConflictError("This line was changed somewhere else while you were editing. Close the editor to see the latest version.");
    await assertTag(ctx, input.tagId);
    const amount = input.direction === "in" ? input.amount : -input.amount;
    if (current.personId != null && Math.sign(amount) !== Math.sign(current.amount))
      throw new UserError("This line is on the slate. Change its direction from the person's account instead.");
    if (current.personId != null && input.toWallet)
      throw new UserError("This line is on the slate, so it can't also be cash moved to your wallet.");
    // A hand-written line's reference is its cheque number; a line from the
    // wire keeps the bank's reference whatever the channel is changed to.
    const ref = current.source === "wire" ? current.ref : input.ref;
    await run(
      ctx.db,
      `UPDATE entries SET occurred_at = ?, payee = ?, amount = ?, channel = ?, ref = ?, item = ?, note = ?, tag_id = ?, to_wallet = ?, updated_at = ?,
         version = version + 1, corrected = auto WHERE id = ? AND user_id = ?`,
      [input.occurredAt, input.payee, amount, input.channel, ref, input.item, input.note, input.tagId, input.toWallet, nowUtc(), id, ctx.userId],
    );
    // A ledger line that moved money on the slate keeps the slate in step.
    await run(ctx.db, "UPDATE slate_lines SET amount = ?, occurred_at = ? WHERE entry_id = ? AND user_id = ?", [-amount, input.occurredAt, id, ctx.userId]);
    return getEntry(ctx, id);
  });
}

/** Soft delete, so it can be undone. A linked slate line goes with it. */
export function deleteEntry(ctx: Ctx, id: number): Promise<{ deletedAt: string }> {
  return withTx(ctx, async (ctx) => {
    await getEntry(ctx, id);
    const at = nowUtc();
    await run(ctx.db, "UPDATE entries SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ? AND deleted_at IS NULL", [at, at, id, ctx.userId]);
    await run(ctx.db, "UPDATE slate_lines SET deleted_at = ? WHERE entry_id = ? AND user_id = ? AND deleted_at IS NULL", [at, id, ctx.userId]);
    return { deletedAt: at };
  });
}

export function restoreEntry(ctx: Ctx, id: number): Promise<Entry> {
  return withTx(ctx, async (ctx) => {
    const row = await one<{ deleted_at: string | null }>(ctx.db, "SELECT deleted_at FROM entries WHERE id = ? AND user_id = ?", [id, ctx.userId]);
    if (!row) throw new NotFoundError("That line can no longer be restored.");
    if (row.deleted_at) {
      await run(ctx.db, "UPDATE entries SET deleted_at = NULL, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ?", [nowUtc(), id, ctx.userId]);
      await run(ctx.db, "UPDATE slate_lines SET deleted_at = NULL WHERE entry_id = ? AND user_id = ? AND deleted_at = ?", [id, ctx.userId, row.deleted_at]);
    }
    return getEntry(ctx, id);
  });
}

/**
 * Lines that look like the same payment: the same bank reference, or the same
 * amount within a day. A cheque clears days after it was written, so a
 * cheque mail also matches a hand-written cheque line for that amount from
 * up to 45 days before, unless the two carry different cheque numbers.
 */
export async function findLikelyDuplicate(
  ctx: Ctx,
  p: { amount: number; occurredAt: string; ref: string | null; cheque?: boolean },
): Promise<Entry | null> {
  const row = await one<{ id: number }>(
    ctx.db,
    `SELECT id FROM entries
     WHERE user_id = :user AND deleted_at IS NULL AND (
       (:ref::text IS NOT NULL AND ref = :ref::text) OR
       -- Same amount within a day, unless both carry a bank reference: two different
       -- references are two different payments (two ₹1 UPI transfers to the same person).
       (amount = :amount::bigint AND abs(substr(occurred_at, 1, 10)::date - substr(:at::text, 1, 10)::date) <= 1
         AND (ref IS NULL OR :ref::text IS NULL)) OR
       (:cheque::boolean AND channel = 'Cheque' AND source = 'hand' AND amount = :amount::bigint
         AND substr(:at::text, 1, 10)::date - substr(occurred_at, 1, 10)::date BETWEEN -1 AND 45
         AND (ref IS NULL OR :ref::text IS NULL OR ref = :ref::text))
     )
     ORDER BY COALESCE(ref = :ref::text, FALSE) DESC, abs(extract(epoch FROM occurred_at::timestamp - :at::text::timestamp)), id LIMIT 1`,
    { user: ctx.userId, ref: p.ref, amount: p.amount, at: p.occurredAt, cheque: p.cheque ?? false },
  );
  return row ? getEntry(ctx, row.id) : null;
}
