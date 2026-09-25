"use server";

import { revalidatePath } from "next/cache";
import { rupees } from "@/lib/money";
import { act } from "@/server/app";
import { UserError } from "@/server/services/context";
import {
  addSlateLine, createPerson, deletePerson, deleteSlateLine, getAccount, linkEntryToPerson, recordReminder, setArchived, unlinkEntry, updatePerson,
} from "@/server/services/slate";
import { withTx } from "@/server/db/index";
import { idField, parseInput, personInput, slateLineInput } from "@/server/validation";

const refresh = () => revalidatePath("/", "layout");
const personFields = (form: FormData) => ({
  name: form.get("name"), matchNames: form.get("matchNames") ?? "", phone: form.get("phone") ?? "", note: form.get("note") ?? "",
});

export async function createPersonAction(form: FormData) {
  return act<{ id: number }>("slate.person_create", async ({ ctx }) => {
    const input = parseInput(personInput, personFields(form));
    // "Lend to someone": the account can open with its first line. Validate
    // both before writing either, and write both or neither.
    const amount = String(form.get("amount") ?? "").trim();
    const first = amount
      ? parseInput(slateLineInput.omit({ personId: true }), {
          amount, direction: form.get("direction"), occurredAt: form.get("occurredAt"),
          note: form.get("lineNote") || (form.get("direction") === "got" ? "Borrowed" : "Lent"), clientKey: form.get("clientKey"),
        })
      : null;
    const id = await withTx(ctx, async (ctx) => {
      const personId = await createPerson(ctx, input);
      if (first) await addSlateLine(ctx, { ...first, personId });
      return personId;
    });
    refresh();
    return { ok: true, data: { id }, message: `Opened an account for ${input.name}.` };
  });
}

export async function updatePersonAction(form: FormData) {
  return act("slate.person_update", async ({ ctx }) => {
    await updatePerson(ctx, parseInput(idField("Person"), form.get("id")), parseInput(personInput, personFields(form)));
    refresh();
    return { ok: true, message: "Saved." };
  });
}

export async function addSlateLineAction(form: FormData) {
  return act("slate.line_add", async ({ ctx }) => {
    const r = await addSlateLine(ctx, parseInput(slateLineInput, {
      personId: form.get("personId"), amount: form.get("amount"), direction: form.get("direction"),
      occurredAt: form.get("occurredAt"), note: form.get("note"), clientKey: form.get("clientKey"),
    }));
    refresh();
    return { ok: true, message: r.duplicate ? "That line was already recorded." : "Recorded on the slate." };
  });
}

export async function deleteSlateLineAction(id: number) {
  return act("slate.line_delete", async ({ ctx }) => {
    await deleteSlateLine(ctx, parseInput(idField("Line"), id));
    refresh();
    return { ok: true, message: "Removed from the slate." };
  });
}

export async function linkEntryAction(entryId: number, personId: number) {
  return act("slate.link", async ({ ctx }) => {
    const e = parseInput(idField("Line"), entryId);
    const p = parseInput(idField("Person"), personId);
    const { account } = await getAccount(ctx, p);
    await linkEntryToPerson(ctx, e, p, "Moved from the ledger");
    refresh();
    return { ok: true, message: `Put on ${account.name}'s slate.` };
  });
}

export async function unlinkEntryAction(entryId: number) {
  return act("slate.unlink", async ({ ctx }) => {
    await unlinkEntry(ctx, parseInput(idField("Line"), entryId));
    refresh();
    return { ok: true, message: "Taken off the slate. It's an ordinary line again." };
  });
}

export async function remindAction(personId: number) {
  return act<{ text: string; phone: string | null }>("slate.remind", async ({ ctx }) => {
    const id = parseInput(idField("Person"), personId);
    const { account } = await getAccount(ctx, id);
    if (account.balance <= 0) throw new UserError(`${account.name} doesn't owe you anything right now.`);
    const r = await recordReminder(ctx, id, rupees(account.balance));
    refresh();
    return { ok: true, data: r };
  });
}

export async function archivePersonAction(id: number, archived: boolean) {
  return act("slate.archive", async ({ ctx }) => {
    await setArchived(ctx, parseInput(idField("Person"), id), archived === true);
    refresh();
    return { ok: true, message: archived ? "Account archived." : "Account restored." };
  });
}

export async function deletePersonAction(id: number) {
  return act("slate.person_delete", async ({ ctx }) => {
    await deletePerson(ctx, parseInput(idField("Person"), id));
    refresh();
    return { ok: true, message: "Account removed." };
  });
}
