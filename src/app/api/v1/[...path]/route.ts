import type { NextRequest } from "next/server";
import { db, runSync, wireConnection } from "@/server/app";
import { handleApi, type ApiDeps } from "@/server/api/router";
import { loadConfig } from "@/server/env";

// The Android app's API. All routing lives in src/server/api/router.ts; this
// file only supplies the real database, configuration and Gmail sync.

export const dynamic = "force-dynamic";

const deps = (): ApiDeps => ({ db: db(), config: loadConfig, connection: wireConnection, sync: runSync });

async function handle(req: NextRequest, ctx: RouteContext<"/api/v1/[...path]">) {
  const { path } = await ctx.params;
  return handleApi(req, path, deps());
}

export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
