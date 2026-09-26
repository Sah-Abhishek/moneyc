import { randomUUID } from "node:crypto";
import { z } from "zod";
import { wallClock, YM, ymOf } from "../../lib/dates.ts";
import { LEDGER_FILTERS, lineTitle, type LedgerFilter } from "../../lib/types.ts";
import { exchangeServerAuthCode, GoogleAuthError, hasGmailScope, revokeGrant, saveGrant, type TokenSet } from "../auth/google.ts";
import { createSession, destroySession, readSession } from "../auth/sessions.ts";
import type { Db } from "../db/index.ts";
import type { Config, ConfigResult } from "../env.ts";
import { BANK_DOMAINS } from "../gmail/banks.ts";
import { readSyncState, type SyncOutcome } from "../gmail/sync.ts";
import { log } from "../log.ts";
import { ConflictError, NotFoundError, UserError, type Ctx } from "../services/context.ts";
import { addEntry, addQuickEntry, deleteEntry, getEntry, hasAnyEntries, listEntries, restoreEntry, updateEntry } from "../services/entries.ts";
import { monthCsv } from "../services/export.ts";
import { createRule, deleteRule, listRules, moveRule, updateRule } from "../services/rules.ts";
import {
  addSlateLine, deletePerson, deleteSlateLine, getAccount, linkEntryToPerson, listAccounts, openAccount, remind, setArchived, setPromise, settleUp, slateStats, unlinkEntry, updatePerson,
} from "../services/slate.ts";
import { bookTotals, groupReports, merchants, monthlySpend, monthSummary, type Range } from "../services/summary.ts";
import { createGroup, deleteGroup, getGroup, listGroups, updateGroup } from "../services/tagGroups.ts";
import { createTag, deleteTag, listTags, mergeTags, saveBudgets, tagUsage, updateTag } from "../services/tags.ts";
import { closeAccount, getUser, setAutoFile, setMailSenders, updateSettings, upsertGoogleUser, type User } from "../services/users.ts";
import { deleteMail, fileMail, ignoreMail, listSlips, markDuplicate, restoreFromDuplicate, restoreMail, unfileMail, waitingCount, wireStats } from "../services/wire.ts";
import {
  amountField, cashChoice, entryInput, idField, itemField, mailSendersInput, parseBudgets, parseInput, payeeField, personInput, promiseInput, quickEntryInput, ruleInput, settingsInput, settleInput, slateLineInput, tagGroupInput, tagInput,
} from "../validation.ts";

// JSON API for the Android app: /api/v1/…
//
// Framework-free — the Next.js route passes in its dependencies — so tests run
// it against an in-process database. Every endpoint calls the same services and
// validation as the website, so the two can't drift apart.
//
// Conventions (see docs/api-v1.md)
//  - Auth: `Authorization: Bearer <token>` from POST /auth/google. Tokens are
//    the website's sessions (hashed at rest, 30 days, sliding).
//  - Bodies are JSON objects. Amounts are strings as the person typed them
//    ("1,899.50"); amounts in responses are integer paise. Times are the
//    user's wall clock, "YYYY-MM-DDTHH:MM:SS".
//  - Success: { ok: true, data?, message? }. Failure: { ok: false, code, error,
//    fieldErrors? } with 400/401/404/405/409/413/415/422/500/503.

export type Connection = "connected" | "reconnect" | "no_gmail_scope" | "not_configured";

export interface ApiDeps {
  db: Db;
  config: () => ConfigResult;
  connection: (userId: number) => Promise<Connection>;
  sync: (user: User, force: boolean) => Promise<SyncOutcome>;
  /** redeems the app's Google server auth code; injectable for tests */
  exchangeCode?: (cfg: Config, code: string) => Promise<TokenSet>;
}

interface Call {
  deps: ApiDeps;
  req: Request;
  params: Record<string, string>;
  query: URLSearchParams;
  body: Record<string, unknown>;
  /** set on every route except the public ones */
  user: User;
  ctx: Ctx;
  token: string;
}

type Out = { data?: unknown; message?: string; status?: number } | Response;
type Handler = (c: Call) => Promise<Out>;
interface Route { method: string; parts: string[]; auth: boolean; handler: Handler }

const MAX_BODY_BYTES = 64 * 1024;
const RANGES: Range[] = ["6m", "1y", "all"];

