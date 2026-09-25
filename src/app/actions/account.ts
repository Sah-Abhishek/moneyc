"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { act, db, SESSION_COOKIE } from "@/server/app";
import { revokeGrant } from "@/server/auth/google";
import { destroySession } from "@/server/auth/sessions";
import { loadConfig } from "@/server/env";
import { log } from "@/server/log";
import { UserError } from "@/server/services/context";
import { deleteUser, setMailSenders, updateSettings } from "@/server/services/users";
import { mailSendersInput, parseInput, settingsInput } from "@/server/validation";

export async function signOutAction() {
  const jar = await cookies();
  await destroySession(db(), jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  redirect("/welcome");
}

export async function saveSettingsAction(form: FormData) {
  return act("settings.save", async ({ ctx }) => {
    await updateSettings(ctx, parseInput(settingsInput, {
      monthlyBudget: form.get("monthlyBudget") ?? "", timezone: form.get("timezone"), autoFile: form.get("autoFile") === "on",
    }));
    revalidatePath("/", "layout");
    return { ok: true, message: "Settings saved." };
  });
}

/** Chooses which senders the wire reads. Mail already on the wire stays. */
export async function saveMailSendersAction(form: FormData) {
  return act("settings.mail_senders", async ({ ctx }) => {
    const senders = parseInput(mailSendersInput, { scope: form.get("scope"), senders: form.get("senders") ?? "" });
    const { widened } = await setMailSenders(ctx, senders);
    revalidatePath("/", "layout");
    const who = senders.length ? `only ${senders.length === 1 ? senders[0] : `${senders.length} senders`}` : "every bank we know";
    return { ok: true, message: widened ? `Reading ${who}. The next read looks back to the day you joined.` : `Reading ${who}.` };
  });
}

/** Stops reading mail: revokes our access at Google. The book stays. */
export async function disconnectGmailAction() {
  return act("settings.disconnect", async ({ ctx }) => {
    const cfg = loadConfig();
    if (!cfg.ok) throw new UserError("Mail sync isn't set up on this server.");
    await revokeGrant(ctx.db, cfg.config, ctx.userId);
    log.info("gmail.disconnected", { userId: ctx.userId });
    revalidatePath("/", "layout");
    return { ok: true, message: "Gmail disconnected. Nothing new will be read until you reconnect." };
  });
}

/** Deletes the account and everything in it, after the user types their email to confirm. */
export async function deleteAccountAction(form: FormData) {
  const r = await act("settings.delete_account", async ({ user, ctx }) => {
    if (String(form.get("confirm") ?? "").trim().toLowerCase() !== user.email.toLowerCase())
      throw new UserError("Type your email address exactly to confirm.", { confirm: "This doesn't match your email" });
    const cfg = loadConfig();
    if (cfg.ok) await revokeGrant(ctx.db, cfg.config, ctx.userId);
    await deleteUser(ctx.db, ctx.userId); // sessions go with it (FK cascade)
    log.info("account.deleted", { userId: ctx.userId });
  });
  if (!r.ok) return r;
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/welcome?deleted=1");
}
