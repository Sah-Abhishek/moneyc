import type { TagGroup } from "../../lib/types.ts";
import { all, insertId, one, run, withTx } from "../db/index.ts";
import { MAX_TAG_GROUPS } from "../validation.ts";
import { ConflictError, NotFoundError, nowUtc, UserError, type Ctx } from "./context.ts";

// Tag groups: named sets of spending tags ("Health": Healthy, Junk, Leisure)
// that reports and the ledger can be read through. A tag can be in any number
// of groups; deleting a tag takes it out of every group (ON DELETE CASCADE).

export interface TagGroupInput {
  name: string;
  tagIds: number[];
}

export async function listGroups(ctx: Ctx): Promise<TagGroup[]> {
  const [groups, members] = await Promise.all([
    all<{ id: number; name: string }>(ctx.db, "SELECT id, name FROM tag_groups WHERE user_id = ? ORDER BY lower(name), id", [ctx.userId]),
    all<{ group_id: number; tag_id: number }>(
      ctx.db,
      `SELECT m.group_id, m.tag_id FROM tag_group_tags m JOIN tags t ON t.id = m.tag_id
       WHERE m.user_id = ? ORDER BY lower(t.name), t.id`,
      [ctx.userId],
    ),
  ]);
  return groups.map((g) => ({ id: g.id, name: g.name, tagIds: members.filter((m) => m.group_id === g.id).map((m) => m.tag_id) }));
}

export async function getGroup(ctx: Ctx, id: number): Promise<TagGroup> {
  const group = (await listGroups(ctx)).find((g) => g.id === id);
  if (!group) throw new NotFoundError("That group no longer exists. It may have been deleted in another tab.");
  return group;
}

async function check(ctx: Ctx, input: TagGroupInput, exceptId?: number) {
  const taken = await one(ctx.db, "SELECT 1 FROM tag_groups WHERE user_id = ? AND lower(name) = lower(?) AND id IS DISTINCT FROM ?::bigint", [
    ctx.userId, input.name, exceptId ?? null,
  ]);
  if (taken) throw new UserError(`You already have a group called “${input.name}”`, { name: "That name is taken" });
  const found = await all<{ id: number; kind: string }>(ctx.db, "SELECT id, kind FROM tags WHERE user_id = ? AND id = ANY(?::bigint[])", [
    ctx.userId, input.tagIds,
  ]);
  if (found.length !== input.tagIds.length)
    throw new ConflictError("One of those tags no longer exists. It may have been deleted in another tab — reload and choose again.");
  if (found.some((t) => t.kind !== "spend")) throw new UserError("Groups are for spending tags. Take the income tags out.", { tagIds: "Only spending tags" });
}

async function setMembers(ctx: Ctx, groupId: number, tagIds: number[]) {
  await run(ctx.db, "DELETE FROM tag_group_tags WHERE group_id = ? AND user_id = ?", [groupId, ctx.userId]);
  for (const tagId of tagIds) await run(ctx.db, "INSERT INTO tag_group_tags (group_id, tag_id, user_id) VALUES (?, ?, ?)", [groupId, tagId, ctx.userId]);
}

export function createGroup(ctx: Ctx, input: TagGroupInput): Promise<TagGroup> {
  return withTx(ctx, async (ctx) => {
    const { n } = (await one<{ n: number }>(ctx.db, "SELECT COUNT(*) AS n FROM tag_groups WHERE user_id = ?", [ctx.userId]))!;
    if (n >= MAX_TAG_GROUPS) throw new UserError(`You can have up to ${MAX_TAG_GROUPS} groups. Delete one you no longer use first.`);
    await check(ctx, input);
    const id = await insertId(ctx.db, "INSERT INTO tag_groups (user_id, name, created_at) VALUES (?, ?, ?)", [ctx.userId, input.name, nowUtc()]);
    await setMembers(ctx, id, input.tagIds);
    return getGroup(ctx, id);
  });
}

export function updateGroup(ctx: Ctx, id: number, input: TagGroupInput): Promise<TagGroup> {
  return withTx(ctx, async (ctx) => {
    await getGroup(ctx, id);
    await check(ctx, input, id);
    await run(ctx.db, "UPDATE tag_groups SET name = ? WHERE id = ? AND user_id = ?", [input.name, id, ctx.userId]);
    await setMembers(ctx, id, input.tagIds);
    return getGroup(ctx, id);
  });
}

/** Deletes the group only. Its tags and their lines stay as they are. */
export async function deleteGroup(ctx: Ctx, id: number) {
  const { changes } = await run(ctx.db, "DELETE FROM tag_groups WHERE id = ? AND user_id = ?", [id, ctx.userId]);
  if (!changes) throw new NotFoundError("That group was already deleted.");
}