// ─── responses ──────────────────────────────────────────────────────────────

const json = (status: number, body: unknown) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (status: number, code: string, error: string, fieldErrors?: Record<string, string>) =>
  json(status, { ok: false, code, error, ...(fieldErrors && Object.keys(fieldErrors).length ? { fieldErrors } : {}) });

// ─── small helpers ──────────────────────────────────────────────────────────

/** Parses one value; its error is reported under `name` so the app can mark that field. */
function field<S extends z.ZodType>(name: string, schema: S, value: unknown): z.infer<S> {
  try {
    return parseInput(schema, value);
  } catch (e) {
    if (e instanceof UserError && e.fieldErrors?._) e.fieldErrors = { [name]: e.fieldErrors._ };
    throw e;
  }
}

const id = (c: Call, label: string, key = "id") => field(key, idField(label), c.params[key]);
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** A month the book can show: the one asked for, else this month (never a future one). */
function month(c: Call, key = "m"): string {
  const current = ymOf(wallClock(c.ctx.tz));
  const m = c.query.get(key);
  return m && YM.test(m) && m <= current ? m : current;
}

const tagUsageObject = (usage: Map<number, { entries: number; rules: number }>) => Object.fromEntries(usage);

// ─── routes ─────────────────────────────────────────────────────────────────

const routes: Route[] = [];
const on = (method: string, path: string, handler: Handler, auth = true) => routes.push({ method, parts: path.split("/"), auth, handler });

// Sign-in. The app gets a one-time server auth code from Google (scopes:
// openid email profile gmail.readonly, offline access for this web client).
on("POST", "auth/google", async (c) => {
  const cfg = c.deps.config();
  if (!cfg.ok) return fail(503, "not_configured", "Sign-in isn't set up on this server yet.");
  const code = field("code", z.string({ error: "Missing sign-in code" }).min(10, "Missing sign-in code").max(2048), c.body.code);
  let tokens: TokenSet;
  try {
    tokens = await (c.deps.exchangeCode ?? exchangeServerAuthCode)(cfg.config, code);
  } catch (e) {
    log.warn("api.auth_exchange_failed", { error: e, code: e instanceof GoogleAuthError ? e.code : undefined });
    if (e instanceof GoogleAuthError && e.code === "network") return fail(503, "google_unreachable", "We couldn't reach Google just now. Check your connection and try again.");
    return fail(401, "google_refused", "Google didn't complete the sign-in. Try again.");
  }
  const who = tokens.identity!;
  if (!who.emailVerified) return fail(403, "unverified", "Google says that email address isn't verified yet. Verify it with Google, then try again.");
  const { user, created } = await upsertGoogleUser(c.deps.db, { sub: who.sub, email: who.email, name: who.name });
  await saveGrant(c.deps.db, cfg.config, user.id, tokens);
  const session = await createSession(c.deps.db, user.id, c.req.headers.get("user-agent"));
  log.info("auth.signed_in", { userId: user.id, created, gmail: hasGmailScope(tokens.scope), via: "api" });
  return { data: { token: session.token, expiresAt: session.expiresAt.toISOString(), created, gmail: hasGmailScope(tokens.scope), user } };
}, false);

on("POST", "auth/signout", async (c) => {
  await destroySession(c.deps.db, c.token);
  return { message: "Signed out." };
});

// Everything the app shell needs on launch: who, the Gmail state, badge counts.
on("GET", "me", async (c) => {
  const [connection, sync, waiting, book, hasEntries] = await Promise.all([
    c.deps.connection(c.user.id), readSyncState(c.deps.db, c.user.id), waitingCount(c.ctx), bookTotals(c.ctx), hasAnyEntries(c.ctx),
  ]);
  return { data: { user: c.user, connection, sync, waiting, book, hasEntries, today: wallClock(c.ctx.tz), bankCount: new Set(BANK_DOMAINS.map((b) => b.name)).size } };
});

// ─── ledger ─────────────────────────────────────────────────────────────────

on("GET", "summary", async (c) => ({ data: await monthSummary(c.ctx, month(c), c.user.monthlyBudget) }));

