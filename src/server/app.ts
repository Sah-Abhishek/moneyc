import "server-only";
import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { attachDatabasePool } from "@vercel/functions";
import pg from "pg";
import type { ActionResult } from "../lib/types.ts";
import { accessToken, grantStatus, GoogleAuthError } from "./auth/google.ts";
import { readSession } from "./auth/sessions.ts";
import { afterInit, migrate, pgTypes, poolDb, run, type Db } from "./db/index.ts";
import { databaseUrl, loadConfig } from "./env.ts";
import { gmailClient, GmailError } from "./gmail/client.ts";
import { syncMailbox, type SyncOutcome } from "./gmail/sync.ts";
import { log } from "./log.ts";
import { UserError, type Ctx } from "./services/context.ts";
import { getUser, type User } from "./services/users.ts";

// The bridge between Next.js (cookies, redirects, server actions) and the
// framework-free service layer.

export const SESSION_COOKIE = "mc_session";

let shared: Db | undefined;

/**
 * Process-wide pool. Serverless instances each hold a few connections, so
 * DATABASE_URL should be a pooled endpoint (Neon's "-pooler" host). Pending
 * migrations run on first use.
 */
export function db(): Db {
  if (shared) return shared;
  const pool = new pg.Pool({
    connectionString: databaseUrl(),
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    types: pgTypes,
  });
  // An idle connection dropped by the server must not crash the process.
  pool.on("error", (error) => log.error("db.pool_error", { error }));
  // On Vercel, closes idle connections before a function instance is suspended.
  attachDatabasePool(pool);
  shared = afterInit(poolDb(pool), migrate);
  return shared;
}

export const currentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await readSession(db(), token);
  return session ? (await getUser(db(), session.userId)) ?? null : null;
});

/** For pages: the signed-in user, or a redirect to the front door. */
export async function requireUser(): Promise<{ user: User; ctx: Ctx }> {
  const user = await currentUser();
  if (!user) redirect("/welcome");
  return { user, ctx: { db: db(), userId: user.id, tz: user.timezone } };
}

export class SignedOutError extends UserError {
  name = "SignedOutError";
}

/** For server actions: never redirect mid-action, report instead. */
async function actionCtx(): Promise<{ user: User; ctx: Ctx }> {
  const user = await currentUser();
  if (!user) throw new SignedOutError("Your session has ended. Sign in again — nothing you typed has been saved yet.");
  return { user, ctx: { db: db(), userId: user.id, tz: user.timezone } };
}

/**
 * Wraps a server action body: authenticates, turns UserErrors into readable
 * results, and turns anything unexpected into a logged error with a reference
 * the user can quote — never a stack trace.
 */
export async function act<T = undefined>(
  name: string,
  fn: (a: { user: User; ctx: Ctx }) => Promise<ActionResult<T> | void> | ActionResult<T> | void,
): Promise<ActionResult<T>> {
  try {
    const a = await actionCtx();
    return (await fn(a)) ?? { ok: true };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    // Next uses thrown errors for redirect()/notFound(); let those through.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    const ref = randomUUID().slice(0, 8);
    log.error("action.failed", { action: name, ref, error: e });
    return { ok: false, error: `That didn't go through because of a problem on our side (ref ${ref}). Your input is still here — try again in a moment.` };
  }
}

export async function userAgent(): Promise<string | null> {
  return (await headers()).get("user-agent");
}

export type WireConnection = "connected" | "reconnect" | "no_gmail_scope" | "not_configured";

export async function wireConnection(userId: number): Promise<WireConnection> {
  if (!loadConfig().ok) return "not_configured";
  const s = await grantStatus(db(), userId);
  return s === "active" ? "connected" : s === "no_gmail_scope" ? "no_gmail_scope" : "reconnect";
}

/**
 * Runs a Gmail sync for the user. Retries once with a fresh access token if
 * Gmail rejects the cached one. Translates failures into UserErrors.
 */
export async function runSync(user: User, force: boolean): Promise<SyncOutcome> {
  const cfg = loadConfig();
  if (!cfg.ok) throw new UserError("Mail sync isn't set up on this server yet.");
  const conn = await wireConnection(user.id);
  if (conn !== "connected") throw new UserError("Reconnect Gmail to read new bank mail.");
  const ctx: Ctx = { db: db(), userId: user.id, tz: user.timezone };
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const token = await accessToken(ctx.db, cfg.config, user.id);
      return await syncMailbox({ ctx, client: gmailClient(token), autoFile: user.autoFile, force: force || attempt > 1 });
    } catch (e) {
      if (e instanceof GmailError && e.status === 401 && attempt === 1) {
        await run(ctx.db, "UPDATE google_grants SET access_expires_at = NULL WHERE user_id = ?", [user.id]);
        continue;
      }
      if (e instanceof GoogleAuthError) {
        if (e.code === "invalid_grant" || e.code === "not_connected") throw new UserError("Google has stopped letting us read your mail. Reconnect Gmail to continue.");
        throw new UserError("Couldn't reach Google just now. The wire will try again shortly.");
      }
      if (e instanceof GmailError) {
        throw new UserError(e.status === 0 || e.status >= 500 || e.status === 429 ? "Gmail is slow to answer right now. The wire will try again shortly." : "Gmail refused the request. Try reconnecting Gmail.");
      }
      throw e;
    }
  }
  throw new UserError("Couldn't read your mail just now.");
}
