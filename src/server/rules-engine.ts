import { parsePaise } from "../lib/money.ts";
import type { RuleAction, RuleField } from "../lib/types.ts";

// Standing rules, evaluated in the order the user arranged them.
//   field   sender        — the mail's From address, or its domain
//           payee_prefix  — the payee the parser found starts with the value
//           amount_over   — the amount is strictly greater than the value
//   action  file          — file into the ledger without asking
//           tag           — stamp this tag (first matching tag rule wins)
//           ask           — never auto-file; always wait for a person
// "ask" beats "file", whatever the order, because being asked is recoverable
// and a wrong automatic filing is not noticed.

export interface EngineRule {
  id: number;
  field: RuleField;
  value: string;
  action: RuleAction;
  tagId: number | null;
}

export interface Verdict {
  file: boolean;
  ask: boolean;
  tagId: number | null;
  matched: number[];
}

export function senderMatches(sender: string, value: string): boolean {
  const s = sender.trim().toLowerCase();
  const v = value.trim().toLowerCase().replace(/^@/, "");
  if (!s || !v) return false;
  if (v.includes("@")) return s === v;
  const domain = s.split("@")[1] ?? "";
  return domain === v || domain.endsWith(`.${v}`);
}

export function ruleMatches(rule: EngineRule, mail: { sender: string; payee: string | null; amount: number | null }): boolean {
  switch (rule.field) {
    case "sender":
      return senderMatches(mail.sender, rule.value);
    case "payee_prefix":
      return !!mail.payee && mail.payee.trim().toUpperCase().startsWith(rule.value.trim().toUpperCase());
    case "amount_over": {
      const limit = parsePaise(rule.value);
      return limit != null && mail.amount != null && mail.amount > limit;
    }
  }
}

export function evaluate(rules: EngineRule[], mail: { sender: string; payee: string | null; amount: number | null }): Verdict {
  const v: Verdict = { file: false, ask: false, tagId: null, matched: [] };
  for (const rule of rules) {
    if (!ruleMatches(rule, mail)) continue;
    v.matched.push(rule.id);
    if (rule.action === "file") v.file = true;
    if (rule.action === "ask") v.ask = true;
    if (rule.action === "tag" && v.tagId == null) v.tagId = rule.tagId;
  }
  if (v.ask) v.file = false;
  return v;
}