on("GET", "entries", async (c) => {
  const filter: LedgerFilter = LEDGER_FILTERS.find((f) => f === c.query.get("filter")) ?? "all";
  const q = c.query.get("q")?.trim().slice(0, 100) || undefined;
  const tag = c.query.get("tag") ? field("tag", idField("Tag"), c.query.get("tag")) : null;
  const group = c.query.get("group") ? field("group", idField("Group"), c.query.get("group")) : null;
  if (group != null) await getGroup(c.ctx, group);
  const page = Math.max(1, Math.min(10_000, Number.parseInt(c.query.get("page") ?? "1", 10) || 1));
  const ym = month(c);
  return { data: { ym, filter, q: q ?? null, tagId: tag, groupId: group, ...(await listEntries(c.ctx, { ym, filter, q, tagId: tag, groupId: group, page })) } };
});

on("GET", "entries/:id", async (c) => ({ data: await getEntry(c.ctx, id(c, "Line")) }));

const entryFields = (b: Record<string, unknown>) =>
  ({ ...Object.fromEntries(["payee", "direction", "occurredAt", "channel", "tagId", "item", "note", "chequeNo", "cash"].map((k) => [k, b[k] ?? undefined])), amount: str(b.amount) });

on("POST", "entries", async (c) => {
  const input = parseInput(entryInput, entryFields(c.body));
  const key = field("clientKey", z.string({ error: "Missing clientKey" }).min(8).max(64), c.body.clientKey);
  const { entry, duplicate } = await addEntry(c.ctx, input, key);
  return { status: duplicate ? 200 : 201, data: entry, message: duplicate ? "That line was already added." : `Added ${lineTitle(entry)}.` };
});

// The one-line form: "+2500" is money in.
on("POST", "entries/quick", async (c) => {
  const input = parseInput(quickEntryInput, {
    payee: c.body.payee, item: c.body.item, amount: str(c.body.amount), tagId: c.body.tagId ?? "", channel: c.body.channel, clientKey: c.body.clientKey,
  });
  const { entry, duplicate } = await addQuickEntry(c.ctx, input);
  return { status: duplicate ? 200 : 201, data: entry, message: duplicate ? "That line was already added." : `Added ${lineTitle(entry)}.` };
});

on("PUT", "entries/:id", async (c) => {
  const version = field("version", z.coerce.number({ error: "Missing version" }).int().positive("Missing version"), c.body.version);
  const entry = await updateEntry(c.ctx, id(c, "Line"), parseInput(entryInput, entryFields(c.body)), version);
  return { data: entry, message: "Saved." };
});

on("DELETE", "entries/:id", async (c) => {
  await deleteEntry(c.ctx, id(c, "Line"));
  return { message: "Line deleted." };
});

on("POST", "entries/:id/restore", async (c) => ({ data: await restoreEntry(c.ctx, id(c, "Line")), message: "Line restored." }));

on("PUT", "entries/:id/slate", async (c) => {
  const entryId = id(c, "Line");
  const personId = field("personId", idField("Person"), c.body.personId);
  const { account } = await getAccount(c.ctx, personId);
  await linkEntryToPerson(c.ctx, entryId, personId, "Moved from the ledger");
  return { data: await getEntry(c.ctx, entryId), message: `Put on ${account.name}'s slate.` };
});

on("DELETE", "entries/:id/slate", async (c) => {
  await unlinkEntry(c.ctx, id(c, "Line"));
  return { message: "Taken off the slate. It's an ordinary line again." };
});

on("GET", "export", async (c) => {
  const { filename, csv, rows } = await monthCsv(c.ctx, c.query.get("month") ?? "");
  log.info("export.month", { userId: c.user.id, month: c.query.get("month"), rows, via: "api" });
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" },
  });
});

// ─── the wire ───────────────────────────────────────────────────────────────

on("GET", "wire", async (c) => {
  const [waiting, decided, stats, connection, sync] = await Promise.all([
    listSlips(c.ctx, "waiting"), listSlips(c.ctx, "decided", 30), wireStats(c.ctx), c.deps.connection(c.user.id), readSyncState(c.deps.db, c.user.id),
  ]);
  return { data: { waiting, decided, stats, connection, sync, autoFile: c.user.autoFile } };
});

/** "Read mail now" (force) or a background check. Rate-limited in the sync itself. */
on("POST", "wire/sync", async (c) => {
  const r = await c.deps.sync(c.user, c.body.force === true);
  if (r.status !== "done") return { data: { state: r.status, added: 0, autoFiled: 0, more: false } };
  return { data: { state: "done", added: r.added, autoFiled: r.autoFiled, more: r.more } };
});

