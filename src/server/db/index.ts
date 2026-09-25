import pg from "pg";
import { MIGRATIONS } from "./migrations.ts";

// PostgreSQL behind a small interface so the service layer never touches a
// driver. Production uses a pg Pool (Neon, or any Postgres); tests use PGlite
// in-process (see test-helpers.ts).
//
// SQL is written with `?` (array params) or `:name` (object params) and
// compiled to Postgres' $1, $2… here.

export interface Db {
  query(text: string, values: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number }>;
  /**
   * Runs `fn` in one transaction. Nested calls join the outer one. SERIALIZABLE
   * by default — every check-then-write in the services stays correct under
   * concurrent requests — and retried on serialization failure, so `fn` must
   * only touch the database.
   */
  transaction<T>(fn: (db: Db) => Promise<T>, opts?: { readCommitted?: boolean }): Promise<T>;
}

type Params = Record<string, unknown> | unknown[];

const compiled = new Map<string, { text: string; names: string[] | null }>();

/** Rewrites `?` / `:name` placeholders to $n, leaving string literals and `::casts` alone. */
export function compile(sql: string, named: boolean): { text: string; names: string[] | null } {
  const cacheKey = `${named ? "n" : "p"}${sql}`;
  const hit = compiled.get(cacheKey);
  if (hit) return hit;
  let out = "";
  let n = 0;
  const names: string[] = [];
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'") {
      const end = sql.indexOf("'", i + 1);
      if (end === -1) throw new Error("Unterminated string literal in SQL");
      out += sql.slice(i, end + 1);
      i = end;
      // '' inside a literal is an escaped quote; the next iteration re-enters the literal
    } else if (c === ":" && sql[i + 1] === ":") {
      out += "::";
      i++;
    } else if (named && c === ":" && /[A-Za-z_]/.test(sql[i + 1] ?? "")) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(sql.slice(i + 1))!;
      let idx = names.indexOf(m[0]);
      if (idx === -1) idx = names.push(m[0]) - 1;
      out += `$${idx + 1}`;
      i += m[0].length;
    } else if (!named && c === "?") {
      out += `$${++n}`;
    } else {
      out += c;
    }
  }
  const result = { text: out, names: named ? names : null };
  compiled.set(cacheKey, result);
  return result;
}

function exec(db: Db, sql: string, params: Params) {
  const named = !Array.isArray(params);
  const { text, names } = compile(sql, named);
  const values = named ? names!.map((k) => {
    if (!(k in params)) throw new Error(`Missing SQL parameter :${k}`);
    return (params as Record<string, unknown>)[k];
  }) : (params as unknown[]);
  return db.query(text, values);
}

export async function all<T>(db: Db, sql: string, params: Params = []): Promise<T[]> {
  return (await exec(db, sql, params)).rows as T[];
}

export async function one<T>(db: Db, sql: string, params: Params = []): Promise<T | undefined> {
  return (await exec(db, sql, params)).rows[0] as T | undefined;
}

/** For writes. `changes` is the number of rows affected; add RETURNING to get `rows`. */
export async function run(db: Db, sql: string, params: Params = []): Promise<{ changes: number; rows: Record<string, unknown>[] }> {
  const r = await exec(db, sql, params);
  return { changes: r.rowCount, rows: r.rows };
}

/** The id from an `INSERT … RETURNING id`. */
export async function insertId(db: Db, sql: string, params: Params = []): Promise<number> {
  const { rows } = await run(db, `${sql} RETURNING id`, params);
  return Number(rows[0].id);
}

export function tx<T>(db: Db, fn: (db: Db) => Promise<T>): Promise<T> {
  return db.transaction(fn);
}

/** `tx` for service functions: the callback gets a context bound to the transaction. */
export function withTx<C extends { db: Db }, T>(ctx: C, fn: (ctx: C) => Promise<T>): Promise<T> {
  return ctx.db.transaction((db) => fn({ ...ctx, db }));
}

