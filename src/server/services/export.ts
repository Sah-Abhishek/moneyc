import { YM } from "../../lib/dates.ts";
import { all } from "../db/index.ts";
import { UserError, type Ctx } from "./context.ts";

/** One month of the ledger as CSV, the way a spreadsheet opens it cleanly. */
export async function monthCsv(ctx: Ctx, month: string): Promise<{ filename: string; csv: string; rows: number }> {
  if (!YM.test(month)) throw new UserError("Choose a month as YYYY-MM.", { month: "Choose a month" });
  const rows = await all<Record<string, string | number | null>>(
    ctx.db,
    `SELECT e.occurred_at, e.payee, e.amount, e.channel, e.ref, e.account, e.note, e.item, t.name AS tag, p.name AS person, e.source,
       CASE WHEN e.to_wallet THEN 'yes' ELSE '' END AS to_wallet
     FROM entries e LEFT JOIN tags t ON t.id = e.tag_id LEFT JOIN people p ON p.id = e.person_id
     WHERE e.user_id = ? AND e.deleted_at IS NULL AND substr(e.occurred_at, 1, 7) = ?
     ORDER BY e.occurred_at, e.id`,
    [ctx.userId, month],
  );

  // Cells that start with = + - @ are prefixed so spreadsheets don't run them as formulas.
  const cell = (v: string | number | null) => {
    let s = v == null ? "" : typeof v === "number" ? v.toFixed(2) : v;
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["date", "payee", "amount_inr", "channel", "reference", "account", "note", "tag", "slate_person", "source", "cash_to_wallet", "what_for"];
  const lines = rows.map((r) =>
    [r.occurred_at, r.payee, Number((Number(r.amount) / 100).toFixed(2)), r.channel, r.ref, r.account, r.note, r.tag, r.person, r.source, r.to_wallet, r.item].map(cell).join(","),
  );
  return { filename: `money-control-${month}.csv`, csv: `﻿${[header.join(","), ...lines].join("\r\n")}\r\n`, rows: rows.length };
}
