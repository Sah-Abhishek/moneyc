import { ymOf, wallClock } from "../../lib/dates.ts";
import type { Entry, Tag } from "../../lib/types.ts";
import { parseMail, resolveOccurredAt, type ParsedMail } from "../../lib/wire/parse.ts";
import { all, insertId, one, run, withTx } from "../db/index.ts";
import type { EngineRule } from "../rules-engine.ts";
import { evaluate } from "../rules-engine.ts";
import { ConflictError, NotFoundError, nowUtc, UserError, type Ctx } from "./context.ts";
import { findLikelyDuplicate, getEntry } from "./entries.ts";
import { engineRules } from "./rules.ts";
import { linkEntryToPerson, listAccounts, matchPerson, type Account } from "./slate.ts";
import { assertTag, tagMap } from "./tags.ts";

// "ignored" is shown as Archived. "deleted" keeps only the row's Gmail id (the
// text is wiped) so the sync never brings the mail back.
export type MailStatus = "waiting" | "filed" | "ignored" | "duplicate" | "skipped" | "deleted";

export interface WireSlip {
  id: number;
  bank: string;
  sender: string;
  subject: string | null;
  body: string;
  receivedAt: string;
  status: MailStatus;
  parsed: ParsedMail;
  /** when the payment happened: the time in the mail, else when it arrived */
  occurredAt: string;
  suggestion: { tag: Tag; basis: string } | null;
  /** a line already in the ledger that looks like this same payment */
  duplicateOf: Entry | null;
  /** an open slate account this payment probably belongs to */
  person: Account | null;
  /** a rule says always ask about mail like this */
  askFirst: boolean;
  confidence: number;
}

interface MailRow {
  id: number; sender: string; bank: string; subject: string | null; body: string; received_at: string; status: MailStatus;
}

/**
 * What reading a slip needs besides the mail itself. Loaded once per page or
 * sync run rather than once per slip; none of it changes while slips are read.
 */
export interface WireRefs {
  rules: EngineRule[];
  tags: Map<number, Tag>;
  accounts: Account[];
}

export async function loadWireRefs(ctx: Ctx): Promise<WireRefs> {
  const [rules, tags, accounts] = await Promise.all([engineRules(ctx), tagMap(ctx), listAccounts(ctx)]);
  return { rules, tags, accounts };
}

export async function suggestTag(ctx: Ctx, payee: string | null, ruleTagId: number | null, tags: Map<number, Tag>): Promise<WireSlip["suggestion"]> {
  if (ruleTagId != null && tags.get(ruleTagId)) return { tag: tags.get(ruleTagId)!, basis: "from a standing rule" };
  if (!payee) return null;
  const hist = await one<{ tag_id: number; n: number }>(
    ctx.db,
    `SELECT tag_id, COUNT(*) AS n FROM entries
     WHERE user_id = ? AND lower(payee) = lower(?) AND tag_id IS NOT NULL AND deleted_at IS NULL
     GROUP BY tag_id ORDER BY n DESC, tag_id LIMIT 1`,
    [ctx.userId, payee],
  );
  const tag = hist && tags.get(hist.tag_id);
  return tag ? { tag, basis: `from ${hist.n} past payment${hist.n === 1 ? "" : "s"}` } : null;
}

async function toSlip(ctx: Ctx, r: MailRow, refs: WireRefs): Promise<WireSlip> {
  const parsed = parseMail(r.subject, r.body);
  const occurredAt = resolveOccurredAt(parsed, r.received_at);
  const verdict = evaluate(refs.rules, { sender: r.sender, payee: parsed.payee, amount: parsed.amountPaise });
  const signed = parsed.amountPaise == null ? null : parsed.direction === "credit" ? parsed.amountPaise : -parsed.amountPaise;
  const [suggestion, duplicateOf, person] = await Promise.all([
    suggestTag(ctx, parsed.payee, verdict.tagId, refs.tags),
    r.status === "waiting" && signed != null ? findLikelyDuplicate(ctx, { amount: signed, occurredAt, ref: parsed.ref, cheque: parsed.channel === "Cheque" }) : null,
    r.status === "waiting" ? matchPerson(ctx, parsed.payee, refs.accounts) : null,
  ]);
  const tagCertainty = suggestion ? (suggestion.basis.includes("rule") ? 1 : 0.95) : 0;
  return {
    id: r.id, bank: r.bank, sender: r.sender, subject: r.subject, body: r.body, receivedAt: r.received_at, status: r.status,
    parsed, occurredAt, suggestion, duplicateOf, person, askFirst: verdict.ask,
    confidence: Math.round((parsed.confidence * 0.7 + tagCertainty * 0.3) * 100) / 100,
  };
}