// ─── pg Pool adapter ────────────────────────────────────────────────────────

// COUNT(*) is int8 and SUM(bigint) is numeric; pg returns both as strings.
// Every such value here is a count or paise and fits a JS number exactly.
function toNumber(v: string): number {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new Error(`Database returned ${v}, which does not fit a JavaScript number`);
  return n;
}
export const NUMBER_OIDS = [20 /* int8 */, 1700 /* numeric */];
export const pgTypes = {
  getTypeParser: ((oid: number, format?: "text" | "binary") =>
    NUMBER_OIDS.includes(oid) && format !== "binary" ? toNumber : pg.types.getTypeParser(oid, format)) as typeof pg.types.getTypeParser,
};

const RETRYABLE = new Set(["40001" /* serialization_failure */, "40P01" /* deadlock_detected */]);
const MAX_ATTEMPTS = 5;
const isRetryable = (e: unknown) => !!e && typeof e === "object" && RETRYABLE.has(String((e as { code?: unknown }).code));
const backoff = (attempt: number) => new Promise((r) => setTimeout(r, Math.random() * 20 * 2 ** attempt));

function clientDb(client: pg.PoolClient): Db {
  const self: Db = {
    async query(text, values) {
      const r = await client.query(text, values);
      return { rows: r.rows, rowCount: r.rowCount ?? 0 };
    },
    transaction: (fn) => fn(self),
  };
  return self;
}

export function poolDb(pool: pg.Pool): Db {
  return {
    async query(text, values) {
      const r = await pool.query(text, values);
      return { rows: r.rows, rowCount: r.rowCount ?? 0 };
    },
    async transaction(fn, opts) {
      for (let attempt = 1; ; attempt++) {
        const client = await pool.connect();
        let broken: Error | undefined;
        try {
          await client.query(opts?.readCommitted ? "BEGIN" : "BEGIN ISOLATION LEVEL SERIALIZABLE");
          const out = await fn(clientDb(client));
          await client.query("COMMIT");
          return out;
        } catch (e) {
          try {
            await client.query("ROLLBACK");
          } catch (rollbackError) {
            broken = rollbackError as Error; // don't hand a confused connection back to the pool
          }
          if (!isRetryable(e) || attempt >= MAX_ATTEMPTS) throw e;
        } finally {
          client.release(broken);
        }
        await backoff(attempt);
      }
    },
  };
}

/**
 * Wraps a Db so the first use runs `init` (migrations) once. A failed init is
 * retried on the next use instead of poisoning the process.
 */
export function afterInit(db: Db, init: (db: Db) => Promise<void>): Db {
  let ready: Promise<void> | undefined;
  const wait = () => (ready ??= init(db).catch((e) => {
    ready = undefined;
    throw e;
  }));
  return {
    query: async (text, values) => (await wait(), db.query(text, values)),
    transaction: async (fn, opts) => (await wait(), db.transaction(fn, opts)),
  };
}

// ─── migrations ─────────────────────────────────────────────────────────────

/**
 * Applies pending migrations. Safe to call from many processes at once: an
 * advisory lock makes them take turns, and each migration commits with its
 * version so a crash never leaves one half-applied.
 */
export async function migrate(db: Db): Promise<void> {
  await db.transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext('money-control:migrations'))", []);
    await db.query("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)", []);
    const r = await one<{ v: number | null }>(db, "SELECT MAX(version) AS v FROM schema_migrations");
    const current = r?.v ?? 0;
    if (current > MIGRATIONS.length)
      throw new Error(`Database is at schema v${current} but this build only knows v${MIGRATIONS.length}. Refusing to run an older build against newer data.`);
    for (let v = current; v < MIGRATIONS.length; v++) {
      await db.query(MIGRATIONS[v], []);
      await run(db, "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", [v + 1, new Date().toISOString()]);
    }
  }, { readCommitted: true });
}
