import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { decrypt, encrypt } from "../crypto.ts";
import { upsertGoogleUser } from "../services/users.ts";
import { accessToken, beginAuth, exchangeCode, GoogleAuthError, grantStatus, safeReturnTo, saveGrant, takeState } from "./google.ts";
import { createSession, destroySession, readSession } from "./sessions.ts";
import { freshDb } from "../test-helpers.ts";

const key = randomBytes(32);
const cfg = {
  appUrl: "https://ledger.example", googleClientId: "client-123", googleClientSecret: "shh",
  secretKey: key, isProduction: true,
};

const idToken = (claims: Record<string, unknown>) =>
  `x.${Buffer.from(JSON.stringify({ iss: "https://accounts.google.com", aud: "client-123", exp: Date.now() / 1000 + 600, sub: "g-1", email: "a@b.com", email_verified: true, ...claims })).toString("base64url")}.y`;

test("token encryption round-trips and detects tampering", async () => {
  const sealed = encrypt("1//refresh-token", key);
  assert.ok(!sealed.includes("refresh"));
  assert.equal(decrypt(sealed, key), "1//refresh-token");
  const parts = sealed.split(".");
  parts[3] = Buffer.from("evil").toString("base64url");
  assert.throws(() => decrypt(parts.join("."), key));
  assert.throws(() => decrypt(sealed, randomBytes(32)));
});

test("sessions: stored hashed, readable, destroyable, expire", async () => {
  const db = await freshDb();
  const { user } = await upsertGoogleUser(db, { sub: "s", email: "s@x.com", name: null });
  const { token } = await createSession(db, user.id, "test");
  assert.equal((await db.query("SELECT COUNT(*) AS n FROM sessions WHERE id = $1", [token])).rows[0].n, 0); // raw token never stored
  assert.equal((await readSession(db, token))?.userId, user.id);
  assert.equal(await readSession(db, "nope"), null);
  await db.query("UPDATE sessions SET expires_at = $1", [new Date(Date.now() - 1000).toISOString()]);
  assert.equal(await readSession(db, token), null);
  const second = await createSession(db, user.id, null);
  await destroySession(db, second.token);
  assert.equal(await readSession(db, second.token), null);
});

test("OAuth state is single-use and return paths stay on this site", async () => {
  const db = await freshDb();
  const url = new URL(await beginAuth(db, cfg, "/slate"));
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.match(url.searchParams.get("scope") ?? "", /gmail\.readonly/);
  const state = url.searchParams.get("state");
  assert.equal((await takeState(db, state))?.returnTo, "/slate");
  assert.equal(await takeState(db, state), null);
  assert.equal(safeReturnTo("//evil.com"), "/");
  assert.equal(safeReturnTo("https://evil.com"), "/");
  assert.equal(safeReturnTo("/\\evil.com"), "/");
});

test("code exchange checks the ID token's audience", async () => {
  const google = (claims: Record<string, unknown>): typeof fetch => async () =>
    Response.json({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "openid email https://www.googleapis.com/auth/gmail.readonly", id_token: idToken(claims) });
  const ok = await exchangeCode(cfg, "code", "verifier", google({}));
  assert.equal(ok.identity?.sub, "g-1");
  await assert.rejects(exchangeCode(cfg, "code", "verifier", google({ aud: "someone-else" })), GoogleAuthError);
});

test("a revoked refresh token marks the grant revoked", async () => {
  const db = await freshDb();
  const { user } = await upsertGoogleUser(db, { sub: "s", email: "s@x.com", name: null });
  await saveGrant(db, cfg, user.id, { accessToken: "old", refreshToken: "rt", expiresAt: new Date(Date.now() - 1000), scope: "https://www.googleapis.com/auth/gmail.readonly", identity: null });
  assert.equal(await grantStatus(db, user.id), "active");
  const revoked: typeof fetch = async () => Response.json({ error: "invalid_grant" }, { status: 400 });
  await assert.rejects(accessToken(db, cfg, user.id, revoked), GoogleAuthError);
  assert.equal(await grantStatus(db, user.id), "revoked");
});
