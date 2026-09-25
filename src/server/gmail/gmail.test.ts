import { test } from "node:test";
import { startOfLocalDay } from "../../lib/dates.ts";
import assert from "node:assert/strict";
import { freshCtx, gmailMessage, tagId } from "../test-helpers.ts";
import { createRule } from "../services/rules.ts";
import { deleteMail, listSlips, waitingCount } from "../services/wire.ts";
import { listEntries } from "../services/entries.ts";
import { getUser, setMailSenders } from "../services/users.ts";
import { mailSendersInput, parseInput } from "../validation.ts";
import { UserError } from "../services/context.ts";
import { addressOf, bankFor, buildQuery } from "./banks.ts";
import { gmailClient, GmailError, type GmailClient } from "./client.ts";
import { htmlToText, messageText, type GmailMessage } from "./mime.ts";
import { readSyncState, syncMailbox } from "./sync.ts";

const HDFC_TEXT = "Dear Customer, Rs.10.00 has been debited from account **4721 to VPA vinodsi@okaxis VINOD SI on 22-09-26 11:18:42. Your UPI transaction reference number is 626412345672.";

function fakeClient(messages: GmailMessage[], opts: { failGetOnce?: boolean } = {}): GmailClient & { gets: string[] } {
  const gets: string[] = [];
  let failed = false;
  return {
    gets,
    async list() {
      return { ids: messages.map((m) => m.id) };
    },
    async get(id) {
      if (opts.failGetOnce && !failed) {
        failed = true;
        throw new GmailError("Gmail answered 503", 503);
      }
      gets.push(id);
      return messages.find((m) => m.id === id)!;
    },
  };
}

test("banks: sender addresses and bank names", async () => {
  assert.equal(addressOf("HDFC Bank InstaAlerts <alerts@hdfcbank.net>"), "alerts@hdfcbank.net");
  assert.equal(bankFor("alerts@hdfcbank.net"), "HDFC Bank");
  assert.equal(bankFor("donotreply.sbiatm@alerts.sbi.co.in"), "SBI");
  assert.equal(bankFor("noreply@examplebank.com"), "Examplebank");
  assert.match(buildQuery(["pay@mywallet.in"], 1_700_000_000), /from:\(.*hdfcbank\.net.*pay@mywallet\.in\) after:1700000000/);
  assert.equal(bankFor("noreplyubi-txn@ubi.bank.in"), "Union Bank");
  // An "only" list is exactly the search: no built-in banks, no rule senders.
  assert.equal(buildQuery(["pay@mywallet.in"], 1_700_000_000, ["noreplyubi-txn@ubi.bank.in"]), "from:(noreplyubi-txn@ubi.bank.in) after:1700000000");
});

