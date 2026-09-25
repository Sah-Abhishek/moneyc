import { createHash } from "node:crypto";
import { decrypt, encrypt, randomToken } from "../crypto.ts";
import { one, run, type Db } from "../db/index.ts";
import type { Config } from "../env.ts";
import { log } from "../log.ts";

// Google OAuth 2.0 authorization-code flow with PKCE. We ask for identity plus
// read-only Gmail — the product cannot work without reading bank alerts, which
// is why sign-in is Google-only.

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const SCOPES = ["openid", "email", "profile", GMAIL_SCOPE];
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const STATE_TTL_MS = 10 * 60_000;
const TIMEOUT_MS = 15_000;

export const redirectUri = (cfg: Config) => `${cfg.appUrl}/auth/google/callback`;

/** Only same-site relative paths may be returned to after sign-in. */
export function safeReturnTo(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw.slice(0, 300);
}

export async function beginAuth(db: Db, cfg: Config, returnTo: string): Promise<string> {
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  await run(db, "INSERT INTO oauth_states (state, code_verifier, return_to, created_at) VALUES (?, ?, ?, ?)", [
    state, verifier, safeReturnTo(returnTo), new Date().toISOString(),
  ]);
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: cfg.googleClientId,
    redirect_uri: redirectUri(cfg),
    response_type: "code",
    scope: SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline", // we need a refresh token to read mail later
    prompt: "consent", // …and Google only issues one on consent
    include_granted_scopes: "true",
  }).toString();
  return url.toString();
}

/** Consumes a state exactly once. */
export async function takeState(db: Db, state: string | null): Promise<{ verifier: string; returnTo: string } | null> {
  if (!state || state.length > 100) return null;
  // Delete-and-read in one statement: two racing callbacks can't both get it.
  const row = await one<{ code_verifier: string; return_to: string; created_at: string }>(
    db, "DELETE FROM oauth_states WHERE state = ? RETURNING code_verifier, return_to, created_at", [state],
  );
  if (!row || Date.now() - Date.parse(row.created_at) > STATE_TTL_MS) return null;
  return { verifier: row.code_verifier, returnTo: row.return_to };
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scope: string;
  identity: GoogleIdentity | null;
}

export class GoogleAuthError extends Error {
  name = "GoogleAuthError";
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

async function postToken(body: Record<string, string>, fetchImpl: typeof fetch): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new GoogleAuthError(`Could not reach Google: ${(e as Error).message}`, "network");
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new GoogleAuthError(String(json.error_description ?? json.error ?? `HTTP ${res.status}`), String(json.error ?? res.status));
  return json;
}

// The ID token comes straight from Google's token endpoint over TLS, so per
// OpenID Connect Core §3.1.3.7 its signature need not be re-verified; we still
// check issuer, audience and expiry.
function readIdToken(idToken: unknown, cfg: Config): GoogleIdentity {
  if (typeof idToken !== "string") throw new GoogleAuthError("Google did not return an identity", "no_id_token");
  const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
  if (!["accounts.google.com", "https://accounts.google.com"].includes(String(payload.iss))) throw new GoogleAuthError("Unexpected token issuer", "bad_iss");
  if (payload.aud !== cfg.googleClientId) throw new GoogleAuthError("Token was issued to a different app", "bad_aud");
  if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now() - 60_000) throw new GoogleAuthError("Token has expired", "expired");
  if (typeof payload.sub !== "string" || typeof payload.email !== "string") throw new GoogleAuthError("Token is missing the account id or email", "bad_claims");
  return { sub: payload.sub, email: payload.email, emailVerified: payload.email_verified === true, name: typeof payload.name === "string" ? payload.name : null };
}

export async function exchangeCode(cfg: Config, code: string, verifier: string, fetchImpl: typeof fetch = fetch): Promise<TokenSet> {
  const json = await postToken(
    { code, code_verifier: verifier, client_id: cfg.googleClientId, client_secret: cfg.googleClientSecret, redirect_uri: redirectUri(cfg), grant_type: "authorization_code" },
    fetchImpl,
  );
  return toTokenSet(json, cfg);
}

/**
 * The Android app's sign-in: Google gives the app a one-time "server auth
 * code" for this (web) client, which only the server can redeem — so the Gmail
 * refresh token never lives on the phone. Native codes carry no PKCE verifier
 * and are redeemed with an empty redirect URI.
 */
export async function exchangeServerAuthCode(cfg: Config, code: string, fetchImpl: typeof fetch = fetch): Promise<TokenSet> {
  const json = await postToken(
    { code, client_id: cfg.googleClientId, client_secret: cfg.googleClientSecret, redirect_uri: "", grant_type: "authorization_code" },
    fetchImpl,
  );
  return toTokenSet(json, cfg);
}

