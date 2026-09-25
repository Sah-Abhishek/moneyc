import { test } from "node:test";
import assert from "node:assert/strict";
import { freshCtx, insertMail, key, secondUser, tagId } from "../test-helpers.ts";
import { parseInput, entryInput, quickEntryInput, ruleInput } from "../validation.ts";
import { ConflictError, NotFoundError, UserError } from "./context.ts";
import { addEntry, addQuickEntry, deleteEntry, findLikelyDuplicate, getEntry, listEntries, restoreEntry, updateEntry } from "./entries.ts";
import { createRule, deleteRule, listRules, moveRule } from "./rules.ts";
import { addSlateLine, createPerson, getAccount, listAccounts, matchPerson, slateStats, deletePerson } from "./slate.ts";
import { monthSummary, monthlySpend, merchants } from "./summary.ts";
import { createTag, deleteTag, listTags, mergeTags } from "./tags.ts";
import { deleteMail, fileMail, ignoreMail, listSlips, markDuplicate, restoreMail, tryAutoFile, waitingCount, wireStats } from "./wire.ts";

const line = (over: Partial<Record<string, string>> = {}) =>
  parseInput(entryInput, { payee: "Swiggy", amount: "486", direction: "out", occurredAt: "2026-09-20T21:15", channel: "UPI", tagId: "", note: "", ...over });

// ─── entries ─────────────────────────────────────────────────────────────

test("adding a line is idempotent on the client key", async () => {
  const ctx = await freshCtx();
  const k = key();
  const a = await addEntry(ctx, line(), k);
  const b = await addEntry(ctx, line(), k);
  assert.equal(a.duplicate, false);
  assert.equal(b.duplicate, true);
  assert.equal(a.entry.id, b.entry.id);
  assert.equal((await listEntries(ctx, { ym: "2026-09", filter: "all", page: 1 })).total, 1);
});

test("quick entry: '+' means money in, amount is stored in paise", async () => {
  const ctx = await freshCtx();
  const input = parseInput(quickEntryInput, { payee: "Refund", amount: "+1,250.50", tagId: "", clientKey: key() });
  const { entry } = await addQuickEntry(ctx, input);
  assert.equal(entry.amount, 125050);
  assert.equal(entry.channel, "Cash");
});

test("running balance spans the whole book and ignores deleted lines", async () => {
  const ctx = await freshCtx();
  await addEntry(ctx, line({ occurredAt: "2026-08-31T10:00", amount: "1000", direction: "in" }), key());
  const b = await addEntry(ctx, line({ occurredAt: "2026-09-01T10:00", amount: "100" }), key());
  const c = await addEntry(ctx, line({ occurredAt: "2026-09-02T10:00", amount: "50" }), key());
  let sep = (await listEntries(ctx, { ym: "2026-09", filter: "all", page: 1 })).entries;
  assert.deepEqual(sep.map((e) => e.balance), [85000, 90000]);
  await deleteEntry(ctx, b.entry.id);
  sep = (await listEntries(ctx, { ym: "2026-09", filter: "all", page: 1 })).entries;
  assert.deepEqual(sep.map((e) => e.id), [c.entry.id]);
  assert.equal(sep[0].balance, 95000);
  await restoreEntry(ctx, b.entry.id);
  assert.equal((await listEntries(ctx, { ym: "2026-09", filter: "all", page: 1 })).total, 2);
});

test("search treats % and _ literally", async () => {
  const ctx = await freshCtx();
  await addEntry(ctx, line({ payee: "100% Juice" }), key());
  await addEntry(ctx, line({ payee: "Other" }), key());
  assert.equal((await listEntries(ctx, { ym: "2026-09", filter: "all", q: "%", page: 1 })).total, 1);
  assert.equal((await listEntries(ctx, { ym: "2026-09", filter: "all", q: "_", page: 1 })).total, 0);
});

