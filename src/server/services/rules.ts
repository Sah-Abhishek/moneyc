import type { Rule, RuleAction, RuleField, TagColor } from "../../lib/types.ts";
import { all, insertId, one, run, withTx } from "../db/index.ts";
import type { EngineRule } from "../rules-engine.ts";
import { NotFoundError, nowUtc, UserError, type Ctx } from "./context.ts";
import { assertTag } from "./tags.ts";

interface RuleRow {
  id: number; field: RuleField; value: string; action: RuleAction; tag_id: number | null; position: number;
  tag_name: string | null; tag_color: TagColor | null; tag_kind: "spend" | "income" | null; tag_budget: number | null;
}

const SELECT = `SELECT r.*, t.name AS tag_name, t.color AS tag_color, t.kind AS tag_kind, t.budget AS tag_budget
  FROM rules r LEFT JOIN tags t ON t.id = r.tag_id`;

export async function listRules(ctx: Ctx): Promise<Rule[]> {
  return (await all<RuleRow>(ctx.db, `${SELECT} WHERE r.user_id = ? ORDER BY r.position, r.id`, [ctx.userId])).map((r) => ({
    id: r.id, field: r.field, value: r.value, action: r.action, position: r.position,
    tag: r.tag_id == null ? null : { id: r.tag_id, name: r.tag_name!, color: r.tag_color!, kind: r.tag_kind!, budget: r.tag_budget },
  }));
}

export async function engineRules(ctx: Ctx): Promise<EngineRule[]> {
  return (await listRules(ctx)).map((r) => ({ id: r.id, field: r.field, value: r.value, action: r.action, tagId: r.tag?.id ?? null }));
}

function normaliseValue(field: RuleField, value: string) {
  return field === "sender" ? value.trim().toLowerCase().replace(/^@/, "") : field === "payee_prefix" ? value.trim().toUpperCase() : value.trim();
}

type RuleInput = { field: RuleField; value: string; action: RuleAction; tagId: number | null };

async function check(ctx: Ctx, input: RuleInput, exceptId?: number) {
  if (input.action === "tag") await assertTag(ctx, input.tagId);
  if (input.field === "amount_over" && input.action === "tag")
    throw new UserError("An amount rule can ask you or file automatically, but it can't choose a tag.", { action: "Choose Ask me first or File automatically" });
  const dup = await one(
    ctx.db,
    "SELECT 1 FROM rules WHERE user_id = ? AND field = ? AND value = ? AND action = ? AND tag_id IS NOT DISTINCT FROM ?::bigint AND id IS DISTINCT FROM ?::bigint",
    [ctx.userId, input.field, normaliseValue(input.field, input.value), input.action, input.action === "tag" ? input.tagId : null, exceptId ?? null],
  );
  if (dup) throw new UserError("You already have exactly this rule.");
}

export function createRule(ctx: Ctx, input: RuleInput): Promise<number> {
  return withTx(ctx, async (ctx) => {
    await check(ctx, input);
    const { next } = (await one<{ next: number }>(ctx.db, "SELECT COALESCE(MAX(position), 0) + 1 AS next FROM rules WHERE user_id = ?", [ctx.userId]))!;
    return insertId(ctx.db, "INSERT INTO rules (user_id, field, value, action, tag_id, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
      ctx.userId, input.field, normaliseValue(input.field, input.value), input.action,
      input.action === "tag" ? input.tagId : null, next, nowUtc(),
    ]);
  });
}

export async function updateRule(ctx: Ctx, id: number, input: RuleInput) {
  await withTx(ctx, async (ctx) => {
    if (!await one(ctx.db, "SELECT 1 FROM rules WHERE id = ? AND user_id = ?", [id, ctx.userId])) throw new NotFoundError("That rule no longer exists.");
    await check(ctx, input, id);
    await run(ctx.db, "UPDATE rules SET field = ?, value = ?, action = ?, tag_id = ? WHERE id = ? AND user_id = ?", [
      input.field, normaliseValue(input.field, input.value), input.action, input.action === "tag" ? input.tagId : null, id, ctx.userId,
    ]);
  });
}

export async function deleteRule(ctx: Ctx, id: number) {
  const { changes } = await run(ctx.db, "DELETE FROM rules WHERE id = ? AND user_id = ?", [id, ctx.userId]);
  if (!changes) throw new NotFoundError("That rule was already deleted.");
}

/** Swaps a rule with its neighbour. Order matters: the first matching tag rule wins. */
export async function moveRule(ctx: Ctx, id: number, direction: "up" | "down") {
  await withTx(ctx, async (ctx) => {
    const rules = await all<{ id: number; position: number }>(ctx.db, "SELECT id, position FROM rules WHERE user_id = ? ORDER BY position, id", [ctx.userId]);
    const i = rules.findIndex((r) => r.id === id);
    if (i === -1) throw new NotFoundError("That rule no longer exists.");
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= rules.length) return;
    [rules[i], rules[j]] = [rules[j], rules[i]];
    for (const [pos, r] of rules.entries()) await run(ctx.db, "UPDATE rules SET position = ? WHERE id = ? AND user_id = ?", [pos + 1, r.id, ctx.userId]);
  });
}
