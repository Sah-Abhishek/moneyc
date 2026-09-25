"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createEntryAction, deleteEntryAction, restoreEntryAction, updateEntryAction } from "@/app/actions/entries";
import { unlinkEntryAction } from "@/app/actions/slate";
import { rupeesExact } from "@/lib/money";
import { CHANNELS, type Entry, type Tag } from "@/lib/types";
import { ConfirmButton, FieldError, FormError } from "./ui/Confirm";
import { Select } from "./ui/Select";
import { useToast } from "./ui/Toaster";
import { callAction, newKey, useSubmit } from "./ui/useSubmit";
import s from "./EntryForm.module.css";

const MAIN_CHANNELS = ["UPI", "Card", "Cash", "Cheque"] as const;

/** The full line editor: "A new line" and editing an existing one. */
export function EntryForm({ entry, tags, defaultWhen, backHref }: { entry?: Entry; tags: Tag[]; defaultWhen: string; backHref: string }) {
  const router = useRouter();
  const toast = useToast();
  const [clientKey] = useState(newKey);
  const [dirty, setDirty] = useState(false);
  const [amount, setAmount] = useState(entry ? rupeesExact(entry.amount) : "");
  const [channel, setChannel] = useState<string>(entry?.channel ?? "UPI");
  const [direction, setDirection] = useState<"out" | "in">(!entry || entry.amount < 0 ? "out" : "in");
  // An ATM line that already exists had its answer given; a new one must be asked.
  const [cash, setCash] = useState<"wallet" | "spent" | null>(entry?.channel === "ATM" && entry.amount < 0 ? (entry.toWallet ? "wallet" : "spent") : null);
  const cashOut = channel === "ATM" && direction === "out";
  const toWallet = cashOut && cash === "wallet";
  const [deleting, setDeleting] = useState(false);

  const { onSubmit, pending, error, fieldErrors } = useSubmit(entry ? updateEntryAction : createEntryAction, {
    onSuccess: (r) => {
      setDirty(false);
      toast({ tone: "info", message: r.message ?? "Saved." });
      router.push(backHref);
    },
  });

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const err = (k: string) => fieldErrors[k];
  const describedBy = (k: string) => (err(k) ? `err-${k}` : undefined);

  async function remove() {
    if (!entry) return;
    setDeleting(true);
    const r = await callAction(() => deleteEntryAction(entry.id));
    setDeleting(false);
    if (!r.ok) return toast({ tone: "error", message: r.error });
    toast({ tone: "info", message: "Line deleted.", action: { label: "Undo", run: async () => void (await callAction(() => restoreEntryAction(entry.id))) } });
    router.push(backHref);
  }

  return (
    <form onSubmit={onSubmit} onChange={() => setDirty(true)} className={s.form} noValidate>
      {entry ? (
        <>
          <input type="hidden" name="id" value={entry.id} />
          <input type="hidden" name="version" value={entry.version} />
        </>
      ) : (
        <input type="hidden" name="clientKey" value={clientKey} />
      )}

      <div className={s.amountBlock}>
        <label htmlFor="ef-amount" className="eyebrow">
          Amount
        </label>
        <div className={s.amountLine}>
          <span className={s.rupee} aria-hidden>
            ₹
          </span>
          <input
            id="ef-amount"
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            className={s.amount}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            maxLength={20}
            aria-invalid={!!err("amount") || undefined}
            aria-describedby={describedBy("amount")}
            autoFocus={!entry}
          />
        </div>
        <FieldError id="err-amount" message={err("amount")} />
      </div>

      <div className="form-rows">
        <div className="form-row">
          <span className="form-label" id="ef-dir-label">
            Money
          </span>
          <div className="segmented" role="radiogroup" aria-labelledby="ef-dir-label">
            <label>
              <input type="radio" name="direction" value="out" checked={direction === "out"} onChange={() => setDirection("out")} />
              <span>Went out</span>
            </label>
            <label>
              <input type="radio" name="direction" value="in" checked={direction === "in"} onChange={() => setDirection("in")} />
              <span>Came in</span>
            </label>
          </div>
        </div>

        <div className="form-row">
          <label htmlFor="ef-payee">Paid to</label>
          <div>
            <input
              id="ef-payee"
              name="payee"
              className="input"
              defaultValue={entry?.payee}
              maxLength={120}
              autoComplete="off"
              placeholder="Who, or what for"
              aria-invalid={!!err("payee") || undefined}
              aria-describedby={describedBy("payee")}
            />
            <FieldError id="err-payee" message={err("payee")} />
          </div>
        </div>

        <div className="form-row">
          <label htmlFor="ef-when">When</label>
          <div>
            <input
              id="ef-when"
              name="occurredAt"
              type="datetime-local"
              step={60}
              className="input mono"
              defaultValue={(entry?.occurredAt ?? defaultWhen).slice(0, 16)}
              aria-invalid={!!err("occurredAt") || undefined}
              aria-describedby={describedBy("occurredAt")}
            />
            <FieldError id="err-occurredAt" message={err("occurredAt")} />
          </div>
        </div>

        <div className="form-row">
          <span className="form-label" id="ef-how-label">
            How
          </span>
          <div className={s.how}>
            <div className="segmented" role="radiogroup" aria-labelledby="ef-how-label">
              {MAIN_CHANNELS.map((c) => (
                <label key={c}>
                  <input type="radio" name="channel-choice" value={c} checked={channel === c} onChange={() => setChannel(c)} />
                  <span>{c}</span>
                </label>
              ))}
            </div>
            <Select
              className={s.other}
              aria-label="Other ways to pay"
              placeholder="Other…"
              value={MAIN_CHANNELS.includes(channel as never) ? "" : channel}
              onChange={(v) => {
                if (!v) return;
                setChannel(v);
                setDirty(true);
              }}
              options={CHANNELS.filter((c) => !MAIN_CHANNELS.includes(c as never)).map((c) => ({ value: c, label: c }))}
            />
            <input type="hidden" name="channel" value={channel} />
          </div>
        </div>

        {channel === "Cheque" && (
          <div className="form-row">
            <label htmlFor="ef-cheque">Cheque no.</label>
            <div>
              {entry?.source === "wire" ? (
                <span className={s.readonly}>{entry.ref ?? "Not in the mail"}</span>
              ) : (
                <input
                  id="ef-cheque"
                  name="chequeNo"
                  className="input mono"
                  inputMode="numeric"
                  autoComplete="off"
                  defaultValue={entry?.channel === "Cheque" ? entry.ref ?? "" : ""}
                  maxLength={12}
                  placeholder="Optional · e.g. 000123"
                  aria-invalid={!!err("chequeNo") || undefined}
                  aria-describedby={describedBy("chequeNo") ?? "ef-cheque-hint"}
                />
              )}
              <p className="hint" id="ef-cheque-hint">
                When the bank mails that the cheque has cleared, it&apos;s matched to this line instead of being counted again.
              </p>
              <FieldError id="err-chequeNo" message={err("chequeNo")} />
            </div>
          </div>
        )}

        {cashOut && (
          <div className="form-row">
            <span className="form-label" id="ef-cash-label">
              This cash
            </span>
            <div>
              <div className="segmented" role="radiogroup" aria-labelledby="ef-cash-label" aria-describedby={describedBy("cash")}>
                <label>
                  <input type="radio" name="cash" value="wallet" checked={cash === "wallet"} onChange={() => setCash("wallet")} />
                  <span>Log each spend</span>
                </label>
                <label>
                  <input type="radio" name="cash" value="spent" checked={cash === "spent"} onChange={() => setCash("spent")} />
                  <span>Count as spent</span>
                </label>
              </div>
              <p className="hint">
                {cash === "wallet"
                  ? "The withdrawal only moves money to your wallet: it isn't counted as spending, and the cash lines you write down are."
                  : cash === "spent"
                    ? "The whole amount counts as spent today. Don't also write down what you buy with it, or it's counted twice."
                    : "Writing down each cash spend? Then the withdrawal itself isn't spending."}
              </p>
              <FieldError id="err-cash" message={err("cash")} />
            </div>
          </div>
        )}

        {entry?.personId ? (
          <div className="form-row">
            <span className="form-label">On the slate</span>
            <div className={s.slateRow}>
              <Link href={`/slate?person=${entry.personId}`} className="stamp" data-color="ink">
                {entry.personName}
              </Link>
              <button
                type="button"
                className="btn btn-line"
                onClick={async () => {
                  const r = await callAction(() => unlinkEntryAction(entry.id));
                  toast(r.ok ? { tone: "info", message: r.message ?? "Done." } : { tone: "error", message: r.error });
                  if (r.ok) router.refresh();
                }}
              >
                Take off the slate
              </button>
            </div>
          </div>
        ) : toWallet ? null : (
          <div className="form-row">
            <label htmlFor="ef-tag">Tag</label>
            <div>
              <Select
                id="ef-tag"
                name="tagId"
                defaultValue={entry?.tag?.id != null ? String(entry.tag.id) : ""}
                onChange={() => setDirty(true)}
                aria-describedby={describedBy("tagId")}
                options={[
                  { value: "", label: "No tag" },
                  { label: "Spending", options: tags.filter((t) => t.kind === "spend").map((t) => ({ value: String(t.id), label: t.name, color: t.color })) },
                  { label: "Income", options: tags.filter((t) => t.kind === "income").map((t) => ({ value: String(t.id), label: t.name, color: t.color })) },
                ]}
              />
              <FieldError id="err-tagId" message={err("tagId")} />
            </div>
          </div>
        )}

        <div className="form-row">
          <label htmlFor="ef-note">Note</label>
          <div>
            <input id="ef-note" name="note" className="input" defaultValue={entry?.note ?? ""} maxLength={280} placeholder="Optional" aria-describedby={describedBy("note")} />
            <FieldError id="err-note" message={err("note")} />
          </div>
        </div>

        {entry?.source === "wire" && (
          <div className="form-row">
            <span className="form-label">From the wire</span>
            <span className={s.readonly}>
              {[entry.account, entry.ref && `Ref ${entry.ref}`].filter(Boolean).join(" · ") || "Filed from your bank mail"}
            </span>
          </div>
        )}
      </div>

      <FormError message={error} />

      <div className={s.buttons}>
        <button type="submit" className={`btn btn-ink ${s.submit}`} disabled={pending || deleting} aria-busy={pending}>
          {pending ? "Saving…" : entry ? "Save changes" : "Add to the ledger →"}
        </button>
        <Link href={backHref} className="btn btn-line">
          Cancel
        </Link>
        {entry && (
          <span className={s.danger}>
            <ConfirmButton label="Delete line" question="Delete this line?" confirmLabel="Delete" onConfirm={remove} pending={deleting} />
          </span>
        )}
      </div>
    </form>
  );
}