test("mail senders: validation normalises, dedupes and explains bad input", () => {
  assert.deepEqual(parseInput(mailSendersInput, { scope: "banks", senders: "whatever" }), []);
  assert.deepEqual(parseInput(mailSendersInput, { scope: "only", senders: " NoReplyUBI-txn@UBI.bank.in \n@hdfcbank.net, noreplyubi-txn@ubi.bank.in\n\n" }), [
    "noreplyubi-txn@ubi.bank.in", "hdfcbank.net",
  ]);
  const fieldError = (senders: string) => {
    try {
      parseInput(mailSendersInput, { scope: "only", senders });
    } catch (e) {
      assert.ok(e instanceof UserError);
      return e.fieldErrors?.senders;
    }
    assert.fail("expected a validation error");
  };
  assert.match(fieldError("") ?? "", /at least one sender/);
  assert.match(fieldError("not an address") ?? "", /isn't an email address/);
  assert.match(fieldError("a@b.c OR x@y.z") ?? "", /isn't an email address/); // can't smuggle Gmail search syntax
  assert.match(fieldError(Array.from({ length: 21 }, (_, i) => `a${i}@bank.in`).join("\n")) ?? "", /at most 20/);
});

test("sync reads only the chosen senders; widening the list rescans the first-sync window", async () => {
  const ctx = await freshCtx();
  const queries: string[] = [];
  const client: GmailClient = { async list(q) { queries.push(q); return { ids: [] }; }, async get() { throw new Error("unused"); } };
  const read = async () => {
    await ctx.db.query("UPDATE sync_state SET last_started_at = NULL", []);
    await syncMailbox({ ctx, client, autoFile: true, force: true });
    return queries.at(-1)!;
  };
  const afterDays = (q: string) => (Date.now() / 1000 - Number(q.match(/after:(\d+)/)![1])) / 86_400;
  const fromSignup = (q: string) => afterDays(q) > 30 && afterDays(q) < 31; // back to local midnight on the signup day
  await ctx.db.query("UPDATE users SET created_at = $1 WHERE id = $2", [new Date(Date.now() - 30 * 86_400_000).toISOString(), ctx.userId]);

  assert.ok(fromSignup(await read()));
  assert.match(queries.at(-1)!, /hdfcbank\.net/);

  // Choosing a list is new to the search, so the next read looks back to signup, then catches up normally.
  assert.deepEqual(await setMailSenders(ctx, ["noreplyubi-txn@ubi.bank.in"]), { widened: true });
  assert.deepEqual((await getUser(ctx.db, ctx.userId))!.mailSenders, ["noreplyubi-txn@ubi.bank.in"]);
  let q = await read();
  assert.match(q, /^from:\(noreplyubi-txn@ubi\.bank\.in\) /);
  assert.ok(fromSignup(q));
  assert.equal((await readSyncState(ctx.db, ctx.userId)).rescanRequestedAt, null);
  assert.equal(Math.round(afterDays(await read())), 2);

  // Narrowing never rescans; back to every bank does.
  assert.deepEqual(await setMailSenders(ctx, ["noreplyubi-txn@ubi.bank.in"]), { widened: false });
  assert.deepEqual(await setMailSenders(ctx, []), { widened: true });
  q = await read();
  assert.match(q, /hdfcbank\.net/);
  assert.ok(fromSignup(q));
});

test("the wire never reads mail from before the signup day", async () => {
  const ctx = await freshCtx(); // signed up just now
  const queries: string[] = [];
  const client: GmailClient = { async list(q) { queries.push(q); return { ids: [] }; }, async get() { throw new Error("unused"); } };
  await syncMailbox({ ctx, client, autoFile: true, force: true });
  const after = Number(queries[0].match(/after:(\d+)/)![1]) * 1000;
  const midnight = startOfLocalDay(ctx.tz, new Date()).getTime();
  assert.equal(after, midnight);
  // A later read's two-day overlap still stops at signup.
  await ctx.db.query("UPDATE sync_state SET last_started_at = NULL", []);
  await syncMailbox({ ctx, client, autoFile: true, force: true });
  assert.equal(Number(queries[1].match(/after:(\d+)/)![1]) * 1000, midnight);
});

test("a deleted mail is never read back in from Gmail", async () => {
  const ctx = await freshCtx();
  const msgs = [gmailMessage("m1", "alerts@hdfcbank.net", "Alert", HDFC_TEXT)];
  await syncMailbox({ ctx, client: fakeClient(msgs), autoFile: false, force: true });
  const [slip] = await listSlips(ctx, "waiting");
  await deleteMail(ctx, slip.id);
  await ctx.db.query("UPDATE sync_state SET last_started_at = NULL, last_success_at = NULL", []); // a full re-read
  const client = fakeClient(msgs);
  const again = await syncMailbox({ ctx, client, autoFile: false, force: true });
  assert.equal(again.status === "done" && again.fetched, 0);
  assert.equal(client.gets.length, 0);
  assert.equal(await waitingCount(ctx), 0);
});

test("a sender change during a read is not lost when that read finishes", async () => {
  const ctx = await freshCtx();
  await setMailSenders(ctx, ["a@bank.in"]);
  const client: GmailClient = {
    async list() {
      await setMailSenders(ctx, ["a@bank.in", "b@bank.in"]); // lands mid-read
      return { ids: [] };
    },
    async get() { throw new Error("unused"); },
  };
  await syncMailbox({ ctx, client, autoFile: true, force: true });
  assert.notEqual((await readSyncState(ctx.db, ctx.userId)).rescanRequestedAt, null);
});

test("mime: plain text preferred, HTML flattened, attachments ignored", async () => {
  const html: GmailMessage = {
    id: "h",
    payload: {
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "text/html", body: { data: Buffer.from("<html><style>p{}</style><p>Rs.&nbsp;1,899.00 debited</p><table><tr><td>Info:</td><td>PAYU*MERCHANT</td></tr></table>&#8377;</html>").toString("base64url") } },
        { mimeType: "text/plain", filename: "statement.txt", body: { data: Buffer.from("SECRET").toString("base64url") } },
      ],
    },
  };
  const text = messageText(html);
  assert.ok(!text.includes("SECRET"));
  assert.ok(!text.includes("p{}"));
  assert.match(text, /Rs\. 1,899\.00 debited/);
  assert.match(text, /₹/);
  assert.equal(htmlToText("a<br>b"), "a\nb");
});

