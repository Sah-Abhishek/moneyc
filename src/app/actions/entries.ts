"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/app";
import { addEntry, addQuickEntry, deleteEntry, restoreEntry, updateEntry } from "@/server/services/entries";
import { entryInput, idField, parseInput, quickEntryInput } from "@/server/validation";
import { lineTitle } from "@/lib/types";
import { z } from "zod";

const refresh = () => revalidatePath("/", "layout");
const ENTRY_FIELDS = ["payee", "amount", "direction", "occurredAt", "channel", "tagId", "item", "note", "chequeNo", "cash"];

export async function addLineAction(form: FormData) {
  return act<{ id: number }>("entries.quick", async ({ ctx }) => {
    const input = parseInput(quickEntryInput, {
      payee: form.get("payee"), item: form.get("item"), amount: form.get("amount"), tagId: form.get("tag"), channel: form.get("channel"), clientKey: form.get("clientKey"),
    });
    const { entry, duplicate } = await addQuickEntry(ctx, input);
    refresh();
    return { ok: true, data: { id: entry.id }, message: duplicate ? "That line was already added." : `Added ${lineTitle(entry)}.` };
  });
}

export async function createEntryAction(form: FormData) {
  return act<{ id: number }>("entries.create", async ({ ctx }) => {
    const input = parseInput(entryInput, Object.fromEntries(ENTRY_FIELDS.map((k) => [k, form.get(k) ?? undefined])));
    const key = parseInput(z.string().min(8).max(64), form.get("clientKey"));
    const { entry, duplicate } = await addEntry(ctx, input, key);
    refresh();
    return { ok: true, data: { id: entry.id }, message: duplicate ? "That line was already added." : `Added ${lineTitle(entry)}.` };
  });
}

export async function updateEntryAction(form: FormData) {
  return act<{ id: number }>("entries.update", async ({ ctx }) => {
    const id = parseInput(idField("Line"), form.get("id"));
    const version = parseInput(z.coerce.number().int().positive(), form.get("version"));
    const input = parseInput(entryInput, Object.fromEntries(ENTRY_FIELDS.map((k) => [k, form.get(k) ?? undefined])));
    const entry = await updateEntry(ctx, id, input, version);
    refresh();
    return { ok: true, data: { id: entry.id }, message: "Saved." };
  });
}

export async function deleteEntryAction(id: number) {
  return act("entries.delete", async ({ ctx }) => {
    await deleteEntry(ctx, parseInput(idField("Line"), id));
    refresh();
    return { ok: true, message: "Line deleted." };
  });
}

export async function restoreEntryAction(id: number) {
  return act("entries.restore", async ({ ctx }) => {
    await restoreEntry(ctx, parseInput(idField("Line"), id));
    refresh();
    return { ok: true, message: "Line restored." };
  });
}
