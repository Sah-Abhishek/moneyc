import { cookies } from "next/headers";
import { YM } from "@/lib/dates";
import { db, SESSION_COOKIE } from "@/server/app";
import { readSession } from "@/server/auth/sessions";
import { all } from "@/server/db/index";
import { log } from "@/server/log";

// CSV of one month of the signed-in user's ledger: /api/export?month=2026-09
export async function GET(request: Request) {
  const session = await readSession(db(), (await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return new Response("Sign in to export your ledger.", { status: 401 });

  const month = new URL(request.url).searchParams.get("month") ?? "";
  if (!YM.test(month)) return new Response("Add ?month=YYYY-MM to choose a month.", { status: 400 });

  const rows = await all<Record<string, string | number | null>>(
    db(),
    `SELECT e.occurred_at, e.payee, e.amount, e.channel, e.ref, e.account, e.note, t.name AS tag, p.name AS person, e.source
     FROM entries e LEFT JOIN tags t ON t.id = e.tag_id LEFT JOIN people p ON p.id = e.person_id
     WHERE e.user_id = ? AND e.deleted_at IS NULL AND substr(e.occurred_at, 1, 7) = ?
     ORDER BY e.occurred_at, e.id`,
    [session.userId, month],
  );

  // Cells that start with = + - @ are prefixed so spreadsheets don't run them as formulas.
  const cell = (v: string | number | null) => {
    let s = v == null ? "" : typeof v === "number" ? v.toFixed(2) : v;
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["date", "payee", "amount_inr", "channel", "reference", "account", "note", "tag", "slate_person", "source"];
  const lines = rows.map((r) =>
    [r.occurred_at, r.payee, Number((Number(r.amount) / 100).toFixed(2)), r.channel, r.ref, r.account, r.note, r.tag, r.person, r.source].map(cell).join(","),
  );
  log.info("export.month", { userId: session.userId, month, rows: rows.length });

  return new Response(`﻿${[header.join(","), ...lines].join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="money-control-${month}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