on("POST", "wire/:id/file", async (c) => {
  const editing = c.body.payee !== undefined || c.body.amount !== undefined;
  const personId = c.body.personId == null || c.body.personId === "" ? null : field("personId", idField("Person"), c.body.personId);
  const entry = await fileMail(c.ctx, id(c, "Mail"), {
    payee: editing ? field("payee", payeeField, str(c.body.payee)) ?? "" : undefined,
    amount: editing ? field("amount", amountField, str(c.body.amount)) : null,
    item: field("item", itemField, c.body.item),
    tagId: c.body.tagId == null || c.body.tagId === "" ? null : field("tagId", idField("Tag"), c.body.tagId),
    personId,
    cash: c.body.cash == null || c.body.cash === "" ? null : field("cash", cashChoice, c.body.cash),
  });
  return { status: 201, data: entry, message: personId ? `Put ${lineTitle(entry)} on the slate.` : `Filed ${lineTitle(entry)}.` };
});

on("POST", "wire/:id/unfile", async (c) => {
  await unfileMail(c.ctx, id(c, "Mail"));
  return { message: "Back on the desk." };
});

on("POST", "wire/:id/archive", async (c) => {
  await ignoreMail(c.ctx, id(c, "Mail"));
  return { message: "Archived." };
});

on("POST", "wire/:id/restore", async (c) => {
  await restoreMail(c.ctx, id(c, "Mail"));
  return { message: "Back on the desk." };
});

on("POST", "wire/:id/duplicate", async (c) => {
  await markDuplicate(c.ctx, id(c, "Mail"), field("entryId", idField("Line"), c.body.entryId));
  return { message: "Matched to the line you already had." };
});

on("POST", "wire/:id/unduplicate", async (c) => {
  await restoreFromDuplicate(c.ctx, id(c, "Mail"));
  return { message: "Back on the desk." };
});

on("DELETE", "wire/:id", async (c) => {
  await deleteMail(c.ctx, id(c, "Mail"));
  return { message: "Mail deleted." };
});

// ─── tags & budgets ─────────────────────────────────────────────────────────

const tagFields = (b: Record<string, unknown>) => ({ name: b.name, color: b.color, kind: b.kind ?? "spend", budget: str(b.budget) });

on("GET", "tags", async (c) => {
  const [tags, usage] = await Promise.all([listTags(c.ctx), tagUsage(c.ctx)]);
  return { data: { tags, usage: tagUsageObject(usage) } };
});

on("POST", "tags", async (c) => {
  const tag = await createTag(c.ctx, parseInput(tagInput, tagFields(c.body)));
  return { status: 201, data: tag, message: `Added the ${tag.name} stamp.` };
});

on("PUT", "tags/:id", async (c) => {
  const tag = await updateTag(c.ctx, id(c, "Tag"), parseInput(tagInput, tagFields(c.body)));
  return { data: tag, message: `Saved ${tag.name}.` };
});

on("DELETE", "tags/:id", async (c) => {
  const r = await deleteTag(c.ctx, id(c, "Tag"));
  return {
    data: r,
    message: `Tag deleted. ${r.untagged} line${r.untagged === 1 ? " is" : "s are"} now untagged${r.rulesRemoved ? `, ${r.rulesRemoved} rule${r.rulesRemoved === 1 ? "" : "s"} removed` : ""}.`,
  };
});

on("POST", "tags/:id/merge", async (c) => {
  const r = await mergeTags(c.ctx, id(c, "Tag"), field("into", idField("Tag to merge into"), c.body.into));
  return { data: r, message: `Merged. ${r.moved} line${r.moved === 1 ? "" : "s"} moved.` };
});

// Tag groups: named sets of spending tags ("Health": Healthy, Junk, Leisure).
const groupFields = (b: Record<string, unknown>) => ({ name: b.name, tagIds: b.tagIds });

on("GET", "tag-groups", async (c) => {
  const [groups, tags] = await Promise.all([listGroups(c.ctx), listTags(c.ctx)]);
  return { data: { groups, tags } };
});

on("POST", "tag-groups", async (c) => {
  const group = await createGroup(c.ctx, parseInput(tagGroupInput, groupFields(c.body)));
  return { status: 201, data: group, message: `Added the ${group.name} group.` };
});

