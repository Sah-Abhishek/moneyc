"use client";

import { useState, useTransition } from "react";
import { deleteAccountAction, disconnectGmailAction, saveMailSendersAction, saveSettingsAction, signOutAction } from "@/app/actions/account";
import { rupeesExact } from "@/lib/money";
import { ConfirmButton, FieldError, FormError } from "./ui/Confirm";
import { useToast } from "./ui/Toaster";
import { callAction, useSubmit } from "./ui/useSubmit";
import s from "./SettingsForms.module.css";

type Connection = "connected" | "reconnect" | "no_gmail_scope" | "not_configured";

export function SettingsForms(p: {
  email: string;
  timezone: string;
  zones: string[];
  monthlyBudget: number | null;
  autoFile: boolean;
  connection: Connection;
  lastSync: string | null;
  lastError: string | null;
  mailSenders: string[];
  bankCount: number;
}) {
  const toast = useToast();
  const save = useSubmit(saveSettingsAction, { onSuccess: (r) => toast({ tone: "info", message: r.message ?? "Saved." }) });
  const del = useSubmit(deleteAccountAction);
  const [disconnecting, start] = useTransition();
  const [confirmText, setConfirmText] = useState("");

  return (
    <div className={s.stack}>
      <section className={s.section} aria-labelledby="set-book">
        <h3 id="set-book" className={s.title}>
          The book
        </h3>
        <form onSubmit={save.onSubmit} className="form-rows" noValidate>
          <div className="form-row">
            <label htmlFor="set-budget">Monthly budget</label>
            <div>
              <input id="set-budget" name="monthlyBudget" className="input mono" inputMode="decimal" defaultValue={p.monthlyBudget != null ? rupeesExact(p.monthlyBudget) : ""} placeholder="No limit" aria-invalid={!!save.fieldErrors.monthlyBudget || undefined} />
              <FieldError id="set-budget-err" message={save.fieldErrors.monthlyBudget} />
            </div>
          </div>
          <div className="form-row">
            <label htmlFor="set-tz">Timezone</label>
            <div>
              <select id="set-tz" name="timezone" className="select" defaultValue={p.timezone}>
                {p.zones.map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <span className="hint">Decides which day a payment falls on. Existing lines keep the time they were written with.</span>
              <FieldError id="set-tz-err" message={save.fieldErrors.timezone} />
            </div>
          </div>
          <div className="form-row">
            <label htmlFor="set-auto">Auto-file</label>
            <div>
              <label className={s.check}>
                <input id="set-auto" type="checkbox" name="autoFile" defaultChecked={p.autoFile} />
                File mail automatically when a rule or my history makes it certain
              </label>
              <span className="hint">Duplicates, slate payments, incomplete mail and anything a rule says to ask about always wait for you.</span>
            </div>
          </div>
          <div className={s.actions}>
            <FormError message={save.error} />
            <button type="submit" className="btn btn-ink" disabled={save.pending}>
              {save.pending ? "Saving…" : "Save settings"}
            </button>
          </div>
        </form>
      </section>

      <section className={s.section} aria-labelledby="set-mail">
        <h3 id="set-mail" className={s.title}>
          The wire
        </h3>
        <dl className={s.facts}>
          <div>
            <dt>Gmail</dt>
            <dd>
              {p.email} ·{" "}
              {p.connection === "connected" ? "connected, read-only" : p.connection === "not_configured" ? "sync not set up on this server" : p.connection === "no_gmail_scope" ? "mail access not allowed" : "disconnected"}
            </dd>
          </div>
          <div>
            <dt>Last read</dt>
            <dd>{p.lastSync ?? "never"}</dd>
          </div>
          {p.lastError && (
            <div>
              <dt>Last problem</dt>
              <dd className={s.err}>{p.lastError}</dd>
            </div>
          )}
        </dl>
        <div className={s.actions}>
          {p.connection !== "connected" && p.connection !== "not_configured" && (
            <a className="btn btn-ink" href="/auth/google?next=/settings">
              {p.connection === "no_gmail_scope" ? "Allow mail access" : "Reconnect Gmail"}
            </a>
          )}
          {p.connection === "connected" && (
            <ConfirmButton
              label="Disconnect Gmail"
              question="Stop reading your mail? Your book stays."
              confirmLabel="Disconnect"
              pending={disconnecting}
              onConfirm={() =>
                start(async () => {
                  const r = await callAction(() => disconnectGmailAction());
                  toast(r.ok ? { tone: "info", message: r.message ?? "Disconnected." } : { tone: "error", message: r.error });
                })
              }
            />
          )}
        </div>

        <MailSendersForm senders={p.mailSenders} bankCount={p.bankCount} />
      </section>

      <section className={s.section} aria-labelledby="set-account">
        <h3 id="set-account" className={s.title}>
          Your account
        </h3>
        <form action={signOutAction} className={s.actions}>
          <button type="submit" className="btn btn-line">
            Sign out
          </button>
        </form>

        <form onSubmit={del.onSubmit} className={s.danger} noValidate>
          <h4 className="eyebrow">Delete the account</h4>
          <p>
            This permanently deletes every line, tag, rule, slate account and stored mail, and revokes our access to Gmail. It can&apos;t
            be undone. Export anything you want to keep first.
          </p>
          <label htmlFor="del-confirm" className="hint">
            Type <strong>{p.email}</strong> to confirm
          </label>
          <input id="del-confirm" name="confirm" className="input mono" autoComplete="off" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} aria-invalid={!!del.fieldErrors.confirm || undefined} />
          <FieldError id="del-confirm-err" message={del.fieldErrors.confirm} />
          <FormError message={del.fieldErrors.confirm ? null : del.error} />
          <button type="submit" className="btn btn-danger" disabled={del.pending || confirmText.trim().toLowerCase() !== p.email.toLowerCase()}>
            {del.pending ? "Deleting…" : "Delete everything"}
          </button>
        </form>
      </section>
    </div>
  );
}