function toTokenSet(json: Record<string, unknown>, cfg: Config): TokenSet {
  return {
    accessToken: String(json.access_token),
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : null,
    expiresAt: new Date(Date.now() + Number(json.expires_in ?? 3600) * 1000),
    scope: String(json.scope ?? ""),
    identity: readIdToken(json.id_token, cfg),
  };
}

export const hasGmailScope = (scope: string) => scope.split(/\s+/).includes(GMAIL_SCOPE);

export async function saveGrant(db: Db, cfg: Config, userId: number, t: TokenSet) {
  const refresh = t.refreshToken ? encrypt(t.refreshToken, cfg.secretKey) : null;
  // Google omits the refresh token on some re-consents; keep the one we have.
  await run(
    db,
    `INSERT INTO google_grants (user_id, refresh_token, access_token, access_expires_at, scope, status, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?)
     ON CONFLICT(user_id) DO UPDATE SET refresh_token = COALESCE(excluded.refresh_token, google_grants.refresh_token), access_token = excluded.access_token,
       access_expires_at = excluded.access_expires_at, scope = excluded.scope, status = 'active', updated_at = excluded.updated_at`,
    [userId, refresh, encrypt(t.accessToken, cfg.secretKey), t.expiresAt.toISOString(), t.scope, new Date().toISOString()],
  );
}

export type GrantStatus = "active" | "revoked" | "missing" | "no_gmail_scope";

export async function grantStatus(db: Db, userId: number): Promise<GrantStatus> {
  const g = await one<{ status: string; scope: string; refresh_token: string | null }>(db, "SELECT status, scope, refresh_token FROM google_grants WHERE user_id = ?", [userId]);
  if (!g) return "missing";
  if (g.status === "revoked" || !g.refresh_token) return "revoked";
  if (!hasGmailScope(g.scope)) return "no_gmail_scope";
  return "active";
}

/** A usable access token, refreshing it if it is about to expire. */
export async function accessToken(db: Db, cfg: Config, userId: number, fetchImpl: typeof fetch = fetch): Promise<string> {
  const g = await one<{ refresh_token: string | null; access_token: string | null; access_expires_at: string | null; status: string }>(
    db, "SELECT refresh_token, access_token, access_expires_at, status FROM google_grants WHERE user_id = ?", [userId],
  );
  if (!g || g.status === "revoked" || !g.refresh_token) throw new GoogleAuthError("Gmail is not connected", "not_connected");
  if (g.access_token && g.access_expires_at && Date.parse(g.access_expires_at) - Date.now() > 60_000) return decrypt(g.access_token, cfg.secretKey);
  try {
    const json = await postToken(
      { grant_type: "refresh_token", refresh_token: decrypt(g.refresh_token, cfg.secretKey), client_id: cfg.googleClientId, client_secret: cfg.googleClientSecret },
      fetchImpl,
    );
    const token = String(json.access_token);
    const expires = new Date(Date.now() + Number(json.expires_in ?? 3600) * 1000);
    await run(db, "UPDATE google_grants SET access_token = ?, access_expires_at = ?, updated_at = ? WHERE user_id = ?", [
      encrypt(token, cfg.secretKey), expires.toISOString(), new Date().toISOString(), userId,
    ]);
    return token;
  } catch (e) {
    if (e instanceof GoogleAuthError && e.code === "invalid_grant") {
      // The user revoked access in their Google account, or the grant expired.
      await run(db, "UPDATE google_grants SET status = 'revoked', access_token = NULL, updated_at = ? WHERE user_id = ?", [new Date().toISOString(), userId]);
      log.warn("google.grant_revoked", { userId });
    }
    throw e;
  }
}

/** Revokes our access at Google and forgets the tokens. Local forgetting happens even if Google is unreachable. */
export async function revokeGrant(db: Db, cfg: Config, userId: number, fetchImpl: typeof fetch = fetch) {
  const g = await one<{ refresh_token: string | null }>(db, "SELECT refresh_token FROM google_grants WHERE user_id = ?", [userId]);
  await run(db, "UPDATE google_grants SET status = 'revoked', refresh_token = NULL, access_token = NULL, updated_at = ? WHERE user_id = ?", [new Date().toISOString(), userId]);
  if (!g?.refresh_token) return;
  try {
    await fetchImpl(`${REVOKE_URL}?token=${encodeURIComponent(decrypt(g.refresh_token, cfg.secretKey))}`, { method: "POST", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    log.warn("google.revoke_failed", { userId, error: e });
  }
}
