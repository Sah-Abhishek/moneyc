import { daysInMonth, shiftYm, wallClock, ymOf } from "../../lib/dates.ts";
import type { Tag, TagGroup } from "../../lib/types.ts";
import { all, one } from "../db/index.ts";
import type { Ctx } from "./context.ts";
import { listGroups } from "./tagGroups.ts";
import { tagMap } from "./tags.ts";

// Spending figures count only money that actually left for goods and services:
// live lines, negative amounts, not slate transfers (lending money to a friend
// is not spending it), not cash moved to the wallet (the cash lines written by
// hand are the spending). Income is the mirror image.
const SPEND = "user_id = :user AND deleted_at IS NULL AND person_id IS NULL AND amount < 0 AND NOT to_wallet";
const INCOME = "user_id = :user AND deleted_at IS NULL AND person_id IS NULL AND amount > 0";

export interface MonthSummary {
  ym: string;
  days: number;
  /** days of the month that have happened (all of them for past months, 0 for future) */
  daysElapsed: number;
  isCurrent: boolean;
  spent: number;
  prevSpent: number;
  received: number;
  receivedCount: number;
  entryCount: number;
  wireCount: number;
  budget: number | null;
  daily: number[];
  byTag: { tag: Tag | null; total: number; count: number }[];
}

export async function monthSummary(ctx: Ctx, ym: string, budget: number | null): Promise<MonthSummary> {
  const today = wallClock(ctx.tz);
  const current = ymOf(today);
  const days = daysInMonth(ym);
  const daysElapsed = ym === current ? Number(today.slice(8, 10)) : ym < current ? days : 0;

  const p = { user: ctx.userId, ym };
  const spentIn = async (m: string) =>
    (await one<{ s: number }>(ctx.db, `SELECT COALESCE(SUM(-amount), 0) AS s FROM entries WHERE ${SPEND} AND substr(occurred_at, 1, 7) = :ym`, { user: ctx.userId, ym: m }))!.s;

  const [spent, prevSpent, income, counts, dailyRows, tags, byTagRows] = await Promise.all([
    spentIn(ym),
    spentIn(shiftYm(ym, -1)),
    one<{ s: number; n: number }>(
      ctx.db,
      `SELECT COALESCE(SUM(amount), 0) AS s, COUNT(*) AS n FROM entries WHERE ${INCOME} AND substr(occurred_at, 1, 7) = :ym`,
      p,
    ).then((r) => r!),
    one<{ n: number; wire: number }>(
      ctx.db,
      `SELECT COUNT(*) AS n, COUNT(*) FILTER (WHERE source = 'wire') AS wire FROM entries
       WHERE user_id = :user AND deleted_at IS NULL AND substr(occurred_at, 1, 7) = :ym`,
      p,
    ).then((r) => r!),
    all<{ day: number; s: number }>(
      ctx.db,
      `SELECT CAST(substr(occurred_at, 9, 2) AS INTEGER) AS day, SUM(-amount) AS s FROM entries
       WHERE ${SPEND} AND substr(occurred_at, 1, 7) = :ym GROUP BY day`,
      p,
    ),
    tagMap(ctx),
    all<{ tag_id: number | null; total: number; count: number }>(
      ctx.db,
      `SELECT tag_id, SUM(-amount) AS total, COUNT(*) AS count FROM entries
       WHERE ${SPEND} AND substr(occurred_at, 1, 7) = :ym GROUP BY tag_id ORDER BY total DESC, tag_id`,
      p,
    ),
  ]);

  const daily = Array.from({ length: days }, () => 0);
  for (const r of dailyRows) if (r.day >= 1 && r.day <= days) daily[r.day - 1] = r.s;
  const byTag = byTagRows.map((r) => ({ tag: r.tag_id == null ? null : tags.get(r.tag_id) ?? null, total: r.total, count: r.count }));

  return {
    ym, days, daysElapsed, isCurrent: ym === current,
    spent, prevSpent,
    received: income.s, receivedCount: income.n,
    entryCount: counts.n, wireCount: counts.wire,
    budget, daily, byTag,
  };
}

export type Range = "6m" | "1y" | "all";