test("editing refuses a stale version instead of overwriting", async () => {
  const ctx = await freshCtx();
  const { entry } = await addEntry(ctx, line(), key());
  const edited = await updateEntry(ctx, entry.id, line({ payee: "Swiggy Instamart" }), entry.version);
  assert.equal(edited.payee, "Swiggy Instamart");
  assert.equal(edited.version, entry.version + 1);
  await assert.rejects(updateEntry(ctx, entry.id, line({ payee: "Again" }), entry.version), ConflictError);
});

test("one user can never read or change another user's lines", async () => {
  const ctx = await freshCtx();
  const other = await secondUser(ctx);
  const { entry } = await addEntry(ctx, line(), key());
  await assert.rejects(getEntry(other, entry.id), NotFoundError);
  await assert.rejects(updateEntry(other, entry.id, line(), entry.version), NotFoundError);
  await assert.rejects(deleteEntry(other, entry.id), NotFoundError);
  assert.equal((await listEntries(other, { ym: "2026-09", filter: "all", page: 1 })).total, 0);
  // …nor stamp their own line with the first user's tag
  await assert.rejects(addEntry(other, line({ tagId: String(await tagId(ctx, "Transport")) }), key()), NotFoundError);
});

// ─── validation ──────────────────────────────────────────────────────────

test("validation rejects bad input with field messages", async () => {
  const bad = (over: Record<string, string>) => {
    try {
      line(over);
      return null;
    } catch (e) {
      assert.ok(e instanceof UserError);
      return e.fieldErrors;
    }
  };
  assert.ok(bad({ payee: "   " })?.payee);
  assert.ok(bad({ amount: "abc" })?.amount);
  assert.ok(bad({ amount: "0" })?.amount);
  assert.ok(bad({ occurredAt: "2026-02-30T10:00" })?.occurredAt);
  assert.ok(bad({ payee: "x".repeat(121) })?.payee);
  assert.equal(line({ payee: "  Chai   ☕ office " }).payee, "Chai ☕ office");
});

test("rule validation: tag rules need a tag, amount rules need an amount", async () => {
  assert.throws(() => parseInput(ruleInput, { field: "payee_prefix", value: "SWIGGY", action: "tag", tagId: "" }), UserError);
  assert.throws(() => parseInput(ruleInput, { field: "amount_over", value: "lots", action: "ask", tagId: "" }), UserError);
  assert.throws(() => parseInput(ruleInput, { field: "sender", value: "not an address", action: "file", tagId: "" }), UserError);
});

// ─── summary ─────────────────────────────────────────────────────────────

test("summary counts spending, not slate transfers or deleted lines", async () => {
  const ctx = await freshCtx();
  const food = await tagId(ctx, "Food & delivery");
  await addEntry(ctx, line({ amount: "500", tagId: String(food), occurredAt: "2026-09-03T10:00" }), key());
  await addEntry(ctx, line({ amount: "92000", direction: "in", payee: "Salary", occurredAt: "2026-09-01T10:00" }), key());
  const gone = await addEntry(ctx, line({ amount: "999", occurredAt: "2026-09-04T10:00" }), key());
  await deleteEntry(ctx, gone.entry.id);
  const loanMail = await insertMail(ctx, "Rs.2000.00 has been debited from account **4721 to VPA priya@okicici PRIYA NAIR on 05-09-26 10:00:00. UPI transaction reference number is 512233445566.");
  const priya = await createPerson(ctx, { name: "Priya Nair", matchNames: null, phone: null, note: null });
  await fileMail(ctx, loanMail, { tagId: null, personId: priya });

  const s = await monthSummary(ctx, "2026-09", null);
  assert.equal(s.spent, 50000);
  assert.equal(s.received, 9200000);
  assert.equal(s.daily[2], 50000);
  assert.equal(s.byTag[0].tag?.id, food);
  assert.equal((await getAccount(ctx, priya)).account.balance, 200000);
});

