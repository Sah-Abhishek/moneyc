import { NextResponse, type NextRequest } from "next/server";
import { db, SESSION_COOKIE } from "@/server/app";
import { exchangeCode, GoogleAuthError, hasGmailScope, saveGrant, takeState } from "@/server/auth/google";
import { createSession } from "@/server/auth/sessions";
import { loadConfig } from "@/server/env";
import { log } from "@/server/log";
import { upsertGoogleUser } from "@/server/services/users";

// Google sends the user back here with ?code&state (or ?error).
export async function GET(req: NextRequest) {
  const fail = (error: string) => NextResponse.redirect(new URL(`/welcome?error=${error}`, req.url));
  const cfg = loadConfig();
  if (!cfg.ok) return fail("not_configured");

  const p = req.nextUrl.searchParams;
  if (p.get("error")) return fail(p.get("error") === "access_denied" ? "denied" : "google");
  const state = await takeState(db(), p.get("state"));
  if (!state) return fail("expired"); // replayed, forged or too old
  const code = p.get("code");
  if (!code) return fail("google");

  try {
    const tokens = await exchangeCode(cfg.config, code, state.verifier);
    const id = tokens.identity!;
    if (!id.emailVerified) return fail("unverified");
    const { user, created } = await upsertGoogleUser(db(), { sub: id.sub, email: id.email, name: id.name });
    await saveGrant(db(), cfg.config, user.id, tokens);
    const session = await createSession(db(), user.id, req.headers.get("user-agent"));
    log.info("auth.signed_in", { userId: user.id, created, gmail: hasGmailScope(tokens.scope) });

    const res = NextResponse.redirect(new URL(created ? "/?welcome=1" : state.returnTo, req.url));
    res.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: cfg.config.isProduction,
      sameSite: "lax",
      path: "/",
      expires: session.expiresAt,
    });
    return res;
  } catch (e) {
    log.error("auth.callback_failed", { error: e, code: e instanceof GoogleAuthError ? e.code : undefined });
    return fail(e instanceof GoogleAuthError && e.code === "network" ? "network" : "google");
  }
}
