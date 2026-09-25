// Test fixtures: a fresh Postgres per test (PGlite, in-process), with real
// migrations. Migrations run once into a template that each test clones.
import { after } from "node:test";
import { PGlite, type PGliteInterface, type Transaction } from "@electric-sql/pglite";
import { migrate, NUMBER_OIDS, type Db } from "./db/index.ts";
import type { Ctx } from "./services/context.ts";
import { upsertGoogleUser } from "./services/users.ts";
import type { GmailMessage } from "./gmail/mime.ts";

// Same number handling as production (see pgTypes in db/index.ts).
const parsers = Object.fromEntries(NUMBER_OIDS.map((oid) => [oid, (v: string) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new Error(`Database returned ${v}, which does not fit a JavaScript number`);
  return n;
}]));

function pgliteDb(pg: PGliteInterface | Transaction): Db {
  const self: Db = {
    async query(text, values) {
      // Parameterless text may hold several statements (migrations); only exec runs those.
      if (!values.length) {
        const results = await pg.exec(text, { parsers });
        const last = results.at(-1);
        return { rows: (last?.rows ?? []) as Record<string, unknown>[], rowCount: last?.affectedRows ?? last?.rows.length ?? 0 };
      }
      const r = await pg.query<Record<string, unknown>>(text, values, { parsers });
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
    transaction: (fn) => ("transaction" in pg ? pg.transaction((t) => fn(pgliteDb(t))) : fn(self)),
  };
  return self;
}

let template: Promise<PGlite> | undefined;
const open: PGliteInterface[] = [];

// Open databases keep the process alive; close them when the test file ends.
after(async () => {
  await Promise.all(open.map((pg) => pg.close()));
});

/** An empty, fully migrated database of its own. */
export async function freshDb(): Promise<Db> {
  template ??= (async () => {
    const pg = new PGlite();
    open.push(pg);
    await migrate(pgliteDb(pg));
    return pg;
  })();
  const pg = await (await template).clone();
  open.push(pg);
  return pgliteDb(pg);
}

export async function freshCtx(sub = "sub-1", tz = "Asia/Kolkata"): Promise<Ctx> {
  const db = await freshDb();
  const { user } = await upsertGoogleUser(db, { sub, email: `${sub}@example.com`, name: "Test" });
  return { db, userId: user.id, tz };
}

export async function secondUser(ctx: Ctx, sub = "sub-2"): Promise<Ctx> {
  const { user } = await upsertGoogleUser(ctx.db, { sub, email: `${sub}@example.com`, name: "Other" });
  return { db: ctx.db, userId: user.id, tz: ctx.tz };
}

export async function tagId(ctx: Ctx, name: string): Promise<number> {
  const { rows } = await ctx.db.query("SELECT id FROM tags WHERE user_id = $1 AND name = $2", [ctx.userId, name]);
  if (!rows[0]) throw new Error(`no tag ${name}`);
  return Number(rows[0].id);
}

let n = 0;
export const key = () => `test-key-${++n}-${Math.random().toString(36).slice(2)}`;

export function gmailMessage(id: string, from: string, subject: string, text: string, at = Date.now()): GmailMessage {
  return {
    id,
    internalDate: String(at),
    payload: {
      mimeType: "multipart/alternative",
      headers: [{ name: "From", value: from }, { name: "Subject", value: subject }],
      parts: [{ mimeType: "text/plain", body: { data: Buffer.from(text).toString("base64url") } }],
    },
  };
}

/** Inserts a waiting wire mail directly, as the sync would. */
export async function insertMail(ctx: Ctx, body: string, opts: { sender?: string; bank?: string; receivedAt?: string; gmailId?: string } = {}): Promise<number> {
  const { rows } = await ctx.db.query(
    `INSERT INTO wire_mails (user_id, gmail_id, sender, bank, subject, body, received_at, status, created_at)
     VALUES ($1, $2, $3, $4, NULL, $5, $6, 'waiting', $7) RETURNING id`,
    [ctx.userId, opts.gmailId ?? key(), opts.sender ?? "alerts@hdfcbank.net", opts.bank ?? "HDFC Bank", body, opts.receivedAt ?? "2026-09-22T11:20:00", new Date().toISOString()],
  );
  return Number(rows[0].id);
}