test("sync stores transactions, discards non-transaction bodies, and is idempotent", async () => {
  const ctx = await freshCtx();
  const msgs = [
    gmailMessage("m1", "HDFC Bank <alerts@hdfcbank.net>", "Alert", HDFC_TEXT),
    gmailMessage("m2", "HDFC Bank <alerts@hdfcbank.net>", "Your e-statement is ready", "Dear customer, your monthly statement is attached."),
  ];
  const first = await syncMailbox({ ctx, client: fakeClient(msgs), autoFile: true, force: true });
  assert.deepEqual(first, { status: "done", fetched: 2, added: 1, autoFiled: 0, skipped: 1, more: false });
  const { rows: [skipped] } = await ctx.db.query("SELECT body, status FROM wire_mails WHERE gmail_id = 'm2'", []);
  assert.deepEqual(skipped, { body: "", status: "skipped" });

  // Straight away, even a forced run is refused (rate limit)…
  assert.deepEqual(await syncMailbox({ ctx, client: fakeClient(msgs), autoFile: true, force: true }), { status: "too_soon" });
  // …and later, re-running sees nothing new and fetches nothing.
  await ctx.db.query("UPDATE sync_state SET last_started_at = $1", [new Date(Date.now() - 60_000).toISOString()]);
  const client = fakeClient(msgs);
  const again = await syncMailbox({ ctx, client, autoFile: true, force: true });
  assert.equal(again.status === "done" && again.fetched, 0);
  assert.equal(client.gets.length, 0);
  assert.equal(await waitingCount(ctx), 1);
  assert.equal((await listSlips(ctx, "waiting"))[0].parsed.payee, "VINOD SI");
});

test("sync auto-files when a rule makes it certain", async () => {
  const ctx = await freshCtx();
  await createRule(ctx, { field: "payee_prefix", value: "VINOD", action: "tag", tagId: await tagId(ctx, "Food & delivery") });
  const r = await syncMailbox({ ctx, client: fakeClient([gmailMessage("m1", "alerts@hdfcbank.net", "Alert", HDFC_TEXT)]), autoFile: true, force: true });
  assert.equal(r.status === "done" && r.autoFiled, 1);
  const [entry] = (await listEntries(ctx, { ym: "2026-09", filter: "all", page: 1 })).entries;
  assert.equal(entry.auto, true);
  assert.equal(entry.tag?.name, "Food & delivery");
});

test("sync failure records the error and releases the lock; a concurrent run is refused", async () => {
  const ctx = await freshCtx();
  await assert.rejects(syncMailbox({ ctx, client: fakeClient([gmailMessage("m1", "alerts@hdfcbank.net", "Alert", HDFC_TEXT)], { failGetOnce: true }), autoFile: true, force: true }));
  const s = await readSyncState(ctx.db, ctx.userId);
  assert.equal(s.runningSince, null);
  assert.match(s.lastError ?? "", /503/);
  assert.equal(s.lastSuccessAt, null); // the window did not advance

  // hold the lease, then try again
  await ctx.db.query("UPDATE sync_state SET running_since = $1 WHERE user_id = $2", [new Date().toISOString(), ctx.userId]);
  assert.deepEqual(await syncMailbox({ ctx, client: fakeClient([]), autoFile: true, force: true }), { status: "busy" });
});

test("gmail client retries 503s and gives up on 4xx", async () => {
  let calls = 0;
  const flaky: typeof fetch = async () => {
    calls++;
    return calls < 2 ? new Response("{}", { status: 503, headers: { "retry-after": "0" } }) : Response.json({ messages: [{ id: "a" }] });
  };
  assert.deepEqual((await gmailClient("t", flaky).list("q")).ids, ["a"]);
  assert.equal(calls, 2);

  const forbidden: typeof fetch = async () => Response.json({ error: { message: "Insufficient Permission" } }, { status: 403 });
  await assert.rejects(gmailClient("t", forbidden).list("q"), (e: unknown) => e instanceof GmailError && e.status === 403);
});
