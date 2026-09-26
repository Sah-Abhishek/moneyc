"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/app";
import {
  addSlateLine, deletePerson, deleteSlateLine, getAccount, linkEntryToPerson, openAccount, remind, setArchived, setPromise, settleUp, unlinkEntry, updatePerson,
} from "@/server/services/slate";
import { idField, parseInput, personInput, settleInput, slateLineInput } from "@/server/validation";

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
    const id = await openAccount(ctx, input, first);
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

export async function settleUpAction(form: FormData) {
  return act("slate.settle", async ({ ctx }) => {
    const input = parseInput(settleInput, {
      personId: form.get("personId"), amount: form.get("amount"), promisedBy: form.get("promisedBy"),
      occurredAt: form.get("occurredAt"), clientKey: form.get("clientKey"),
    });
    const { account } = await getAccount(ctx, input.personId);
    const r = await settleUp(ctx, input);
    refresh();
    return { ok: true, message: r.duplicate ? "That was already recorded." : r.rest ? `Recorded. ${account.name} still has some to return.` : `Settled with ${account.name}.` };
  });
}

export async function clearPromiseAction(personId: number) {
  return act("slate.promise_clear", async ({ ctx }) => {
    await setPromise(ctx, parseInput(idField("Person"), personId), null);
    refresh();
    return { ok: true, message: "Promise removed. The balance stays." };
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
    const r = await remind(ctx, parseInput(idField("Person"), personId));
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
