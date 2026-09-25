import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/app";
import { beginAuth, safeReturnTo } from "@/server/auth/google";
import { purgeExpired } from "@/server/auth/sessions";
import { loadConfig } from "@/server/env";
import { log } from "@/server/log";

// Starts "Continue with Google". Also used to reconnect Gmail.
export async function GET(req: NextRequest) {
  const cfg = loadConfig();
  if (!cfg.ok) {
    log.error("auth.not_configured", { missing: cfg.missing, problems: cfg.problems });
    return NextResponse.redirect(new URL("/welcome?error=not_configured", req.url));
  }
  await purgeExpired(db());
  const url = await beginAuth(db(), cfg.config, safeReturnTo(req.nextUrl.searchParams.get("next")));
  return NextResponse.redirect(url);
}
