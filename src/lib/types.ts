// Domain types shared by server and client components. Keep this file free of
// server imports so client components can use it.

export const TAG_COLORS = ["spend", "ink", "pending", "plum", "teal", "indigo", "credit", "faint"] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export const TAG_COLOR_LABEL: Record<TagColor, string> = {
  spend: "Vermillion", ink: "Ink", pending: "Ochre", plum: "Plum",
  teal: "Teal", indigo: "Indigo", credit: "Green", faint: "Stone",
};

export const CHANNELS = ["UPI", "Card", "Cash", "Cheque", "NEFT", "IMPS", "RTGS", "ATM", "Bank"] as const;
export type Channel = (typeof CHANNELS)[number];
/** Ways to pay the ledger's one-line form offers: every channel but ATM, whose cash needs the full form's question. */
export const QUICK_CHANNELS = ["Cash", "UPI", "Card", "Cheque", "NEFT", "IMPS", "RTGS", "Bank"] as const satisfies readonly Channel[];

export interface Tag {
  id: number;
  name: string;
  color: TagColor;
  kind: "spend" | "income";
  budget: number | null;
}

/** A named set of tags to read spending through ("Health": Healthy, Junk, Leisure). */
export interface TagGroup {
  id: number;
  name: string;
  /** spending tags in the group, by name */
  tagIds: number[];
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
  /**
   * cash taken out to spend by hand: the money only moved to the wallet, so
   * it counts neither as spending nor against the balance
   */
  toWallet: boolean;
  /** bumped on every change; the editor sends it back to detect concurrent edits */
  version: number;
  /** running balance of the whole book after this line (paise) */
  balance: number;
}

export const LEDGER_FILTERS = ["all", "wire", "hand", "untagged"] as const;
export type LedgerFilter = (typeof LEDGER_FILTERS)[number];

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
