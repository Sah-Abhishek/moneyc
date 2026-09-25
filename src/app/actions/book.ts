"use server";

// Tags, budgets and standing rules.

import { revalidatePath } from "next/cache";
import { act } from "@/server/app";
import { withTx } from "@/server/db/index";
import { createRule, deleteRule, moveRule, updateRule } from "@/server/services/rules";
import { createTag, deleteTag, mergeTags, setTagBudget, updateTag } from "@/server/services/tags";
import { setMonthlyBudget } from "@/server/services/users";
import { idField, parseInput, ruleInput, settingsInput, tagInput } from "@/server/validation";
import { parsePaise } from "@/lib/money";
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

export async function setBudgetsAction(form: FormData) {
  return act("budgets.save", async ({ ctx }) => {
    const monthly = parseInput(settingsInput.shape.monthlyBudget, form.get("monthly") ?? "");
    const perTag: [number, number | null][] = [];
    const errors: Record<string, string> = {};
    for (const [k, v] of form.entries()) {
      const m = k.match(/^tag-(\d+)$/);
      if (!m) continue;
      const raw = String(v).trim();
      const paise = raw ? parsePaise(raw) : null;
      if (raw && paise == null) errors[k] = "Enter an amount like 5,000";
      perTag.push([Number(m[1]), paise]);
    }
    if (Object.keys(errors).length) throw new UserError("Some budgets aren't amounts yet.", errors);
    // All or nothing: a tag deleted in another tab must not leave half the budgets saved.
    await withTx(ctx, async (ctx) => {
      await setMonthlyBudget(ctx, monthly);
      for (const [id, paise] of perTag) await setTagBudget(ctx, id, paise);
    });
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
