import { test } from "node:test";
import assert from "node:assert/strict";
import { GoogleAuthError, GMAIL_SCOPE, type TokenSet } from "../auth/google.ts";
import { createSession } from "../auth/sessions.ts";
import type { Config, ConfigResult } from "../env.ts";
import { freshCtx, insertMail, key, secondUser, tagId } from "../test-helpers.ts";
import type { Ctx } from "../services/context.ts";
import { handleApi, type ApiDeps } from "./router.ts";

const HDFC = "Dear Customer, Rs.10.00 has been debited from account **4721 to VPA vinodsi@okaxis VINOD SI on 22-09-26 11:18:42. Your UPI transaction reference number is 626412345672.";

const CONFIG: Config = {
  appUrl: "http://localhost:3000", googleClientId: "web-client", googleClientSecret: "secret", secretKey: Buffer.alloc(32, 7), isProduction: false,
};

function deps(ctx: Ctx, over: Partial<ApiDeps> = {}): ApiDeps {
  return {
    db: ctx.db,
    config: (): ConfigResult => ({ ok: true, config: CONFIG }),
    connection: async () => "connected",
    sync: async () => ({ status: "done", fetched: 0, added: 0, autoFiled: 0, skipped: 0, more: false }),
    ...over,
  };
}

/** Calls the API the way the app does; returns status + parsed JSON (or text). */
async function call(d: ApiDeps, method: string, path: string, opts: { token?: string; body?: unknown; raw?: string; type?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined || opts.raw !== undefined) headers["content-type"] = opts.type ?? "application/json";
  const req = new Request(`http://localhost/api/v1/${path}`, { method, headers, body: opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)) });
  const res = await handleApi(req, new URL(req.url).pathname.replace(/^\/api\/v1\//, "").split("/"), d);
  const text = await res.text();
  let json: Record<string, any> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    json = JSON.parse(text);
  } catch {
    // CSV and other non-JSON bodies
  }
  return { status: res.status, json: json!, text, headers: res.headers };
}

async function signedIn(sub?: string) {
  const ctx = await freshCtx(sub);
  const { token } = await createSession(ctx.db, ctx.userId, "test");
  return { ctx, token, d: deps(ctx) };
}

const tokens = (over: Partial<TokenSet["identity"] & object> = {}, scope = `openid email profile ${GMAIL_SCOPE}`): TokenSet => ({
  accessToken: "access", refreshToken: "refresh", expiresAt: new Date(Date.now() + 3_600_000), scope,
  identity: { sub: "g-123", email: "abhishek@example.com", emailVerified: true, name: "Abhishek", ...over },
});

test("api: requests need a live bearer token; the shape of every error is the same", async () => {
  const { ctx, token, d } = await signedIn();
  assert.equal((await call(d, "GET", "me")).status, 401);
  assert.equal((await call(d, "GET", "me", { token: "nonsense" })).json.code, "signed_out");

  const me = await call(d, "GET", "me", { token });
  assert.equal(me.status, 200);
  assert.equal(me.json.ok, true);
  assert.equal(me.json.data.user.id, ctx.userId);
  assert.equal(me.json.data.connection, "connected");
  assert.equal(me.headers.get("cache-control"), "private, no-store");

  assert.deepEqual((await call(d, "GET", "no/such/thing", { token })).json, { ok: false, code: "no_route", error: "There's nothing at that address." });
  const wrong = await call(d, "PATCH", "me", { token });
  assert.equal(wrong.status, 405);
  assert.equal(wrong.headers.get("allow"), "GET");
  assert.equal((await call(d, "POST", "entries", { token, raw: "{not json" })).json.code, "bad_request");
  assert.equal((await call(d, "POST", "entries", { token, raw: "[1,2]" })).status, 400);
  assert.equal((await call(d, "POST", "entries", { token, raw: "payee=x", type: "application/x-www-form-urlencoded" })).status, 415);
  assert.equal((await call(d, "POST", "entries", { token, raw: JSON.stringify({ note: "x".repeat(70_000) }) })).status, 413);

  // Signing out kills the token.
  assert.equal((await call(d, "POST", "auth/signout", { token })).status, 200);
  assert.equal((await call(d, "GET", "me", { token })).status, 401);
});