export async function listSlips(ctx: Ctx, status: MailStatus | "decided", limit = 200): Promise<WireSlip[]> {
  const where = status === "decided" ? "status IN ('filed', 'ignored', 'duplicate')" : "status = :status";
  const [rows, refs] = await Promise.all([
    all<MailRow>(
      ctx.db,
      `SELECT id, sender, bank, subject, body, received_at, status FROM wire_mails
       WHERE user_id = :user AND ${where} ORDER BY received_at DESC, id DESC LIMIT :limit`,
      status === "decided" ? { user: ctx.userId, limit } : { user: ctx.userId, status, limit },
    ),
    loadWireRefs(ctx),
  ]);
  return Promise.all(rows.map((r) => toSlip(ctx, r, refs)));
}

export async function getSlip(ctx: Ctx, id: number, refs?: WireRefs): Promise<WireSlip> {
  const [r, loaded] = await Promise.all([
    one<MailRow>(ctx.db, "SELECT id, sender, bank, subject, body, received_at, status FROM wire_mails WHERE id = ? AND user_id = ?", [id, ctx.userId]),
    refs ?? loadWireRefs(ctx),
  ]);
  if (!r) throw new NotFoundError("That mail is no longer on the wire.");
  return toSlip(ctx, r, loaded);
}

export async function waitingCount(ctx: Ctx): Promise<number> {
  return (await one<{ n: number }>(ctx.db, "SELECT COUNT(*) AS n FROM wire_mails WHERE user_id = ? AND status = 'waiting'", [ctx.userId]))!.n;
}

/** Moves a mail out of `from` status, or reports that someone else got there first. */
async function claim(ctx: Ctx, id: number, from: MailStatus, to: MailStatus) {
  const { changes } = await run(ctx.db, "UPDATE wire_mails SET status = ?, decided_at = ? WHERE id = ? AND user_id = ? AND status = ?", [
    to, nowUtc(), id, ctx.userId, from,
  ]);
  if (changes) return;
  const now = await one<{ status: MailStatus }>(ctx.db, "SELECT status FROM wire_mails WHERE id = ? AND user_id = ?", [id, ctx.userId]);
  if (!now) throw new NotFoundError("That mail is no longer on the wire.");
  throw new ConflictError(STATUS_CONFLICT[now.status]);
}

const STATUS_CONFLICT: Record<MailStatus, string> = {
  waiting: "That mail is already back on the desk.",
  filed: "That mail has already been filed — probably from another tab.",
  ignored: "That mail was already archived.",
  duplicate: "That mail was already matched to an existing line.",
  skipped: "That mail isn't a transaction, so it isn't on the wire.",
  deleted: "That mail was already deleted.",
};

export interface FileOptions {
  payee?: string | null;
  /** what the money was for ("Biscuits"); the payee stays who was paid */
  item?: string | null;
  amount?: number | null;
  tagId: number | null;
  /** put the payment on this person's slate instead of treating it as spending/income */
  personId?: number | null;
  /**
   * cash from an ATM: "wallet" = the owner will write down what they spend it
   * on; "spent" = count it all as spent now. Required for ATM withdrawals.
   */
  cash?: "wallet" | "spent" | null;
  auto?: boolean;
}

