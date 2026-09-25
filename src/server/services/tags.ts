import type { Tag, TagColor } from "../../lib/types.ts";
import { all, insertId, one, run, withTx } from "../db/index.ts";
import { ConflictError, NotFoundError, nowUtc, UserError, type Ctx } from "./context.ts";

interface TagRow {
  id: number; name: string; color: TagColor; kind: "spend" | "income"; budget: number | null;
}

export function listTags(ctx: Ctx): Promise<Tag[]> {
  return all<TagRow>(ctx.db, "SELECT id, name, color, kind, budget FROM tags WHERE user_id = ? ORDER BY kind DESC, lower(name), id", [ctx.userId]);
}

export async function tagMap(ctx: Ctx): Promise<Map<number, Tag>> {
  return new Map((await listTags(ctx)).map((t) => [t.id, t]));
}

export async function getTag(ctx: Ctx, id: number): Promise<Tag> {
  const t = await one<TagRow>(ctx.db, "SELECT id, name, color, kind, budget FROM tags WHERE id = ? AND user_id = ?", [id, ctx.userId]);
  if (!t) throw new NotFoundError("That tag no longer exists. It may have been deleted in another tab.");
  return t;
}

/** Throws unless `id` is null or a tag owned by this user. */
export async function assertTag(ctx: Ctx, id: number | null) {
  if (id != null) await getTag(ctx, id);
}

async function nameTaken(ctx: Ctx, name: string, exceptId?: number) {
  return !!await one(ctx.db, "SELECT 1 FROM tags WHERE user_id = ? AND lower(name) = lower(?) AND id IS DISTINCT FROM ?::bigint", [ctx.userId, name, exceptId ?? null]);
}

type TagInput = { name: string; color: TagColor; kind: "spend" | "income"; budget: number | null };

export function createTag(ctx: Ctx, input: TagInput): Promise<Tag> {
  return withTx(ctx, async (ctx) => {
    if (await nameTaken(ctx, input.name)) throw new UserError(`You already have a tag called “${input.name}”`, { name: "That name is taken" });
    const id = await insertId(ctx.db, "INSERT INTO tags (user_id, name, color, kind, budget, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
      ctx.userId, input.name, input.color, input.kind, input.budget, nowUtc(),
    ]);
    return getTag(ctx, id);
  });
}

export function updateTag(ctx: Ctx, id: number, input: TagInput): Promise<Tag> {
  return withTx(ctx, async (ctx) => {
    await getTag(ctx, id);
    if (await nameTaken(ctx, input.name, id)) throw new UserError(`You already have a tag called “${input.name}”`, { name: "That name is taken" });
    await run(ctx.db, "UPDATE tags SET name = ?, color = ?, kind = ?, budget = ? WHERE id = ? AND user_id = ?", [
      input.name, input.color, input.kind, input.budget, id, ctx.userId,
    ]);
    return getTag(ctx, id);
  });
}

export async function setTagBudget(ctx: Ctx, id: number, budget: number | null) {
  await getTag(ctx, id);
  await run(ctx.db, "UPDATE tags SET budget = ? WHERE id = ? AND user_id = ?", [budget, id, ctx.userId]);
}

/**
 * Saves the monthly budget and each listed tag's budget together: a tag
 * deleted meanwhile (another tab, the phone) fails the whole save, never half of it.
 */
export async function saveBudgets(ctx: Ctx, monthly: number | null, perTag: [number, number | null][]) {
  await withTx(ctx, async (ctx) => {
    await run(ctx.db, "UPDATE users SET monthly_budget = ? WHERE id = ?", [monthly, ctx.userId]);
    for (const [id, paise] of perTag) await setTagBudget(ctx, id, paise);
  });
}

/** Moves every line (and rule) stamped `fromId` onto `intoId`, then removes `fromId`. */
export function mergeTags(ctx: Ctx, fromId: number, intoId: number): Promise<{ moved: number }> {
  if (fromId === intoId) return Promise.reject(new UserError("Choose two different tags to merge"));
  return withTx(ctx, async (ctx) => {
    await getTag(ctx, fromId);
    await getTag(ctx, intoId);
    const moved = (await run(ctx.db, "UPDATE entries SET tag_id = ?, updated_at = ?, version = version + 1 WHERE tag_id = ? AND user_id = ?", [intoId, nowUtc(), fromId, ctx.userId])).changes;
    await run(ctx.db, "UPDATE rules SET tag_id = ? WHERE tag_id = ? AND user_id = ?", [intoId, fromId, ctx.userId]);
    await run(ctx.db, "DELETE FROM tags WHERE id = ? AND user_id = ?", [fromId, ctx.userId]);
    return { moved };
  });
}

/** Deletes a tag. Lines keep their amounts and become untagged; rules that stamp it are removed. */
export function deleteTag(ctx: Ctx, id: number): Promise<{ untagged: number; rulesRemoved: number }> {
  return withTx(ctx, async (ctx) => {
    await getTag(ctx, id);
    const untagged = (await run(ctx.db, "UPDATE entries SET tag_id = NULL, updated_at = ?, version = version + 1 WHERE tag_id = ? AND user_id = ?", [nowUtc(), id, ctx.userId])).changes;
    const rulesRemoved = (await run(ctx.db, "DELETE FROM rules WHERE tag_id = ? AND user_id = ?", [id, ctx.userId])).changes;
    const gone = (await run(ctx.db, "DELETE FROM tags WHERE id = ? AND user_id = ?", [id, ctx.userId])).changes;
    if (!gone) throw new ConflictError("That tag was already deleted.");
    return { untagged, rulesRemoved };
  });
}

export async function tagUsage(ctx: Ctx): Promise<Map<number, { entries: number; rules: number }>> {
  const rows = await all<{ id: number; entries: number; rules: number }>(
    ctx.db,
    `SELECT t.id,
       (SELECT COUNT(*) FROM entries e WHERE e.tag_id = t.id AND e.deleted_at IS NULL) AS entries,
       (SELECT COUNT(*) FROM rules r WHERE r.tag_id = t.id) AS rules
     FROM tags t WHERE t.user_id = ?`,
    [ctx.userId],
  );
  return new Map(rows.map((r) => [r.id, { entries: r.entries, rules: r.rules }]));
}