test("api: Google sign-in creates the account once and returns a working token", async () => {
  const { ctx } = await signedIn();
  const codes: string[] = [];
  const d = deps(ctx, { exchangeCode: async (_cfg, code) => (codes.push(code), tokens()) });

  const first = await call(d, "POST", "auth/google", { body: { code: "4/0Adeu5BW-one-time-code" } });
  assert.equal(first.status, 200);
  assert.equal(first.json.data.created, true);
  assert.equal(first.json.data.gmail, true);
  assert.equal(first.json.data.user.email, "abhishek@example.com");
  assert.deepEqual(codes, ["4/0Adeu5BW-one-time-code"]);
  assert.equal((await call(d, "GET", "me", { token: first.json.data.token })).json.data.user.email, "abhishek@example.com");
  const { rows: [grant] } = await ctx.db.query("SELECT status, refresh_token <> 'refresh' AS encrypted FROM google_grants g JOIN users u ON u.id = g.user_id WHERE u.google_sub = 'g-123'", []);
  assert.deepEqual(grant, { status: "active", encrypted: true }); // never stored in the clear

  const again = await call(d, "POST", "auth/google", { body: { code: "4/0Adeu5BW-second-code" } });
  assert.equal(again.json.data.created, false);
  assert.equal(again.json.data.user.id, first.json.data.user.id);

  assert.deepEqual((await call(d, "POST", "auth/google", { body: {} })).json.fieldErrors, { code: "Missing sign-in code" });
  const unverified = deps(ctx, { exchangeCode: async () => tokens({ emailVerified: false }) });
  assert.equal((await call(unverified, "POST", "auth/google", { body: { code: "4/0Adeu5BW-x-code" } })).status, 403);
  const refused = deps(ctx, { exchangeCode: async () => { throw new GoogleAuthError("bad", "invalid_grant"); } });
  assert.equal((await call(refused, "POST", "auth/google", { body: { code: "4/0Adeu5BW-x-code" } })).json.code, "google_refused");
  const offline = deps(ctx, { config: () => ({ ok: false, missing: ["GOOGLE_CLIENT_ID"], problems: [] }) });
  assert.equal((await call(offline, "POST", "auth/google", { body: { code: "4/0Adeu5BW-x-code" } })).status, 503);
});

test("api: lines — add (idempotent), list, edit with a version, delete and restore", async () => {
  const { ctx, token, d } = await signedIn();
  const food = await tagId(ctx, "Food & delivery");
  const clientKey = key();
  const body = { payee: "Swiggy", amount: "486", direction: "out", occurredAt: "2026-09-20T21:15", channel: "UPI", tagId: food, clientKey };

  const made = await call(d, "POST", "entries", { token, body });
  assert.equal(made.status, 201);
  assert.equal(made.json.data.amount, -48600);
  assert.equal(made.json.message, "Added Swiggy.");
  const twice = await call(d, "POST", "entries", { token, body });
  assert.equal(twice.status, 200);
  assert.equal(twice.json.data.id, made.json.data.id);

  const bad = await call(d, "POST", "entries", { token, body: { ...body, amount: "lots", clientKey: key() } });
  assert.equal(bad.status, 422);
  assert.equal(bad.json.fieldErrors.amount, "Enter an amount like 250 or 1,899.50");

  const list = await call(d, "GET", "entries?m=2026-09&filter=hand", { token });
  assert.equal(list.json.data.total, 1);
  assert.equal(list.json.data.ym, "2026-09");

  const lineId = made.json.data.id;
  const edited = await call(d, "PUT", `entries/${lineId}`, { token, body: { ...body, payee: "Zomato", version: made.json.data.version } });
  assert.equal(edited.json.data.payee, "Zomato");
  const stale = await call(d, "PUT", `entries/${lineId}`, { token, body: { ...body, version: made.json.data.version } });
  assert.equal(stale.status, 409);

  assert.equal((await call(d, "DELETE", `entries/${lineId}`, { token })).status, 200);
  assert.equal((await call(d, "GET", "entries?m=2026-09", { token })).json.data.total, 0);
  assert.equal((await call(d, "POST", `entries/${lineId}/restore`, { token })).json.data.payee, "Zomato");

  const quick = await call(d, "POST", "entries/quick", { token, body: { payee: "Salary", amount: "+92,000", clientKey: key() } });
  assert.equal(quick.json.data.amount, 9_200_000);

  assert.equal((await call(d, "GET", "entries/abc", { token })).json.fieldErrors.id, "Line is invalid");
});

test("api: nobody can read or change another person's book", async () => {
  const { ctx, token, d } = await signedIn();
  const made = await call(d, "POST", "entries", {
    token, body: { payee: "Rent", amount: "20000", direction: "out", occurredAt: "2026-09-01T09:00", channel: "Bank", clientKey: key() },
  });
  const other = await secondUser(ctx);
  const { token: theirs } = await createSession(ctx.db, other.userId, "test");
  const lineId = made.json.data.id;
  assert.equal((await call(d, "GET", `entries/${lineId}`, { token: theirs })).status, 404);
  assert.equal((await call(d, "DELETE", `entries/${lineId}`, { token: theirs })).status, 404);
  assert.equal((await call(d, "GET", `entries/${lineId}`, { token })).status, 200);
});