/** Files a waiting mail into the ledger. Safe against double submits and concurrent tabs. */
export function fileMail(ctx: Ctx, mailId: number, opts: FileOptions, refs?: WireRefs): Promise<Entry> {
  return withTx(ctx, async (ctx) => {
    const slip = await getSlip(ctx, mailId, refs);
    const payee = opts.payee?.trim() || slip.parsed.payee;
    const amount = opts.amount ?? slip.parsed.amountPaise;
    if (!payee) throw new UserError("Add the payee before filing — the mail didn't say who it was.", { payee: "Who was it?" });
    if (!amount) throw new UserError("Add the amount before filing — it couldn't be read from the mail.", { amount: "How much?" });
    if (!slip.parsed.direction) throw new UserError("The mail doesn't say whether money went out or came in. Add it by hand instead.");
    const atm = isCashWithdrawal(slip.parsed);
    if (atm && !opts.personId && !opts.cash)
      throw new UserError("Choose how this cash should count: written down spend by spend, or spent all at once.", { cash: "Choose one" });
    const toWallet = atm && !opts.personId && opts.cash === "wallet";
    const tagId = opts.personId || toWallet ? null : opts.tagId;
    if (tagId != null) await assertTag(ctx, tagId);

    await claim(ctx, mailId, "waiting", "filed");
    const bankShort = slip.bank.split(" ")[0].toUpperCase();
    const now = nowUtc();
    const id = await insertId(
      ctx.db,
      `INSERT INTO entries (user_id, occurred_at, payee, amount, channel, ref, account, item, tag_id, to_wallet, source, auto, mail_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'wire', ?, ?, ?, ?)`,
      [
        ctx.userId, slip.occurredAt, payee, slip.parsed.direction === "credit" ? amount : -amount,
        slip.parsed.channel === "Other" ? "Bank" : slip.parsed.channel, slip.parsed.ref,
        slip.parsed.account ? `${bankShort} ****${slip.parsed.account}` : null,
        opts.item?.trim() || null, tagId, toWallet, opts.auto ?? false, mailId, now, now,
      ],
    );
    if (opts.personId) {
      const note = slip.parsed.direction === "credit" ? `Repaid over ${slip.parsed.channel === "Other" ? "bank transfer" : slip.parsed.channel}` : `Paid ${payee} over ${slip.parsed.channel === "Other" ? "bank transfer" : slip.parsed.channel}`;
      await linkEntryToPerson(ctx, id, opts.personId, note);
    }
    return getEntry(ctx, id);
  });
}

/** Money out at an ATM: whether it's spending depends on the owner, so it's always asked. */
export function isCashWithdrawal(p: ParsedMail): boolean {
  return p.channel === "ATM" && p.direction === "debit";
}

/**
 * Undo for "Confirm": removes the line a mail was just filed as (and its slate
 * line, if it went on the slate) and puts the mail back on the desk.
 */
export async function unfileMail(ctx: Ctx, mailId: number) {
  await withTx(ctx, async (ctx) => {
    const e = await one<{ id: number }>(ctx.db, "SELECT id FROM entries WHERE mail_id = ? AND user_id = ?", [mailId, ctx.userId]);
    if (e) {
      await run(ctx.db, "DELETE FROM slate_lines WHERE entry_id = ? AND user_id = ?", [e.id, ctx.userId]);
      await run(ctx.db, "DELETE FROM entries WHERE id = ? AND user_id = ?", [e.id, ctx.userId]);
    }
    await claim(ctx, mailId, "filed", "waiting");
  });
}

export function ignoreMail(ctx: Ctx, mailId: number) {
  return claim(ctx, mailId, "waiting", "ignored");
}

/** Undo for "It's the same one". The reference copied onto the line stays; it's still correct. */
export function restoreFromDuplicate(ctx: Ctx, mailId: number) {
  return claim(ctx, mailId, "duplicate", "waiting");
}

/**
 * Deletes a mail from the wire for good: its text is wiped and it never comes
 * back from Gmail (nothing in Gmail changes — access is read-only). Only mail
 * on the desk or in the archive; filed mail is changed through its ledger line.
 */