on("PUT", "tag-groups/:id", async (c) => {
  const group = await updateGroup(c.ctx, id(c, "Group"), parseInput(tagGroupInput, groupFields(c.body)));
  return { data: group, message: `Saved ${group.name}.` };
});

on("DELETE", "tag-groups/:id", async (c) => {
  await deleteGroup(c.ctx, id(c, "Group"));
  return { message: "Group deleted. Its tags and lines are unchanged." };
});

on("GET", "budgets", async (c) => {
  const [summary, tags] = await Promise.all([monthSummary(c.ctx, month(c), c.user.monthlyBudget), listTags(c.ctx)]);
  return { data: { summary, tags, monthly: c.user.monthlyBudget } };
});

/** { monthly: "70,000" | "", tags: { "<tagId>": "5,000" | "" } } — every tag sent is saved, blank clears it. */
on("PUT", "budgets", async (c) => {
  const tags = c.body.tags && typeof c.body.tags === "object" && !Array.isArray(c.body.tags) ? Object.entries(c.body.tags) : [];
  const { monthly, perTag } = parseBudgets(c.body.monthly ?? "", tags);
  await saveBudgets(c.ctx, monthly, perTag);
  return { message: "Budgets saved." };
});

// ─── standing rules ─────────────────────────────────────────────────────────

const ruleFields = (b: Record<string, unknown>) => ({ field: b.field, value: b.value, action: b.action, tagId: b.tagId ?? "" });

on("GET", "rules", async (c) => {
  const [rules, tags] = await Promise.all([listRules(c.ctx), listTags(c.ctx)]);
  return { data: { rules, tags } };
});

on("POST", "rules", async (c) => {
  const ruleId = await createRule(c.ctx, parseInput(ruleInput, ruleFields(c.body)));
  return { status: 201, data: { id: ruleId }, message: "Rule added. It applies to new mail from now on." };
});

on("PUT", "rules/:id", async (c) => {
  await updateRule(c.ctx, id(c, "Rule"), parseInput(ruleInput, ruleFields(c.body)));
  return { message: "Rule saved." };
});

on("DELETE", "rules/:id", async (c) => {
  await deleteRule(c.ctx, id(c, "Rule"));
  return { message: "Rule removed." };
});

on("POST", "rules/:id/move", async (c) => {
  const direction = field("direction", z.enum(["up", "down"], { error: "Choose up or down" }), c.body.direction);
  await moveRule(c.ctx, id(c, "Rule"), direction);
  return { data: await listRules(c.ctx) };
});

// ─── the slate ──────────────────────────────────────────────────────────────

const personFields = (b: Record<string, unknown>) => ({ name: b.name, matchNames: str(b.matchNames), phone: str(b.phone), note: str(b.note) });

on("GET", "slate", async (c) => {
  const [accounts, waiting] = await Promise.all([listAccounts(c.ctx, { includeArchived: true }), listSlips(c.ctx, "waiting")]);
  const stats = await slateStats(c.ctx, accounts.filter((a) => !a.archived));
  return { data: { accounts, stats, fromWire: waiting.filter((w) => w.person) } };
});

on("GET", "slate/:id", async (c) => ({ data: await getAccount(c.ctx, id(c, "Person")) }));

/** Opens an account; with `amount` it opens with its first line (both or neither). */
on("POST", "slate", async (c) => {
  const input = parseInput(personInput, personFields(c.body));
  const amount = str(c.body.amount).trim();
  const first = amount
    ? parseInput(slateLineInput.omit({ personId: true }), {
        amount, direction: c.body.direction, occurredAt: c.body.occurredAt,
        note: str(c.body.lineNote) || (c.body.direction === "got" ? "Borrowed" : "Lent"), clientKey: c.body.clientKey,
      })
    : null;
  const personId = await openAccount(c.ctx, input, first);
  return { status: 201, data: await getAccount(c.ctx, personId), message: `Opened an account for ${input.name}.` };
});

on("PUT", "slate/:id", async (c) => {
  const personId = id(c, "Person");
  await updatePerson(c.ctx, personId, parseInput(personInput, personFields(c.body)));
  return { data: await getAccount(c.ctx, personId), message: "Saved." };
});