/** Monthly spend for the Long View, oldest first, ending at `ym`. */
export async function monthlySpend(ctx: Ctx, ym: string, range: Range): Promise<{ ym: string; spent: number }[]> {
  const rows = await all<{ ym: string; s: number }>(
    ctx.db,
    `SELECT substr(occurred_at, 1, 7) AS ym, SUM(-amount) AS s FROM entries
     WHERE ${SPEND} AND substr(occurred_at, 1, 7) <= :ym GROUP BY ym`,
    { user: ctx.userId, ym },
  );
  const byYm = new Map(rows.map((r) => [r.ym, r.s]));
  let count = range === "6m" ? 6 : 12;
  if (range === "all") {
    const first = rows.map((r) => r.ym).sort()[0] ?? ym;
    count = 1;
    for (let m = first; m < ym; m = shiftYm(m, 1)) count++;
  }
  return Array.from({ length: count }, (_, i) => {
    const m = shiftYm(ym, i - count + 1);
    return { ym: m, spent: byYm.get(m) ?? 0 };
  });
}

export interface Merchant {
  payee: string;
  total: number;
  count: number;
  tag: Tag | null;
}

/** Where the money leaks: payees ranked by spend within the month. */
export async function merchants(ctx: Ctx, ym: string): Promise<Merchant[]> {
  const [tags, rows] = await Promise.all([
    tagMap(ctx),
    all<{ payee: string; total: number; count: number; tag_id: number | null }>(
      ctx.db,
      // Payees group ignoring case; the most common spelling is shown, and the
      // tag is whichever this payee has been stamped with most often.
      `SELECT m.payee, m.total, m.count,
         (SELECT tag_id FROM entries t WHERE t.user_id = :user AND lower(t.payee) = m.key
            AND t.tag_id IS NOT NULL AND t.deleted_at IS NULL
          GROUP BY tag_id ORDER BY COUNT(*) DESC, tag_id LIMIT 1) AS tag_id
       FROM (
         SELECT lower(payee) AS key, mode() WITHIN GROUP (ORDER BY payee) AS payee, SUM(-amount) AS total, COUNT(*) AS count
         FROM entries WHERE ${SPEND} AND substr(occurred_at, 1, 7) = :ym AND payee IS NOT NULL
         GROUP BY lower(payee)
       ) m
       ORDER BY m.total DESC, m.key`,
      { user: ctx.userId, ym },
    ),
  ]);
  return rows.map((m) => ({ payee: m.payee, total: m.total, count: m.count, tag: m.tag_id == null ? null : tags.get(m.tag_id) ?? null }));
}

export async function bookTotals(ctx: Ctx): Promise<{ entries: number; tracked: number; since: string | null }> {
  return (await one<{ entries: number; tracked: number; since: string | null }>(
    ctx.db,
    `SELECT COUNT(*) AS entries, COALESCE(SUM(CASE WHEN amount < 0 AND NOT to_wallet THEN -amount END), 0) AS tracked,
       MIN(occurred_at) AS since
     FROM entries WHERE user_id = :user AND deleted_at IS NULL`,
    { user: ctx.userId },
  ))!;
}

export interface GroupReport {
  group: TagGroup;
  ym: string;
  spent: number;
  prevSpent: number;
  count: number;
  /** every tag in the group, the ones with spending first */
  byTag: { tag: Tag; total: number; count: number }[];
}

/**
 * Spending in a month read through tag groups: each group's total, split by
 * its tags, beside the month before. A tag in two groups counts in both, so
 * the groups need not add up to the month's spending.
 */
export async function groupReports(ctx: Ctx, ym: string): Promise<GroupReport[]> {
  const [groups, tags, rows] = await Promise.all([
    listGroups(ctx),
    tagMap(ctx),
    all<{ ym: string; tag_id: number; total: number; count: number }>(
      ctx.db,
      `SELECT substr(occurred_at, 1, 7) AS ym, tag_id, SUM(-amount) AS total, COUNT(*) AS count FROM entries
       WHERE ${SPEND} AND tag_id IN (SELECT tag_id FROM tag_group_tags WHERE user_id = :user)
         AND substr(occurred_at, 1, 7) IN (:ym, :prev)
       GROUP BY 1, 2`,
      { user: ctx.userId, ym, prev: shiftYm(ym, -1) },
    ),
  ]);
  const cell = (m: string, tagId: number) => rows.find((r) => r.ym === m && r.tag_id === tagId);
  return groups.map((group) => {
    const byTag = group.tagIds
      .map((id) => tags.get(id))
      .filter((t): t is Tag => !!t)
      .map((tag) => ({ tag, total: cell(ym, tag.id)?.total ?? 0, count: cell(ym, tag.id)?.count ?? 0 }))
      .sort((a, b) => b.total - a.total || a.tag.name.localeCompare(b.tag.name));
    return {
      group, ym, byTag,
      spent: byTag.reduce((s, t) => s + t.total, 0),
      count: byTag.reduce((s, t) => s + t.count, 0),
      prevSpent: group.tagIds.reduce((s, id) => s + (cell(shiftYm(ym, -1), id)?.total ?? 0), 0),
    };
  });
}