export async function deleteMail(ctx: Ctx, mailId: number) {
  const { changes } = await run(
    ctx.db,
    "UPDATE wire_mails SET status = 'deleted', subject = NULL, body = '', decided_at = ? WHERE id = ? AND user_id = ? AND status IN ('waiting', 'ignored')",
    [nowUtc(), mailId, ctx.userId],
  );
  if (changes) return;
  const now = await one<{ status: MailStatus }>(ctx.db, "SELECT status FROM wire_mails WHERE id = ? AND user_id = ?", [mailId, ctx.userId]);
  if (!now) throw new NotFoundError("That mail is no longer on the wire.");
  throw new ConflictError(STATUS_CONFLICT[now.status]);
}

/** Puts an archived mail back on the desk. */
export function restoreMail(ctx: Ctx, mailId: number) {
  return claim(ctx, mailId, "ignored", "waiting");
}

/** "It's the same one": links the mail to an existing line instead of filing a copy. */
export async function markDuplicate(ctx: Ctx, mailId: number, entryId: number) {
  await withTx(ctx, async (ctx) => {
    const slip = await getSlip(ctx, mailId);
    const entry = await getEntry(ctx, entryId);
    await claim(ctx, mailId, "waiting", "duplicate");
    // Enrich a hand-written line with the bank's reference, never overwrite one.
    if (!entry.ref && slip.parsed.ref) await run(ctx.db, "UPDATE entries SET ref = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ? AND ref IS NULL", [slip.parsed.ref, nowUtc(), entryId, ctx.userId]);
  });
}

/**
 * Called by the sync for each new mail. Files it without review only when
 * every one of these holds; otherwise it waits on the desk:
 *  - the user has auto-file on, or a rule says "file"
 *  - no rule says "ask me first"
 *  - the parser found amount, direction, payee and time
 *  - a tag is known (rule or history), or a rule says "file"
 *  - it doesn't look like a line already in the ledger
 *  - it isn't money moving between you and someone on the slate
 *  - it isn't cash from an ATM (whether that's spending is the owner's call)
 */
export async function tryAutoFile(ctx: Ctx, mailId: number, autoFileSetting: boolean, refs?: WireRefs): Promise<boolean> {
  refs ??= await loadWireRefs(ctx);
  const slip = await getSlip(ctx, mailId, refs);
  if (slip.status !== "waiting") return false;
  const verdict = evaluate(refs.rules, { sender: slip.sender, payee: slip.parsed.payee, amount: slip.parsed.amountPaise });
  const p = slip.parsed;
  const complete = p.amountPaise != null && p.direction != null && p.payee != null && p.postedAt != null;
  const allowed = (autoFileSetting && slip.suggestion != null) || verdict.file;
  if (verdict.ask || !complete || !allowed || slip.duplicateOf || slip.person || isCashWithdrawal(p)) return false;
  try {
    await fileMail(ctx, mailId, { tagId: slip.suggestion?.tag.id ?? null, auto: true }, refs);
    return true;
  } catch (e) {
    if (e instanceof ConflictError) return false; // someone filed it by hand meanwhile
    throw e;
  }
}

export async function wireStats(ctx: Ctx) {
  const ym = ymOf(wallClock(ctx.tz));
  const [r, banks] = await Promise.all([
    one<{ auto: number; corrected: number }>(
      ctx.db,
      `SELECT COUNT(*) AS auto, COUNT(*) FILTER (WHERE corrected) AS corrected
       FROM entries WHERE user_id = ? AND source = 'wire' AND auto AND deleted_at IS NULL AND substr(occurred_at, 1, 7) = ?`,
      [ctx.userId, ym],
    ).then((x) => x!),
    one<{ n: number }>(ctx.db, "SELECT COUNT(DISTINCT bank) AS n FROM wire_mails WHERE user_id = ? AND status NOT IN ('skipped', 'deleted')", [ctx.userId]).then((x) => x!.n),
  ]);
  return {
    ym,
    autoFiled: r.auto,
    /** share of automatically filed lines nobody had to correct afterwards */
    accuracy: r.auto ? (r.auto - r.corrected) / r.auto : null,
    banksSeen: banks,
  };
}
