import { wallClock } from "../../lib/dates.ts";
import { parseMail } from "../../lib/wire/parse.ts";
import { all, one, run, type Db } from "../db/index.ts";
import { log } from "../log.ts";
import { nowUtc, type Ctx } from "../services/context.ts";
import { loadWireRefs, tryAutoFile } from "../services/wire.ts";
import { addressOf, bankFor, buildQuery } from "./banks.ts";
import type { GmailClient } from "./client.ts";
import { header, messageText, type GmailMessage } from "./mime.ts";

// Reads new bank alerts from Gmail onto the wire.
//
//  - Idempotent: a Gmail message id is stored once per user (unique index), so
//    re-running, overlapping windows or retries never create duplicates.
//  - One run per user at a time: a lease in sync_state; a crashed run's lease
//    expires after LEASE_MS.
//  - Bounded: at most MAX_MESSAGES per run; the next run carries on.
//  - Private: mail that isn't a transaction alert is recorded as "skipped"
//    with its body discarded, so it is never fetched again and never stored.

export const FIRST_SYNC_DAYS = 90;
const OVERLAP_MS = 2 * 86_400_000; // re-scan two days back; banks sometimes send late
const LEASE_MS = 5 * 60_000;
const MIN_INTERVAL_MS = 30_000; // automatic syncs
const MIN_FORCED_INTERVAL_MS = 10_000; // "read mail now" clicks
const MAX_MESSAGES = 400;
const CONCURRENCY = 4;

export type SyncOutcome =
  | { status: "done"; fetched: number; added: number; autoFiled: number; skipped: number; more: boolean }
  | { status: "busy" }
  | { status: "too_soon" };

export interface SyncState {
  runningSince: string | null;
  lastStartedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

export async function readSyncState(db: Db, userId: number): Promise<SyncState> {
  const r = await one<{ running_since: string | null; last_started_at: string | null; last_success_at: string | null; last_error: string | null; last_error_at: string | null }>(
    db, "SELECT * FROM sync_state WHERE user_id = ?", [userId],
  );
  return {
    runningSince: r?.running_since ?? null, lastStartedAt: r?.last_started_at ?? null, lastSuccessAt: r?.last_success_at ?? null,
    lastError: r?.last_error ?? null, lastErrorAt: r?.last_error_at ?? null,
  };
}

async function acquire(db: Db, userId: number, force: boolean): Promise<"ok" | "busy" | "too_soon"> {
  await run(db, "INSERT INTO sync_state (user_id) VALUES (?) ON CONFLICT (user_id) DO NOTHING", [userId]);
  const now = Date.now();
  const s = await readSyncState(db, userId);
  const floor = force ? MIN_FORCED_INTERVAL_MS : MIN_INTERVAL_MS;
  if (s.lastStartedAt && now - Date.parse(s.lastStartedAt) < floor && !s.runningSince) return "too_soon";
  const { changes } = await run(
    db,
    "UPDATE sync_state SET running_since = ?, last_started_at = ? WHERE user_id = ? AND (running_since IS NULL OR running_since < ?)",
    [new Date(now).toISOString(), new Date(now).toISOString(), userId, new Date(now - LEASE_MS).toISOString()],
  );
  return changes ? "ok" : "busy";
}

export interface SyncDeps {
  ctx: Ctx;
  client: GmailClient;
  autoFile: boolean;
  force?: boolean;
}

export async function syncMailbox({ ctx, client, autoFile, force = false }: SyncDeps): Promise<SyncOutcome> {
  const { db, userId } = ctx;
  const lock = await acquire(db, userId, force);
  if (lock !== "ok") return { status: lock };

  const started = Date.now();
  try {
    const state = await readSyncState(db, userId);
    const since = state.lastSuccessAt ? Date.parse(state.lastSuccessAt) - OVERLAP_MS : started - FIRST_SYNC_DAYS * 86_400_000;
    const extraSenders = (await all<{ value: string }>(db, "SELECT value FROM rules WHERE user_id = ? AND field = 'sender'", [userId])).map((r) => r.value);
    const q = buildQuery(extraSenders, since / 1000);

    // 1. Collect ids we haven't stored yet.
    const fresh: string[] = [];
    let pageToken: string | undefined;
    let more = false;
    do {
      const page = await client.list(q, pageToken);
      const known = new Set(
        page.ids.length
          ? (await all<{ gmail_id: string }>(db, "SELECT gmail_id FROM wire_mails WHERE user_id = ? AND gmail_id = ANY(?::text[])", [userId, page.ids])).map((r) => r.gmail_id)
          : [],
      );
      fresh.push(...page.ids.filter((id) => !known.has(id)));
      pageToken = page.nextPageToken;
      if (fresh.length >= MAX_MESSAGES) {
        more = true;
        break;
      }
    } while (pageToken);

    // Oldest first, so a partial run leaves a clean "everything before X" boundary.
    const batch = fresh.slice(0, MAX_MESSAGES).reverse();

    // 2. Fetch and store, a few at a time.
    let added = 0;
    let skipped = 0;
    let autoFiled = 0;
    const refs = batch.length ? await loadWireRefs(ctx) : null;
    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      const msgs = await Promise.all(batch.slice(i, i + CONCURRENCY).map((id) => client.get(id)));
      for (const msg of msgs) {
        const stored = await storeMessage(ctx, msg);
        if (stored === "skipped") skipped++;
        else if (stored != null) {
          added++;
          if (await tryAutoFile(ctx, stored, autoFile, refs!)) autoFiled++;
        }
      }
    }

    // Only advance the window when we have read everything in it.
    await run(db, "UPDATE sync_state SET running_since = NULL, last_error = NULL, last_success_at = CASE WHEN ?::boolean THEN last_success_at ELSE ? END, mails_seen = mails_seen + ? WHERE user_id = ?", [
      more, new Date(started).toISOString(), batch.length, userId,
    ]);
    log.info("wire.sync_done", { userId, fetched: batch.length, added, autoFiled, skipped, more, ms: Date.now() - started });
    return { status: "done", fetched: batch.length, added, autoFiled, skipped, more };
  } catch (e) {
    await run(db, "UPDATE sync_state SET running_since = NULL, last_error = ?, last_error_at = ? WHERE user_id = ?", [
      (e as Error).message.slice(0, 300), nowUtc(), userId,
    ]);
    log.error("wire.sync_failed", { userId, error: e, ms: Date.now() - started });
    throw e;
  }
}

/** Stores one Gmail message. Returns the new wire_mails id, "skipped", or null if it was already stored. */
export async function storeMessage(ctx: Ctx, msg: GmailMessage): Promise<number | "skipped" | null> {
  const sender = addressOf(header(msg, "From") ?? "");
  const subject = header(msg, "Subject")?.slice(0, 300) ?? null;
  const received = wallClock(ctx.tz, new Date(Number(msg.internalDate) || Date.now()));
  const body = messageText(msg);
  const parsed = parseMail(subject, body);
  const isTransaction = parsed.amountPaise != null && parsed.direction != null;
  const { rows } = await run(
    ctx.db,
    `INSERT INTO wire_mails (user_id, gmail_id, sender, bank, subject, body, received_at, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, gmail_id) DO NOTHING RETURNING id`,
    [ctx.userId, msg.id, sender, bankFor(sender), subject, isTransaction ? body : "", received, isTransaction ? "waiting" : "skipped", nowUtc()],
  );
  if (!rows.length) return null;
  return isTransaction ? Number(rows[0].id) : "skipped";
}
