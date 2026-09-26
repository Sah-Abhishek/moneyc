import { z } from "zod";
import { isWallClock } from "../lib/dates.ts";
import { parsePaise } from "../lib/money.ts";
import { CHANNELS, QUICK_CHANNELS, TAG_COLORS } from "../lib/types.ts";
import { normaliseSender, SENDER_PATTERN } from "./gmail/banks.ts";
import { UserError } from "./services/context.ts";

// Server-side validation for everything that arrives from a form. The client
// validates too, for speed, but these schemas are the ones that count.

const MAX_PAISE = 10_000_000_000_00; // ₹10,000 crore — anything above is a typo, not a payment

const text = (label: string, max: number) =>
  z
    .string({ error: `${label} is required` })
    .transform((s) => s.normalize("NFC").replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, `${label} is required`).max(max, `${label} must be ${max} characters or fewer`));

const optionalText = (label: string, max: number) =>
  z
    .string()
    .optional()
    .transform((s) => (s ?? "").normalize("NFC").replace(/\s+/g, " ").trim())
    .pipe(z.string().max(max, `${label} must be ${max} characters or fewer`))
    .transform((s) => s || null);

/** what the money was for ("Biscuits"); a form or body that leaves it out means none */
export const itemField = z.preprocess((v) => v ?? undefined, optionalText("What for", 120));

export const amountField = z
  .string({ error: "Enter an amount" })
  .transform((s, ctx) => {
    const p = parsePaise(s.trim());
    if (p == null) {
      ctx.addIssue({ code: "custom", message: "Enter an amount like 250 or 1,899.50" });
      return z.NEVER;
    }
    return p;
  })
  .pipe(z.number().int().min(1, "Amount must be more than zero").max(MAX_PAISE, "That amount is too large"));

const idField = (label: string) =>
  z.coerce.number({ error: `${label} is invalid` }).int().positive(`${label} is invalid`);

const optionalId = z
  .union([z.literal(""), z.null(), z.undefined(), z.string(), z.number()])
  .transform((v, ctx) => {
    if (v === "" || v == null) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) {
      ctx.addIssue({ code: "custom", message: "Invalid selection" });
      return z.NEVER;
    }
    return n;
  });

export const wallClockField = z
  .string({ error: "Choose a date and time" })
  .transform((s) => (s.length === 16 ? `${s}:00` : s)) // <input type=datetime-local> omits seconds
  .refine(isWallClock, "Choose a valid date and time");

/** cash from an ATM: "wallet" = I'll write down what I spend; "spent" = count it all as spent now */
export const cashChoice = z.enum(["wallet", "spent"], { error: "Choose how this cash should count" });

/** who was paid: optional, as long as what it was for is given instead */
export const payeeField = z.preprocess((v) => v ?? undefined, optionalText("Payee", 120));
const WHO_OR_WHAT = "Say who you paid or what it was for";

export const entryInput = z
  .object({
    payee: payeeField,
    amount: amountField,
    direction: z.enum(["out", "in"], { error: "Choose money out or money in" }),
    occurredAt: wallClockField,
    channel: z.enum(CHANNELS, { error: "Choose how it was paid" }),
    tagId: optionalId,
    item: itemField,
    note: optionalText("Note", 280),
    /** the number printed on a cheque; kept as the line's reference */
    chequeNo: optionalText("Cheque number", 12).refine((s) => !s || /^\d{4,12}$/.test(s), "Enter the cheque number, digits only (6 on most cheques)"),
    /** cash from an ATM: "wallet" = I'll write down what I spend; "spent" = count it all as spent now */
    cash: z.preprocess((v) => (v === "" || v === null ? undefined : v), cashChoice.optional()),
  })
  .superRefine((e, ctx) => {
    if (!e.payee && !e.item) ctx.addIssue({ code: "custom", path: ["payee"], message: WHO_OR_WHAT });
    if (e.channel === "ATM" && e.direction === "out" && !e.cash)
      ctx.addIssue({ code: "custom", path: ["cash"], message: "Choose how this cash should count" });
  })
  .transform(({ chequeNo, cash, ...e }) => {
    const toWallet = e.channel === "ATM" && e.direction === "out" && cash === "wallet";
    return {
      ...e,
      ref: e.channel === "Cheque" ? chequeNo : null,
      toWallet,
      // Cash moved to the wallet isn't spending, so it carries no spending tag.
      tagId: toWallet ? null : e.tagId,
    };
  });