/** "Read mail from": every known bank, or only the senders listed here. */
function MailSendersForm(p: { senders: string[]; bankCount: number }) {
  const toast = useToast();
  const save = useSubmit(saveMailSendersAction, { onSuccess: (r) => toast({ tone: "info", message: r.message ?? "Saved." }) });
  const [scope, setScope] = useState<"banks" | "only">(p.senders.length ? "only" : "banks");

  return (
    <form onSubmit={save.onSubmit} className="form-rows" noValidate>
      <div className="form-row">
        <span className="form-label" id="set-from-label">
          Read mail from
        </span>
        <div>
          <div className="segmented" role="radiogroup" aria-labelledby="set-from-label">
            <label>
              <input type="radio" name="scope" value="banks" checked={scope === "banks"} onChange={() => setScope("banks")} />
              <span>Every bank we know</span>
            </label>
            <label>
              <input type="radio" name="scope" value="only" checked={scope === "only"} onChange={() => setScope("only")} />
              <span>Only these senders</span>
            </label>
          </div>
          <span className="hint">
            {scope === "banks"
              ? `Alerts from ${p.bankCount} banks and wallets, plus any sender named in your rules.`
              : "Nothing else in your inbox is searched — not even senders named in your rules."}
          </span>
        </div>
      </div>
      {/* Hidden, not removed, so switching back and forth keeps what was typed. */}
      <div className="form-row" hidden={scope !== "only"}>
        <label htmlFor="set-senders">Senders</label>
        <div>
          <textarea
            id="set-senders"
            name="senders"
            className="textarea mono"
            defaultValue={p.senders.join("\n")}
            placeholder={"noreplyubi-txn@ubi.bank.in\nalerts@hdfcbank.net"}
            spellCheck={false}
            autoCapitalize="off"
            aria-invalid={!!save.fieldErrors.senders || undefined}
            aria-describedby="set-senders-hint set-senders-err"
          />
          <span className="hint" id="set-senders-hint">
            One per line — a full address, or a domain like hdfcbank.net for every address at that bank.
          </span>
          <FieldError id="set-senders-err" message={save.fieldErrors.senders} />
        </div>
      </div>
      <div className={s.actions}>
        <FormError message={save.fieldErrors.senders ? null : save.error} />
        <button type="submit" className="btn btn-ink" disabled={save.pending}>
          {save.pending ? "Saving…" : "Save senders"}
        </button>
      </div>
    </form>
  );
}
