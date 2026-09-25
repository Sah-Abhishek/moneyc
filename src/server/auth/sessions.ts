import { randomToken, sha256 } from "../crypto.ts";
import { one, run, type Db } from "../db/index.ts";

// Opaque random session tokens. The cookie holds the token; the database holds
// only its hash. Sessions slide: each use within the window extends them.

export const SESSION_DAYS = 30;
const TOUCH_EVERY_MS = 60 * 60 * 1000;

export async function createSession(db: Db, userId: number, userAgent: string | null): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await run(db, "INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)", [
    sha256(token), userId, now.toISOString(), expiresAt.toISOString(), now.toISOString(), userAgent?.slice(0, 200) ?? null,
  ]);
  return { token, expiresAt };
}

/** Returns the user id for a live session token, extending it if due. */
export async function readSession(db: Db, token: string | undefined): Promise<{ userId: number; expiresAt: string } | null> {
  if (!token || token.length > 100) return null;
  const id = sha256(token);
  const s = await one<{ user_id: number; expires_at: string; last_seen_at: string }>(db, "SELECT user_id, expires_at, last_seen_at FROM sessions WHERE id = ?", [id]);
  if (!s) return null;
  const now = Date.now();
  if (Date.parse(s.expires_at) <= now) {
    await run(db, "DELETE FROM sessions WHERE id = ?", [id]);
    return null;
  }
  if (now - Date.parse(s.last_seen_at) > TOUCH_EVERY_MS) {
    const expiresAt = new Date(now + SESSION_DAYS * 86_400_000).toISOString();
    await run(db, "UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?", [new Date(now).toISOString(), expiresAt, id]);
    return { userId: s.user_id, expiresAt };
  }
  return { userId: s.user_id, expiresAt: s.expires_at };
}

export async function destroySession(db: Db, token: string | undefined) {
  if (token) await run(db, "DELETE FROM sessions WHERE id = ?", [sha256(token)]);
}

export async function destroyAllSessions(db: Db, userId: number) {
  await run(db, "DELETE FROM sessions WHERE user_id = ?", [userId]);
}

export async function purgeExpired(db: Db) {
  await run(db, "DELETE FROM sessions WHERE expires_at <= ?", [new Date().toISOString()]);
  await run(db, "DELETE FROM oauth_states WHERE created_at <= ?", [new Date(Date.now() - 15 * 60_000).toISOString()]);
}