test("api: the wire — file, undo, archive, restore, delete", async () => {
  const { ctx, token, d } = await signedIn();
  const [a, b] = [await insertMail(ctx, HDFC), await insertMail(ctx, HDFC.replace("626412345672", "626400000001"))];

  const wire = await call(d, "GET", "wire", { token });
  assert.equal(wire.json.data.waiting.length, 2);
  assert.equal(wire.json.data.waiting[0].parsed.payee, "VINOD SI");

  const filed = await call(d, "POST", `wire/${a}/file`, { token, body: { tagId: await tagId(ctx, "Food & delivery") } });
  assert.equal(filed.status, 201);
  assert.equal(filed.json.message, "Filed VINOD SI.");
  assert.equal((await call(d, "POST", `wire/${a}/file`, { token, body: {} })).status, 409);
  assert.equal((await call(d, "POST", `wire/${a}/unfile`, { token })).status, 200);

  const edit = await call(d, "POST", `wire/${a}/file`, { token, body: { payee: "", amount: "10" } });
  assert.equal(edit.json.fieldErrors.payee, "Who was it?");

  assert.equal((await call(d, "POST", `wire/${b}/archive`, { token })).json.message, "Archived.");
  assert.equal((await call(d, "POST", `wire/${b}/restore`, { token })).status, 200);
  assert.equal((await call(d, "DELETE", `wire/${b}`, { token })).json.message, "Mail deleted.");
  assert.equal((await call(d, "DELETE", `wire/${b}`, { token })).status, 409);

  const synced = await call(d, "POST", "wire/sync", { token, body: { force: true } });
  assert.deepEqual(synced.json.data, { state: "done", added: 0, autoFiled: 0, more: false });
});

test("api: budgets save all or nothing, and name the bad field", async () => {
  const { ctx, token, d } = await signedIn();
  const food = await tagId(ctx, "Food & delivery");
  const bad = await call(d, "PUT", "budgets", { token, body: { monthly: "70,000", tags: { [food]: "a lot" } } });
  assert.equal(bad.status, 422);
  assert.deepEqual(bad.json.fieldErrors, { [`tag-${food}`]: "Enter an amount like 5,000" });
  assert.equal((await call(d, "GET", "budgets", { token })).json.data.monthly, null); // nothing was saved

  assert.equal((await call(d, "PUT", "budgets", { token, body: { monthly: "70,000", tags: { [food]: "8,000" } } })).status, 200);
  const after = await call(d, "GET", "budgets", { token });
  assert.equal(after.json.data.monthly, 7_000_000);
  assert.equal(after.json.data.tags.find((t: { id: number }) => t.id === food).budget, 800_000);
});

test("api: slate — open with a first line, remind, archive rules", async () => {
  const { token, d } = await signedIn();
  const opened = await call(d, "POST", "slate", {
    token, body: { name: "Priya Nair", amount: "2,500", direction: "gave", occurredAt: "2026-09-20T10:00", clientKey: key() },
  });
  assert.equal(opened.status, 201);
  const personId = opened.json.data.account.id;
  assert.equal(opened.json.data.account.balance, 250_000);

  const reminder = await call(d, "POST", `slate/${personId}/remind`, { token });
  assert.match(reminder.json.data.text, /Hi Priya, a gentle reminder about the ₹2,500/);
  assert.equal((await call(d, "POST", `slate/${personId}/archive`, { token, body: { archived: true } })).status, 422); // still owes
  assert.deepEqual((await call(d, "POST", `slate/${personId}/archive`, { token, body: { archived: "yes" } })).json.fieldErrors, { archived: "Choose archive or restore" });

  const repaid = await call(d, "POST", `slate/${personId}/lines`, { token, body: { amount: "2,500", direction: "got", occurredAt: "2026-09-22T10:00", note: "Repaid", clientKey: key() } });
  assert.equal(repaid.json.data.account.balance, 0);
  assert.equal((await call(d, "POST", `slate/${personId}/remind`, { token })).status, 422);
  assert.equal((await call(d, "POST", `slate/${personId}/archive`, { token, body: { archived: true } })).status, 200);

  const slate = await call(d, "GET", "slate", { token });
  assert.equal(slate.json.data.accounts[0].archived, true);
});

test("api: settings, senders, export and closing the account", async () => {
  const { ctx, token, d } = await signedIn();
  const saved = await call(d, "PUT", "settings", { token, body: { monthlyBudget: "", timezone: "Asia/Kolkata", autoFile: false } });
  assert.equal(saved.json.data.autoFile, false);
  assert.equal((await call(d, "PUT", "settings", { token, body: { timezone: "Mars/Olympus", autoFile: true } })).status, 422);

  const senders = await call(d, "PUT", "settings/senders", { token, body: { scope: "only", senders: ["NoReplyUBI-txn@ubi.bank.in"] } });
  assert.deepEqual(senders.json.data, { senders: ["noreplyubi-txn@ubi.bank.in"], widened: true });

  await call(d, "POST", "entries", { token, body: { payee: "=cmd()", amount: "10", direction: "out", occurredAt: "2026-09-02T10:00", channel: "Cash", clientKey: key() } });
  const csv = await call(d, "GET", "export?month=2026-09", { token });
  assert.equal(csv.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.match(csv.text, /'=cmd\(\)/); // formula-injection guard
  assert.equal((await call(d, "GET", "export?month=Sept", { token })).status, 422);

  assert.equal((await call(d, "DELETE", "account", { token, body: { confirm: "wrong@example.com" } })).json.fieldErrors.confirm, "This doesn't match your email");
  assert.equal((await call(d, "DELETE", "account", { token, body: { confirm: "SUB-1@example.com" } })).status, 200);
  assert.equal((await call(d, "GET", "me", { token })).status, 401);
  const { rows } = await ctx.db.query("SELECT COUNT(*)::int AS n FROM users", []);
  assert.equal(rows[0].n, 0);
});
