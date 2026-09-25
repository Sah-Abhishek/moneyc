import { db } from "@/server/app";
import { one } from "@/server/db/index";
import { loadConfig } from "@/server/env";

// For load balancers / uptime checks. Reports readiness without leaking config values.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await one(db(), "SELECT 1");
    const cfg = loadConfig();
    return Response.json({ ok: true, db: "ok", configured: cfg.ok }, { status: cfg.ok ? 200 : 503 });
  } catch {
    return Response.json({ ok: false, db: "error" }, { status: 503 });
  }
}