export type EntryInput = z.infer<typeof entryInput>;

export const quickEntryInput = z.object({
  payee: payeeField,
  item: itemField,
  /** a leading + means money in */
  amount: z
    .string({ error: "Enter an amount" })
    .transform((s) => s.trim())
    .transform((s) => ({ incoming: s.startsWith("+"), raw: s.replace(/^[+−-]\s*/, "") }))
    .pipe(z.object({ incoming: z.boolean(), raw: amountField })),
  tagId: optionalId,
  /** how it was paid; not ATM, whose cash needs the full form's question. Absent = Cash, as the line always was */
  channel: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.enum(QUICK_CHANNELS, { error: "Choose how it was paid" }).default("Cash")),
  clientKey: z.string().min(8).max(64),
}).refine((e) => e.payee || e.item, { path: ["payee"], message: WHO_OR_WHAT });

export const tagInput = z.object({
  name: text("Name", 40),
  color: z.enum(TAG_COLORS, { error: "Choose a colour" }),
  kind: z.enum(["spend", "income"]).default("spend"),
  budget: z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (!s || !s.trim()) return null;
      const p = parsePaise(s.trim());
      if (p == null) {
        ctx.addIssue({ code: "custom", message: "Enter a budget like 5,000" });
        return z.NEVER;
      }
      return p;
    }),
});

export const MAX_TAG_GROUPS = 50;

export const tagGroupInput = z.object({
  name: text("Name", 40),
  tagIds: z
    .array(z.union([z.string(), z.number()]), { error: "Choose the tags in this group" })
    .max(200, "That's too many tags")
    .transform((ids, ctx) => {
      const out = new Set<number>();
      for (const v of ids) {
        const n = Number(v);
        if (!Number.isInteger(n) || n <= 0) {
          ctx.addIssue({ code: "custom", message: "Invalid tag" });
          return z.NEVER;
        }
        out.add(n);
      }
      return [...out];
    })
    .pipe(z.array(z.number()).min(1, "Pick at least one tag for the group")),
});

export const ruleInput = z
  .object({
    field: z.enum(["sender", "payee_prefix", "amount_over"], { error: "Choose what the rule looks at" }),
    value: text("Value", 120),
    action: z.enum(["file", "tag", "ask"], { error: "Choose what the rule does" }),
    tagId: optionalId,
  })
  .superRefine((r, ctx) => {
    if (r.action === "tag" && !r.tagId) ctx.addIssue({ code: "custom", path: ["tagId"], message: "Choose the tag to stamp" });
    if (r.field === "amount_over" && parsePaise(r.value) == null)
      ctx.addIssue({ code: "custom", path: ["value"], message: "Enter an amount like 20,000" });
    if (r.field === "sender" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$|^@?[a-z0-9.-]+\.[a-z]{2,}$/i.test(r.value))
      ctx.addIssue({ code: "custom", path: ["value"], message: "Enter an email address or a domain like hdfcbank.net" });
  });

export const personInput = z.object({
  name: text("Name", 60),
  matchNames: optionalText("Other names", 400),
  phone: optionalText("Phone", 20).refine((p) => !p || /^\+?[\d\s-]{6,20}$/.test(p), "Enter a phone number with digits only"),
  note: optionalText("Note", 280),
});