on("DELETE", "slate/:id", async (c) => {
  await deletePerson(c.ctx, id(c, "Person"));
  return { message: "Account removed." };
});

on("POST", "slate/:id/archive", async (c) => {
  const archived = field("archived", z.boolean({ error: "Choose archive or restore" }), c.body.archived);
  await setArchived(c.ctx, id(c, "Person"), archived);
  return { message: archived ? "Account archived." : "Account restored." };
});

on("POST", "slate/:id/lines", async (c) => {
  const personId = id(c, "Person");
  const r = await addSlateLine(c.ctx, parseInput(slateLineInput, {
    personId, amount: str(c.body.amount), direction: c.body.direction, occurredAt: c.body.occurredAt, note: c.body.note, clientKey: c.body.clientKey,
  }));
  return { status: r.duplicate ? 200 : 201, data: await getAccount(c.ctx, personId), message: r.duplicate ? "That line was already recorded." : "Recorded on the slate." };
});

/** Settle up in full, or in part with the rest (maybe) promised by a day. */
on("POST", "slate/:id/settle", async (c) => {
  const personId = id(c, "Person");
  const r = await settleUp(c.ctx, parseInput(settleInput, {
    personId, amount: str(c.body.amount), promisedBy: c.body.promisedBy, occurredAt: c.body.occurredAt, clientKey: c.body.clientKey,
  }));
  return { status: r.duplicate ? 200 : 201, data: await getAccount(c.ctx, personId), message: r.duplicate ? "That was already recorded." : r.rest ? "Recorded. The rest stays on the slate." : "Settled up." };
});

/** Sets or (null) clears the day the balance was promised back by. */
on("PUT", "slate/:id/promise", async (c) => {
  const personId = id(c, "Person");
  await setPromise(c.ctx, personId, parseInput(promiseInput, { promisedBy: c.body.promisedBy }).promisedBy);
  return { data: await getAccount(c.ctx, personId), message: c.body.promisedBy ? "Promise saved." : "Promise removed. The balance stays." };
});

on("DELETE", "slate/lines/:id", async (c) => {
  await deleteSlateLine(c.ctx, id(c, "Line"));
  return { message: "Removed from the slate." };
});

/** The reminder text to share (the app opens WhatsApp / the share sheet). */
on("POST", "slate/:id/remind", async (c) => ({ data: await remind(c.ctx, id(c, "Person")) }));

// ─── reports ────────────────────────────────────────────────────────────────

on("GET", "reports", async (c) => {
  const ym = month(c);
  const range = RANGES.find((r) => r === c.query.get("range")) ?? "6m";
  const [summary, months, merchantList, groups] = await Promise.all([
    monthSummary(c.ctx, ym, c.user.monthlyBudget), monthlySpend(c.ctx, ym, range), merchants(c.ctx, ym), groupReports(c.ctx, ym),
  ]);
  return { data: { ym, range, summary, months, merchants: merchantList, groups } };
});

// ─── settings & account ─────────────────────────────────────────────────────

on("GET", "settings", async (c) => {
  const [connection, sync] = await Promise.all([c.deps.connection(c.user.id), readSyncState(c.deps.db, c.user.id)]);
  return { data: { user: c.user, connection, sync, bankCount: new Set(BANK_DOMAINS.map((b) => b.name)).size } };
});

on("PUT", "settings", async (c) => {
  await updateSettings(c.ctx, parseInput(settingsInput, {
    monthlyBudget: str(c.body.monthlyBudget), timezone: c.body.timezone, autoFile: c.body.autoFile,
  }));
  return { data: await getUser(c.deps.db, c.user.id), message: "Settings saved." };
});

on("PUT", "settings/auto-file", async (c) => {
  const value = field("on", z.boolean({ error: "Choose on or off" }), c.body.on);
  await setAutoFile(c.ctx, value);
  return { message: value ? "Confident mail will be filed automatically." : "Every mail will wait for you." };
});

on("PUT", "settings/senders", async (c) => {
  const senders = parseInput(mailSendersInput, { scope: c.body.scope, senders: Array.isArray(c.body.senders) ? c.body.senders.join("\n") : str(c.body.senders) });
  const { widened } = await setMailSenders(c.ctx, senders);
  const who = senders.length ? `only ${senders.length === 1 ? senders[0] : `${senders.length} senders`}` : "every bank we know";
  return { data: { senders, widened }, message: widened ? `Reading ${who}. The next read looks back to the day you joined.` : `Reading ${who}.` };
});

