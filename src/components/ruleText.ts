import { groupIndian } from "@/lib/money";
import type { Rule } from "@/lib/types";

// Plain-language rule descriptions, shared by the wire desk and the Rules page.

export function describeCondition(r: Pick<Rule, "field" | "value">) {
  if (r.field === "sender") return `Sender is ${r.value}`;
  if (r.field === "payee_prefix") return `Payee starts with ${r.value}`;
  return `Amount over ₹ ${groupIndian(Number(r.value.replace(/[^\d.]/g, "")))}`;
}

export function describeAction(r: Pick<Rule, "action" | "tag">) {
  if (r.action === "file") return "File automatically";
  if (r.action === "tag") return `Tag ${r.tag?.name ?? "—"}`;
  return "Ask me first";
}