export const slateLineInput = z.object({
  personId: idField("Person"),
  amount: amountField,
  /** gave = you gave them money (they owe you more); got = they gave you money */
  direction: z.enum(["gave", "got"], { error: "Choose who paid" }),
  occurredAt: wallClockField,
  note: text("What happened", 140),
  clientKey: z.string().min(8).max(64),
});

/** a calendar day, "2026-10-05"; empty means none */
const optionalDay = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid day")
    .refine((s) => isWallClock(`${s}T00:00:00`), "Choose a valid day")
    .nullable(),
);

/** Settle up: no amount = the whole balance; less leaves the rest, maybe promised by a day. */
export const settleInput = z.object({
  personId: idField("Person"),
  amount: z.preprocess((v) => (v === "" || v == null ? null : v), amountField.nullable()),
  promisedBy: optionalDay,
  occurredAt: wallClockField,
  clientKey: z.string().min(8).max(64),
});

export const promiseInput = z.object({ promisedBy: optionalDay });

export const settingsInput = z.object({
  monthlyBudget: z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (!s || !s.trim()) return null;
      const p = parsePaise(s.trim());
      if (p == null) {
        ctx.addIssue({ code: "custom", message: "Enter a budget like 70,000" });
        return z.NEVER;
      }
      return p;
    }),
  timezone: z.string().min(1),
  autoFile: z.boolean(),
});

/**
 * Budgets: the monthly figure and each tag's, as typed. Every bad amount is
 * reported (keyed "tag-<id>" / "monthly") before anything is saved.
 */
export function parseBudgets(monthlyRaw: unknown, perTagRaw: [unknown, unknown][]): { monthly: number | null; perTag: [number, number | null][] } {
  const errors: Record<string, string> = {};
  const amount = (raw: unknown, key: string, example: string) => {
    const s = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
    if (!s) return null;
    const p = parsePaise(s);
    if (p == null || p > MAX_PAISE) errors[key] = `Enter an amount like ${example}`;
    return p;
  };
  const monthly = amount(monthlyRaw, "monthly", "70,000");
  const perTag: [number, number | null][] = [];
  for (const [rawId, raw] of perTagRaw) {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) throw new UserError("Invalid tag");
    perTag.push([id, amount(raw, `tag-${id}`, "5,000")]);
  }
  if (Object.keys(errors).length) throw new UserError("Some budgets aren't amounts yet.", errors);
  return { monthly, perTag };
}

export const MAX_MAIL_SENDERS = 20;

/** "Read mail from": every known bank, or only the listed senders (one per line; commas work too). */
export const mailSendersInput = z
  .object({
    scope: z.enum(["banks", "only"], { error: "Choose where mail is read from" }),
    senders: z.string().max(4000, "That list is too long").optional(),
  })
  .transform((r, ctx) => {
    if (r.scope === "banks") return [];
    const list = [...new Set((r.senders ?? "").split(/[\n,;]+/).map(normaliseSender).filter(Boolean))];
    const bad = list.find((s) => s.length > 120 || !SENDER_PATTERN.test(s));
    if (bad) ctx.addIssue({ code: "custom", path: ["senders"], message: `“${bad.slice(0, 60)}” isn't an email address or a domain like hdfcbank.net` });
    else if (!list.length) ctx.addIssue({ code: "custom", path: ["senders"], message: "Add at least one sender, or choose every bank" });
    else if (list.length > MAX_MAIL_SENDERS) ctx.addIssue({ code: "custom", path: ["senders"], message: `List at most ${MAX_MAIL_SENDERS} senders` });
    return list;
  });

export { idField };

/** Parse or throw a UserError carrying per-field messages. */
export function parseInput<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join(".") || "_";
    fieldErrors[key.replace(/^amount\.raw$/, "amount")] ??= issue.message;
  }
  const first = Object.values(fieldErrors)[0] ?? "Check the form and try again";
  throw new UserError(first, fieldErrors);
}
