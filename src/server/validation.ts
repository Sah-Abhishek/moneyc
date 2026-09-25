import { z } from "zod";
import { isWallClock } from "../lib/dates.ts";
import { parsePaise } from "../lib/money.ts";
import { CHANNELS, TAG_COLORS } from "../lib/types.ts";
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

export const entryInput = z.object({
  payee: text("Payee", 120),
  amount: amountField,
  direction: z.enum(["out", "in"], { error: "Choose money out or money in" }),
  occurredAt: wallClockField,
  channel: z.enum(CHANNELS, { error: "Choose how it was paid" }),
  tagId: optionalId,
  note: optionalText("Note", 280),
});
export type EntryInput = z.infer<typeof entryInput>;

export const quickEntryInput = z.object({
  payee: text("Payee", 120),
  /** a leading + means money in */
  amount: z
    .string({ error: "Enter an amount" })
    .transform((s) => s.trim())
    .transform((s) => ({ incoming: s.startsWith("+"), raw: s.replace(/^[+−-]\s*/, "") }))
    .pipe(z.object({ incoming: z.boolean(), raw: amountField })),
  tagId: optionalId,
  clientKey: z.string().min(8).max(64),
});

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
