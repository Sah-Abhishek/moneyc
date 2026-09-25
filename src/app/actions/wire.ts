"use server";

import { revalidatePath } from "next/cache";
import { act, runSync } from "@/server/app";
import { UserError } from "@/server/services/context";
import { setAutoFile } from "@/server/services/users";
import { deleteMail, fileMail, ignoreMail, markDuplicate, restoreFromDuplicate, restoreMail, unfileMail } from "@/server/services/wire";
import { amountField, cashChoice, idField, parseInput } from "@/server/validation";
import { z } from "zod";

const refresh = () => revalidatePath("/", "layout");

export async function fileSlipAction(form: FormData) {
  return act<{ id: number }>("wire.file", async ({ ctx }) => {
    const mailId = parseInput(idField("Mail"), form.get("id"));
    const tagRaw = form.get("tag");
    const personRaw = form.get("person");
    const editing = form.get("editing") === "1";
    const entry = await fileMail(ctx, mailId, {
      payee: editing ? parseInput(z.string().trim().min(1, "Who was it?").max(120), form.get("payee")) : null,
      amount: editing ? parseInput(amountField, form.get("amount")) : null,
      tagId: tagRaw ? parseInput(idField("Tag"), tagRaw) : null,
      personId: personRaw ? parseInput(idField("Person"), personRaw) : null,
      cash: form.get("cash") ? parseInput(cashChoice, form.get("cash")) : null,
    });
    refresh();
    return { ok: true, data: { id: entry.id }, message: personRaw ? `Put ${entry.payee} on the slate.` : `Filed ${entry.payee}.` };
  });
}

export async function unfileSlipAction(id: number) {
  return act("wire.unfile", async ({ ctx }) => {
    await unfileMail(ctx, parseInput(idField("Mail"), id));
    refresh();
    return { ok: true, message: "Back on the desk." };
  });
}

export async function unmarkDuplicateAction(id: number) {
  return act("wire.unduplicate", async ({ ctx }) => {
    await restoreFromDuplicate(ctx, parseInput(idField("Mail"), id));
    refresh();
    return { ok: true, message: "Back on the desk." };
  });
}

export async function ignoreSlipAction(id: number) {
  return act("wire.ignore", async ({ ctx }) => {
    await ignoreMail(ctx, parseInput(idField("Mail"), id));
    refresh();
    return { ok: true, message: "Archived." };
  });
}

export async function deleteSlipAction(id: number) {
  return act("wire.delete", async ({ ctx }) => {
    await deleteMail(ctx, parseInput(idField("Mail"), id));
    refresh();
    return { ok: true, message: "Mail deleted." };
  });
}

export async function restoreSlipAction(id: number) {
  return act("wire.restore", async ({ ctx }) => {
    await restoreMail(ctx, parseInput(idField("Mail"), id));
    refresh();
    return { ok: true, message: "Back on the desk." };
  });
}

export async function markDuplicateAction(mailId: number, entryId: number) {
  return act("wire.duplicate", async ({ ctx }) => {
    await markDuplicate(ctx, parseInput(idField("Mail"), mailId), parseInput(idField("Line"), entryId));
    refresh();
    return { ok: true, message: "Matched to the line you already had." };
  });
}

export async function syncWireAction(force: boolean) {
  return act<{ added: number; autoFiled: number; state: "done" | "busy" | "too_soon"; more: boolean }>("wire.sync", async ({ user }) => {
    const r = await runSync(user, force);
    if (r.status !== "done") return { ok: true, data: { added: 0, autoFiled: 0, state: r.status, more: false } };
    if (r.added || r.autoFiled) refresh();
    return { ok: true, data: { added: r.added, autoFiled: r.autoFiled, state: "done", more: r.more } };
  });
}

export async function setAutoFileAction(on: boolean) {
  return act("wire.autofile", async ({ ctx }) => {
    if (typeof on !== "boolean") throw new UserError("Invalid setting");
    await setAutoFile(ctx, on);
    refresh();
    return { ok: true, message: on ? "Confident mail will be filed automatically." : "Every mail will wait for you." };
  });
}