test("long view fills missing months with zero", async () => {
  const ctx = await freshCtx();
  await addEntry(ctx, line({ occurredAt: "2026-05-10T10:00", amount: "100" }), key());
  const six = await monthlySpend(ctx, "2026-09", "6m");
  assert.deepEqual(six.map((m) => m.ym), ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
  assert.equal(six[1].spent, 10000);
  assert.equal((await monthlySpend(ctx, "2026-09", "all")).length, 5);
});

test("merchants group payees case-insensitively", async () => {
  const ctx = await freshCtx();
  await addEntry(ctx, line({ payee: "Swiggy", amount: "100" }), key());
  await addEntry(ctx, line({ payee: "SWIGGY", amount: "200" }), key());
  const m = await merchants(ctx, "2026-09");
  assert.equal(m.length, 1);
  assert.equal(m[0].total, 30000);
  assert.equal(m[0].count, 2);
});

// ─── tags ────────────────────────────────────────────────────────────────

test("tags: names are unique ignoring case; merge moves lines and rules", async () => {
  const ctx = await freshCtx();
  await assert.rejects(createTag(ctx, { name: "transport", color: "teal", kind: "spend", budget: null }), UserError);
  const cabs = await createTag(ctx, { name: "Cabs", color: "teal", kind: "spend", budget: null });
  await addEntry(ctx, line({ tagId: String(cabs.id) }), key());
  await createRule(ctx, { field: "payee_prefix", value: "UBER", action: "tag", tagId: cabs.id });
  const transport = await tagId(ctx, "Transport");
  assert.deepEqual(await mergeTags(ctx, cabs.id, transport), { moved: 1 });
  assert.equal((await listEntries(ctx, { ym: "2026-09", filter: "all", page: 1 })).entries[0].tag?.id, transport);
  assert.equal((await listRules(ctx))[0].tag?.id, transport);
  assert.ok(!(await listTags(ctx)).some((t) => t.id === cabs.id));
});

test("deleting a tag untags its lines and drops its rules", async () => {
  const ctx = await freshCtx();
  const t = await tagId(ctx, "Shopping");
  await addEntry(ctx, line({ tagId: String(t) }), key());
  await createRule(ctx, { field: "payee_prefix", value: "AMAZON", action: "tag", tagId: t });
  assert.deepEqual(await deleteTag(ctx, t), { untagged: 1, rulesRemoved: 1 });
  assert.equal((await listEntries(ctx, { ym: "2026-09", filter: "untagged", page: 1 })).total, 1);
});

// ─── rules ───────────────────────────────────────────────────────────────

test("rules: duplicates refused, order can change, delete works", async () => {
  const ctx = await freshCtx();
  const a = await createRule(ctx, { field: "sender", value: "alerts@hdfcbank.net", action: "file", tagId: null });
  await assert.rejects(createRule(ctx, { field: "sender", value: "ALERTS@hdfcbank.net", action: "file", tagId: null }), UserError);
  const b = await createRule(ctx, { field: "amount_over", value: "20000", action: "ask", tagId: null });
  await moveRule(ctx, b, "up");
  assert.deepEqual((await listRules(ctx)).map((r) => r.id), [b, a]);
  await deleteRule(ctx, a);
  await assert.rejects(deleteRule(ctx, a), NotFoundError);
});

// ─── wire ────────────────────────────────────────────────────────────────

const HDFC = "Dear Customer, Rs.10.00 has been debited from account **4721 to VPA vinodsi@okaxis VINOD SI on 22-09-26 11:18:42. Your UPI transaction reference number is 626412345672.";

test("filing a mail creates one line; a second attempt is refused", async () => {
  const ctx = await freshCtx();
  const mail = await insertMail(ctx, HDFC);
  const food = await tagId(ctx, "Food & delivery");
  const entry = await fileMail(ctx, mail, { tagId: food });
  assert.equal(entry.amount, -1000);
  assert.equal(entry.occurredAt, "2026-09-22T11:18:42");
  assert.equal(entry.account, "HDFC ****4721");
  assert.equal(entry.source, "wire");
  await assert.rejects(fileMail(ctx, mail, { tagId: food }), ConflictError);
  assert.equal((await listEntries(ctx, { ym: "2026-09", filter: "all", page: 1 })).total, 1);
  assert.equal(await waitingCount(ctx), 0);
});

test("edited payee/amount win over what was parsed", async () => {
  const ctx = await freshCtx();
  const mail = await insertMail(ctx, HDFC);
  const e = await fileMail(ctx, mail, { tagId: null, payee: "Vinod (chai)", amount: 1500 });
  assert.equal(e.payee, "Vinod (chai)");
  assert.equal(e.amount, -1500);
});

test("archive and restore move a mail off and back onto the desk", async () => {
  const ctx = await freshCtx();
  const mail = await insertMail(ctx, HDFC);
  await ignoreMail(ctx, mail);
  assert.equal(await waitingCount(ctx), 0);
  await assert.rejects(ignoreMail(ctx, mail), ConflictError);
  assert.deepEqual((await listSlips(ctx, "decided")).map((d) => d.status), ["ignored"]);
  await restoreMail(ctx, mail);
  assert.equal(await waitingCount(ctx), 1);
  assert.equal((await listSlips(ctx, "decided")).length, 0);
});

test("delete wipes a mail from the desk or the archive, and filed mail can't be deleted", async () => {
  const ctx = await freshCtx();
  const onDesk = await insertMail(ctx, HDFC, { gmailId: "g1" });
  const archived = await insertMail(ctx, HDFC, { gmailId: "g2" });
  const filed = await insertMail(ctx, HDFC, { gmailId: "g3" });
  await ignoreMail(ctx, archived);
  await fileMail(ctx, filed, { tagId: null });

  await deleteMail(ctx, onDesk);
  await deleteMail(ctx, archived);
  const { rows } = await ctx.db.query("SELECT gmail_id, status, subject, body FROM wire_mails WHERE status = 'deleted' ORDER BY gmail_id", []);
  assert.deepEqual(rows, [
    { gmail_id: "g1", status: "deleted", subject: null, body: "" },
    { gmail_id: "g2", status: "deleted", subject: null, body: "" },
  ]);
  assert.equal(await waitingCount(ctx), 0);
  assert.deepEqual((await listSlips(ctx, "decided")).map((d) => d.status), ["filed"]);
  assert.equal((await wireStats(ctx)).banksSeen, 1); // the filed one still counts

  await assert.rejects(deleteMail(ctx, onDesk), /already deleted/);
  await assert.rejects(deleteMail(ctx, filed), /already been filed/);
  await assert.rejects(restoreMail(ctx, archived), ConflictError); // can't un-delete
  await assert.rejects(deleteMail(ctx, 999_999), NotFoundError);
  const other = await secondUser(ctx);
  await assert.rejects(deleteMail(other, filed), NotFoundError);
});

test("a mail matching a hand-written line is flagged, and can be merged into it", async () => {
  const ctx = await freshCtx();
  const { entry } = await addEntry(ctx, line({ payee: "Vinod", amount: "10", occurredAt: "2026-09-22T11:00" }), key());
  const mail = await insertMail(ctx, HDFC);
  const [slip] = await listSlips(ctx, "waiting");
  assert.equal(slip.duplicateOf?.id, entry.id);
  await markDuplicate(ctx, mail, entry.id);
  assert.equal((await getEntry(ctx, entry.id)).ref, "626412345672");
  assert.equal((await listEntries(ctx, { ym: "2026-09", filter: "all", page: 1 })).total, 1);
  assert.equal(await findLikelyDuplicate(ctx, { amount: -1000, occurredAt: "2026-09-25T10:00:00", ref: null }), null);
});

test("auto-file needs a known tag, a complete parse and no 'ask' rule", async () => {
  const ctx = await freshCtx();
  // no history, no rule → waits for a person
  const first = await insertMail(ctx, HDFC);
  assert.equal(await tryAutoFile(ctx, first, true), false);
  // a tag rule makes it confident enough
  await createRule(ctx, { field: "payee_prefix", value: "VINOD", action: "tag", tagId: await tagId(ctx, "Food & delivery") });
  assert.equal(await tryAutoFile(ctx, first, true), true);
  // auto-file switched off → waits
  const second = await insertMail(ctx, HDFC.replace("626412345672", "626412345699").replace("22-09-26", "23-09-26"));
  assert.equal(await tryAutoFile(ctx, second, false), false);
  // "ask me first" beats everything
  await createRule(ctx, { field: "amount_over", value: "5", action: "ask", tagId: null });
  assert.equal(await tryAutoFile(ctx, second, true), false);
});

test("a payment to someone with an open slate account is never auto-filed", async () => {
  const ctx = await freshCtx();
  const p = await createPerson(ctx, { name: "Vinod S", matchNames: "VINOD SI", phone: null, note: null });
  await addSlateLine(ctx, { personId: p, amount: 300000, direction: "gave", occurredAt: "2026-08-12T21:04:00", note: "Concert tickets", clientKey: key() });
  await createRule(ctx, { field: "sender", value: "hdfcbank.net", action: "file", tagId: null });
  const mail = await insertMail(ctx, HDFC);
  assert.equal((await listSlips(ctx, "waiting"))[0].person?.id, p);
  assert.equal(await tryAutoFile(ctx, mail, true), false);
  await fileMail(ctx, mail, { tagId: null, personId: p });
  assert.equal((await getAccount(ctx, p)).account.balance, 301000);
});

// ─── slate ───────────────────────────────────────────────────────────────

test("slate: balances, pages, age since the balance opened", async () => {
  const ctx = await freshCtx();
  const vinod = await createPerson(ctx, { name: "Vinod S", matchNames: null, phone: null, note: null });
  const ammi = await createPerson(ctx, { name: "Ammi", matchNames: null, phone: null, note: null });
  await addSlateLine(ctx, { personId: vinod, amount: 100000, direction: "gave", occurredAt: "2026-06-01T10:00:00", note: "Lunch", clientKey: key() });
  await addSlateLine(ctx, { personId: vinod, amount: 100000, direction: "got", occurredAt: "2026-06-05T10:00:00", note: "Paid back", clientKey: key() });
  await addSlateLine(ctx, { personId: vinod, amount: 50000, direction: "gave", occurredAt: "2026-08-12T10:00:00", note: "Tickets", clientKey: key() });
  await addSlateLine(ctx, { personId: ammi, amount: 400000, direction: "got", occurredAt: "2026-09-09T10:00:00", note: "Borrowed", clientKey: key() });
  const accts = await listAccounts(ctx);
  const v = accts.find((a) => a.id === vinod)!;
  assert.equal(v.balance, 50000);
  assert.equal(v.openSince, "2026-08-12T10:00:00"); // the June loan was settled
  const stats = await slateStats(ctx, accts);
  assert.equal(stats.owedToYou, 50000);
  assert.equal(stats.youOwe, 400000);
  assert.equal(stats.net, -350000);
  await assert.rejects(deletePerson(ctx, vinod), UserError);
});

test("slate lines are idempotent and people match by alternate names", async () => {
  const ctx = await freshCtx();
  const p = await createPerson(ctx, { name: "Priya Nair", matchNames: "priya@okicici", phone: null, note: null });
  const k = key();
  const a = await addSlateLine(ctx, { personId: p, amount: 800000, direction: "gave", occurredAt: "2026-07-02T10:00:00", note: "Rent share", clientKey: k });
  const b = await addSlateLine(ctx, { personId: p, amount: 800000, direction: "gave", occurredAt: "2026-07-02T10:00:00", note: "Rent share", clientKey: k });
  assert.equal(a.id, b.id);
  assert.equal((await matchPerson(ctx, "PRIYA NAIR"))?.id, p);
  assert.equal((await matchPerson(ctx, "priya@okicici"))?.id, p);
  assert.equal(await matchPerson(ctx, "Priyanka"), null);
  await assert.rejects(createPerson(ctx, { name: "priya nair", matchNames: null, phone: null, note: null }), UserError);
});
