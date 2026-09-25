import { isValidTimeZone } from "../../lib/dates.ts";
import type { TagColor } from "../../lib/types.ts";
import { insertId, one, run, tx, withTx, type Db } from "../db/index.ts";
import { nowUtc, UserError, type Ctx } from "./context.ts";

export interface User {
  id: number;
  email: string;
  name: string | null;
  timezone: string;
  monthlyBudget: number | null;
  autoFile: boolean;
  /** senders the wire reads; empty = every bank in the built-in list */
  mailSenders: string[];
  createdAt: string;
}

// A starting set of stamps so the first line can be tagged. They are ordinary
// tags: renamable, recolourable, deletable.
const STARTER_TAGS: { name: string; color: TagColor; kind?: "income" }[] = [
  { name: "Food & delivery", color: "spend" },
  { name: "Rent & bills", color: "ink" },
  { name: "Transport", color: "pending" },
  { name: "Shopping", color: "plum" },
  { name: "Groceries", color: "teal" },
  { name: "Subscriptions", color: "indigo" },
  { name: "Income", color: "credit", kind: "income" },
];

interface UserRow {
  id: number; email: string; name: string | null; timezone: string;
  monthly_budget: number | null; auto_file: boolean; mail_senders: string; created_at: string;
}

const toUser = (r: UserRow): User => ({
  id: r.id, email: r.email, name: r.name, timezone: r.timezone,
  monthlyBudget: r.monthly_budget, autoFile: r.auto_file, mailSenders: r.mail_senders.split("\n").filter(Boolean), createdAt: r.created_at,
});

export async function getUser(db: Db, id: number): Promise<User | undefined> {
  const r = await one<UserRow>(db, "SELECT * FROM users WHERE id = ?", [id]);
  return r && toUser(r);
}

/** Called after Google sign-in. Creates the account on first sign-in. */
export function upsertGoogleUser(db: Db, g: { sub: string; email: string; name: string | null }): Promise<{ user: User; created: boolean }> {
  return tx(db, async (db) => {
    const existing = await one<UserRow>(db, "SELECT * FROM users WHERE google_sub = ?", [g.sub]);
    if (existing) {
      await run(db, "UPDATE users SET email = ?, name = ? WHERE id = ?", [g.email, g.name, existing.id]);
      return { user: toUser({ ...existing, email: g.email, name: g.name }), created: false };
    }
    const now = nowUtc();
    const id = await insertId(db, "INSERT INTO users (google_sub, email, name, created_at) VALUES (?, ?, ?, ?)", [g.sub, g.email, g.name, now]);
    for (const t of STARTER_TAGS)
      await run(db, "INSERT INTO tags (user_id, name, color, kind, created_at) VALUES (?, ?, ?, ?, ?)", [id, t.name, t.color, t.kind ?? "spend", now]);
    await run(db, "INSERT INTO sync_state (user_id) VALUES (?)", [id]);
    return { user: (await getUser(db, id))!, created: true };
  });
}

export async function updateSettings(ctx: Ctx, s: { monthlyBudget: number | null; timezone: string; autoFile: boolean }) {
  if (!isValidTimeZone(s.timezone)) throw new UserError("Choose a valid timezone", { timezone: "Choose a valid timezone" });
  await run(ctx.db, "UPDATE users SET monthly_budget = ?, timezone = ?, auto_file = ? WHERE id = ?", [
    s.monthlyBudget, s.timezone, s.autoFile, ctx.userId,
  ]);
}

export async function setMonthlyBudget(ctx: Ctx, paise: number | null) {
  await run(ctx.db, "UPDATE users SET monthly_budget = ? WHERE id = ?", [paise, ctx.userId]);
}

export async function setAutoFile(ctx: Ctx, on: boolean) {
  await run(ctx.db, "UPDATE users SET auto_file = ? WHERE id = ?", [on, ctx.userId]);
}

/**
 * Sets which senders the wire reads (empty = every known bank). When the list
 * widens, the next read looks back over the first-sync window so recent mail
 * from the new senders arrives too. Mail already on the wire is never removed.
 */
export function setMailSenders(ctx: Ctx, senders: string[]): Promise<{ widened: boolean }> {
  return withTx(ctx, async (ctx) => {
    const row = await one<{ mail_senders: string }>(ctx.db, "SELECT mail_senders FROM users WHERE id = ? FOR UPDATE", [ctx.userId]);
    const before = row?.mail_senders.split("\n").filter(Boolean) ?? [];
    // Any sender not listed before is new to the search (from "every bank" too:
    // a listed sender may not be a bank we know). Back to every bank is wider as well.
    const widened = senders.some((s) => !before.includes(s)) || (before.length > 0 && !senders.length);
    await run(ctx.db, "UPDATE users SET mail_senders = ? WHERE id = ?", [senders.join("\n"), ctx.userId]);
    if (widened) await run(ctx.db, "UPDATE sync_state SET rescan_requested_at = ? WHERE user_id = ?", [nowUtc(), ctx.userId]);
    return { widened };
  });
}

/** Permanently removes the user and everything they own (FK cascades). */
export async function deleteUser(db: Db, userId: number) {
  await run(db, "DELETE FROM users WHERE id = ?", [userId]);
}
