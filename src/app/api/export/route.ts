import { cookies } from "next/headers";
import { YM } from "@/lib/dates";
import { db, SESSION_COOKIE } from "@/server/app";
import { readSession } from "@/server/auth/sessions";
import { log } from "@/server/log";
import { monthCsv } from "@/server/services/export";

// CSV of one month of the signed-in user's ledger: /api/export?month=2026-09
export async function GET(request: Request) {
  const session = await readSession(db(), (await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return new Response("Sign in to export your ledger.", { status: 401 });

  const month = new URL(request.url).searchParams.get("month") ?? "";
  if (!YM.test(month)) return new Response("Add ?month=YYYY-MM to choose a month.", { status: 400 });

  const { filename, csv, rows } = await monthCsv({ db: db(), userId: session.userId, tz: "UTC" }, month);
  log.info("export.month", { userId: session.userId, month, rows });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