on("POST", "gmail/disconnect", async (c) => {
  const cfg = c.deps.config();
  if (!cfg.ok) throw new UserError("Mail sync isn't set up on this server.");
  await revokeGrant(c.deps.db, cfg.config, c.user.id);
  log.info("gmail.disconnected", { userId: c.user.id, via: "api" });
  return { message: "Gmail disconnected. Nothing new will be read until you reconnect." };
});

/** { confirm: "<the account's email>" } */
on("DELETE", "account", async (c) => {
  const cfg = c.deps.config();
  await closeAccount(c.ctx, cfg.ok ? cfg.config : null, str(c.body.confirm));
  log.info("account.deleted", { userId: c.user.id, via: "api" });
  return { message: "Your account and everything in it has been deleted." };
});

// ─── dispatch ───────────────────────────────────────────────────────────────

function match(path: string[]): { route: Route; params: Record<string, string> }[] {
  const hits: { route: Route; params: Record<string, string> }[] = [];
  for (const route of routes) {
    if (route.parts.length !== path.length) continue;
    const params: Record<string, string> = {};
    // Literal segments win over :params ("slate/lines/7" is not "slate/:id/…").
    if (route.parts.every((p, i) => (p.startsWith(":") ? ((params[p.slice(1)] = path[i]), true) : p === path[i]))) hits.push({ route, params });
  }
  return hits.sort((a, b) => b.route.parts.filter((p) => !p.startsWith(":")).length - a.route.parts.filter((p) => !p.startsWith(":")).length);
}

async function readBody(req: Request): Promise<Record<string, unknown> | Response> {
  if (req.method === "GET" || req.method === "HEAD") return {};
  const text = await req.text();
  if (!text.trim()) return {};
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return fail(413, "too_large", "That request is too large.");
  if (!(req.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) return fail(415, "unsupported_media_type", "Send JSON (Content-Type: application/json).");
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // fall through
  }
  return fail(400, "bad_request", "The request body isn't a JSON object.");
}

const bearer = (req: Request) => req.headers.get("authorization")?.match(/^Bearer\s+(\S{1,100})$/i)?.[1];

/** Handles one API request. `path` is the part after /api/v1/, split on "/". */
export async function handleApi(req: Request, path: string[], deps: ApiDeps): Promise<Response> {
  const hits = match(path.filter(Boolean));
  if (!hits.length) return fail(404, "no_route", "There's nothing at that address.");
  const hit = hits.find((h) => h.route.method === req.method);
  if (!hit) {
    const allow = [...new Set(hits.map((h) => h.route.method))].join(", ");
    return new Response(JSON.stringify({ ok: false, code: "method_not_allowed", error: "That address doesn't take this method." }), {
      status: 405, headers: { Allow: allow, "Content-Type": "application/json" },
    });
  }

  const name = `${req.method} ${hit.route.parts.join("/")}`;
  try {
    const body = await readBody(req);
    if (body instanceof Response) return body;

    const call = { deps, req, params: hit.params, query: new URL(req.url).searchParams, body } as Call;
    if (hit.route.auth) {
      const token = bearer(req);
      const session = await readSession(deps.db, token);
      const user = session && (await getUser(deps.db, session.userId));
      if (!token || !user) return fail(401, "signed_out", "Your session has ended. Sign in again.");
      Object.assign(call, { user, token, ctx: { db: deps.db, userId: user.id, tz: user.timezone } });
    }

    const out = await hit.route.handler(call);
    if (out instanceof Response) return out;
    return json(out.status ?? 200, { ok: true, ...(out.data !== undefined ? { data: out.data } : {}), ...(out.message ? { message: out.message } : {}) });
  } catch (e) {
    if (e instanceof NotFoundError) return fail(404, "not_found", e.message);
    if (e instanceof ConflictError) return fail(409, "conflict", e.message);
    if (e instanceof UserError) return fail(422, "invalid", e.message, e.fieldErrors);
    const ref = randomUUID().slice(0, 8);
    log.error("api.failed", { route: name, ref, error: e });
    return fail(500, "server", `That didn't go through because of a problem on our side (ref ${ref}). Try again in a moment.`);
  }
}
