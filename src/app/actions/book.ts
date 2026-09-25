"use server";

// Tags, budgets and standing rules.

import { revalidatePath } from "next/cache";
import { act } from "@/server/app";
import { createRule, deleteRule, moveRule, updateRule } from "@/server/services/rules";
import { createGroup, deleteGroup, updateGroup } from "@/server/services/tagGroups";
import { createTag, deleteTag, mergeTags, saveBudgets, updateTag } from "@/server/services/tags";
import { idField, parseBudgets, parseInput, ruleInput, tagGroupInput, tagInput } from "@/server/validation";
import { UserError } from "@/server/services/context";

const refresh = () => revalidatePath("/", "layout");
const tagFields = (form: FormData) => ({
  name: form.get("name"), color: form.get("color"), kind: form.get("kind") ?? "spend", budget: form.get("budget") ?? "",
});

export async function createTagAction(form: FormData) {
  return act<{ id: number }>("tags.create", async ({ ctx }) => {
    const tag = await createTag(ctx, parseInput(tagInput, tagFields(form)));
    refresh();
    return { ok: true, data: { id: tag.id }, message: `Added the ${tag.name} stamp.` };
  });
}

export async function updateTagAction(form: FormData) {
  return act("tags.update", async ({ ctx }) => {
    const tag = await updateTag(ctx, parseInput(idField("Tag"), form.get("id")), parseInput(tagInput, tagFields(form)));
    refresh();
    return { ok: true, message: `Saved ${tag.name}.` };
  });
}

export async function mergeTagsAction(form: FormData) {
  return act("tags.merge", async ({ ctx }) => {
    const r = await mergeTags(ctx, parseInput(idField("Tag"), form.get("from")), parseInput(idField("Tag to merge into"), form.get("into")));
    refresh();
    return { ok: true, message: `Merged. ${r.moved} line${r.moved === 1 ? "" : "s"} moved.` };
  });
}

export async function deleteTagAction(id: number) {
  return act("tags.delete", async ({ ctx }) => {
    const r = await deleteTag(ctx, parseInput(idField("Tag"), id));
    refresh();
    return { ok: true, message: `Tag deleted. ${r.untagged} line${r.untagged === 1 ? " is" : "s are"} now untagged${r.rulesRemoved ? `, ${r.rulesRemoved} rule${r.rulesRemoved === 1 ? "" : "s"} removed` : ""}.` };
  });
}

const groupFields = (form: FormData) => ({ name: form.get("name"), tagIds: form.getAll("tagIds") });

export async function createGroupAction(form: FormData) {
  return act<{ id: number }>("groups.create", async ({ ctx }) => {
    const group = await createGroup(ctx, parseInput(tagGroupInput, groupFields(form)));
    refresh();
    return { ok: true, data: { id: group.id }, message: `Added the ${group.name} group.` };
  });
}

export async function updateGroupAction(form: FormData) {
  return act("groups.update", async ({ ctx }) => {
    const group = await updateGroup(ctx, parseInput(idField("Group"), form.get("id")), parseInput(tagGroupInput, groupFields(form)));
    refresh();
    return { ok: true, message: `Saved ${group.name}.` };
  });
}

export async function deleteGroupAction(id: number) {
  return act("groups.delete", async ({ ctx }) => {
    await deleteGroup(ctx, parseInput(idField("Group"), id));
    refresh();
    return { ok: true, message: "Group deleted. Its tags and lines are unchanged." };
  });
}

export async function setBudgetsAction(form: FormData) {
  return act("budgets.save", async ({ ctx }) => {
    const perTagRaw = [...form.entries()].flatMap(([k, v]): [string, unknown][] => (k.match(/^tag-(\d+)$/) ? [[k.slice(4), v]] : []));
    const { monthly, perTag } = parseBudgets(form.get("monthly") ?? "", perTagRaw);
    await saveBudgets(ctx, monthly, perTag);
    refresh();
    return { ok: true, message: "Budgets saved." };
  });
}

const ruleFields = (form: FormData) => ({ field: form.get("field"), value: form.get("value"), action: form.get("action"), tagId: form.get("tagId") ?? "" });

export async function createRuleAction(form: FormData) {
  return act("rules.create", async ({ ctx }) => {
    await createRule(ctx, parseInput(ruleInput, ruleFields(form)));
    refresh();
    return { ok: true, message: "Rule added. It applies to new mail from now on." };
  });
}

export async function updateRuleAction(form: FormData) {
  return act("rules.update", async ({ ctx }) => {
    await updateRule(ctx, parseInput(idField("Rule"), form.get("id")), parseInput(ruleInput, ruleFields(form)));
    refresh();
    return { ok: true, message: "Rule saved." };
  });
}

export async function deleteRuleAction(id: number) {
  return act("rules.delete", async ({ ctx }) => {
    await deleteRule(ctx, parseInput(idField("Rule"), id));
    refresh();
    return { ok: true, message: "Rule removed." };
  });
}

export async function moveRuleAction(id: number, direction: "up" | "down") {
  return act("rules.move", async ({ ctx }) => {
    if (direction !== "up" && direction !== "down") throw new UserError("Invalid move");
    await moveRule(ctx, parseInput(idField("Rule"), id), direction);
    refresh();
  });
}
