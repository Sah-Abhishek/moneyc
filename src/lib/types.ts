// Domain types shared by server and client components. Keep this file free of
// server imports so client components can use it.

export const TAG_COLORS = ["spend", "ink", "pending", "plum", "teal", "indigo", "credit", "faint"] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export const TAG_COLOR_LABEL: Record<TagColor, string> = {
  spend: "Vermillion", ink: "Ink", pending: "Ochre", plum: "Plum",
  teal: "Teal", indigo: "Indigo", credit: "Green", faint: "Stone",
};

export const CHANNELS = ["UPI", "Card", "Cash", "NEFT", "IMPS", "RTGS", "ATM", "Bank"] as const;
export type Channel = (typeof CHANNELS)[number];

export interface Tag {
  id: number;
  name: string;
  color: TagColor;
  kind: "spend" | "income";
  budget: number | null;
}

export interface Entry {
  id: number;
  occurredAt: string;
  payee: string;
  amount: number;
  channel: string;
  ref: string | null;
  account: string | null;
  note: string | null;
  tag: Tag | null;
  source: "hand" | "wire";
  auto: boolean;
  personId: number | null;
  personName: string | null;
  /** bumped on every change; the editor sends it back to detect concurrent edits */
  version: number;
  /** running balance of the whole book after this line (paise) */
  balance: number;
}

export type LedgerFilter = "all" | "wire" | "hand" | "untagged";

export type RuleField = "sender" | "payee_prefix" | "amount_over";
export type RuleAction = "file" | "tag" | "ask";

export interface Rule {
  id: number;
  field: RuleField;
  value: string;
  action: RuleAction;
  tag: Tag | null;
  position: number;
}

/** What every mutating server action returns. */
export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };
