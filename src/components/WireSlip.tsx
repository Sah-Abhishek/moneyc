"use client";

import Image from "next/image";
import { useState } from "react";
import { deleteSlipAction, fileSlipAction, ignoreSlipAction, markDuplicateAction, restoreSlipAction, unfileSlipAction, unmarkDuplicateAction } from "@/app/actions/wire";
import { dayMonth, posted } from "@/lib/dates";
import { rupees, rupeesExact } from "@/lib/money";
import type { Tag } from "@/lib/types";
import { maskRef } from "@/lib/wire/parse";
import type { WireSlip as Slip } from "@/server/services/wire";
import { useToast } from "./ui/Toaster";
import { callAction, useSubmit } from "./ui/useSubmit";
import { ConfirmButton, FieldError, FormError } from "./ui/Confirm";
import { Select } from "./ui/Select";
import s from "./Wire.module.css";

// One parsed mail on the desk. What the parser pulled out is highlighted so
// it's obvious what was read; Edit turns those fields into inputs.
export function WireSlip({ slip, tags, clock }: { slip: Slip; tags: Tag[]; clock: string }) {
  const toast = useToast();
  const p = slip.parsed;
  const incomplete = !p.payee || p.amountPaise == null;
  const [editing, setEditing] = useState(incomplete);
  const [busy, setBusy] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [mode, setMode] = useState<"slate" | "ledger">(slip.person ? "slate" : "ledger");
  const [dismissedDuplicate, setDismissedDuplicate] = useState(false);
  // Cash from an ATM: spending only if the owner won't write down what it buys. Always asked.
  const atm = p.channel === "ATM" && p.direction === "debit";
  const [cash, setCash] = useState<"wallet" | "spent" | null>(null);

  const { onSubmit, pending, error, fieldErrors } = useSubmit(fileSlipAction, {
    onSuccess: (r) =>
      toast({
        tone: "info",
        message: r.message ?? "Filed.",
        action: {
          label: "Undo",
          run: async () => {
            const u = await callAction(() => unfileSlipAction(slip.id));
            if (!u.ok) toast({ tone: "error", message: u.error });
          },
        },
      }),
  });

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, undo?: () => Promise<unknown>) {
    setBusy(label);
    setInlineError(null);
    const r = await callAction(fn as () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>);
    setBusy(null);
    if (!r.ok) setInlineError(r.error);
    else toast({ tone: "info", message: r.message ?? "Done.", action: undo ? { label: "Undo", run: async () => void (await undo()) } : undefined });
  }

  const needsReview = !slip.suggestion || slip.confidence < 0.8 || slip.askFirst || atm;
  const tone = slip.confidence >= 0.9 ? "credit" : "pending";
  const showDuplicate = slip.duplicateOf && !dismissedDuplicate;
  const credit = p.direction === "credit";
  const person = slip.person;
  const personAfter = person && p.amountPaise != null ? person.balance + (credit ? -p.amountPaise : p.amountPaise) : null;

  return (
    <form onSubmit={onSubmit} className={s.slip} aria-label={`Mail from ${slip.bank}`} noValidate>
      <input type="hidden" name="id" value={slip.id} />
      <input type="hidden" name="editing" value={editing ? "1" : "0"} />
      {mode === "slate" && person && <input type="hidden" name="person" value={person.id} />}
      <header className={s.slipHead}>
        <span className={s.bank}>
          <Image src="/icons/mail.svg" alt="" width={13} height={13} />
          {slip.bank}
          <span className={s.headTime}>· {clock}</span>
        </span>
        {slip.askFirst ? (
          <span className={s.review} title="A standing rule asks you to check mail like this">Check this one</span>
        ) : needsReview ? (
          <span className={s.review}>Needs review</span>
        ) : (
          <span className={s.dir} data-credit={credit || undefined}>{credit ? "Credit" : "Debit"}</span>
        )}
      </header>
      <div className="rule" />

      {showDuplicate && (
        <div className={s.notice} role="note">
          <p>
            <strong>Looks like a line you already have:</strong> {slip.duplicateOf!.payee}, ₹{rupeesExact(Math.abs(slip.duplicateOf!.amount))} on{" "}
            {dayMonth(slip.duplicateOf!.occurredAt)}.
          </p>
          <div className={s.noticeActions}>
            <button
              type="button"
              className="btn btn-ink"
              disabled={!!busy}
              onClick={() => run("dup", () => markDuplicateAction(slip.id, slip.duplicateOf!.id), () => unmarkDuplicateAction(slip.id))}
            >
              {busy === "dup" ? "Matching…" : "It’s the same one"}
            </button>
            <button type="button" className="btn btn-line" onClick={() => setDismissedDuplicate(true)}>
              No, it&apos;s separate
            </button>
          </div>
        </div>
      )}

      <div className={s.slipBody}>
        <p className={s.summary}>{slip.subject && slip.subject.length > 30 ? slip.subject : firstSentence(slip.body)}</p>
        <dl className={s.fields}>
          <Field label="Payee">
            {editing ? (
              <>
                <input name="payee" defaultValue={p.payee ?? ""} className={s.edit} maxLength={120} aria-invalid={!!fieldErrors.payee || undefined} aria-label="Payee" />
                <FieldError id={`payee-${slip.id}`} message={fieldErrors.payee} />
              </>
            ) : (
              <Found value={p.payee} />
            )}
          </Field>
          <Field label="What for">
            {/* The mail only knows who was paid; what it bought is always yours to write. */}
            <input
              name="item"
              className={s.edit}
              maxLength={120}
              autoComplete="off"
              placeholder={credit ? "Optional · e.g. refund" : "What you bought · e.g. biscuits"}
              aria-label="What for"
              aria-invalid={!!fieldErrors.item || undefined}
            />
            <FieldError id={`item-${slip.id}`} message={fieldErrors.item} />
          </Field>
          <Field label="Amount">
            {editing ? (
              <>
                <input
                  name="amount"
                  defaultValue={p.amountPaise != null ? rupeesExact(p.amountPaise) : ""}
                  inputMode="decimal"
                  className={s.edit}
                  aria-invalid={!!fieldErrors.amount || undefined}
                  aria-label="Amount"
                />
                <FieldError id={`amount-${slip.id}`} message={fieldErrors.amount} />
              </>
            ) : (
              <Found value={p.amountPaise != null ? `₹ ${rupeesExact(p.amountPaise)}` : null} />
            )}
          </Field>
          <Field label={accountLabel(p)}>
            <Found value={p.account ? `${slip.bank} ****${p.account}` : null} />
          </Field>
          <Field label={p.channel === "Cheque" ? "Cheque no." : "Ref / RRN"}>
            <Found value={p.ref ? maskRef(p.ref) : null} />
          </Field>
          <Field label="Posted">
            <span className={s.plain}>{posted(slip.occurredAt)}</span>
          </Field>
        </dl>

        {person && (
          <div className={s.slateMatch}>
            <p className={s.slateLead}>
              {credit ? `${person.name} owes you` : `On the slate with ${person.name}`}: ₹{rupees(Math.abs(person.balance))}
              {personAfter != null && (
                <>
                  {" "}
                  → <strong>₹{rupees(Math.abs(personAfter))}</strong>
                  {personAfter < 0 && " (you'd owe them)"}
                </>
              )}
            </p>
            <div className="segmented" role="radiogroup" aria-label="Where does this belong?">
              <label>
                <input type="radio" name={`mode-${slip.id}`} checked={mode === "slate"} onChange={() => setMode("slate")} />
                <span>{credit ? "Settles the slate" : "Add to slate"}</span>
              </label>
              <label>
                <input type="radio" name={`mode-${slip.id}`} checked={mode === "ledger"} onChange={() => setMode("ledger")} />
                <span>{credit ? "Just income" : "Just an expense"}</span>
              </label>
            </div>
          </div>
        )}

        {mode === "ledger" && atm && (
          <div className={s.slateMatch}>
            <p className={s.slateLead}>
              {cash === "wallet"
                ? "Moves to your wallet: not counted as spending. The cash lines you write down are."
                : cash === "spent"
                  ? "Counted as spent now. Don't also write down what you buy with it."
                  : "Cash from an ATM. Will you write down what you spend it on?"}
            </p>
            <div className="segmented" role="radiogroup" aria-label="How should this cash count?">
              <label>
                <input type="radio" name="cash" value="wallet" checked={cash === "wallet"} onChange={() => setCash("wallet")} />
                <span>Log each spend</span>
              </label>
              <label>
                <input type="radio" name="cash" value="spent" checked={cash === "spent"} onChange={() => setCash("spent")} />
                <span>Count as spent</span>
              </label>
            </div>
            <FieldError id={`cash-${slip.id}`} message={fieldErrors.cash} />
          </div>
        )}

        {mode === "ledger" && !(atm && cash === "wallet") && (
          <div className={s.tagLine}>
            <span className={s.fieldLabel} data-warn={!slip.suggestion || undefined}>
              {slip.suggestion ? "Suggested tag" : "Needs a tag"}
            </span>
            <TagPicker tags={tags} suggested={slip.suggestion?.tag} credit={credit} />
            {slip.suggestion && <span className={s.basis}>{slip.suggestion.basis}</span>}
          </div>
        )}
      </div>
      <div className="rule-hair" />
      <footer className={s.slipFoot}>
        <div className={s.confidence} title="How much of the mail was read, and how sure the tag is">
          <span className={s.confLabel}>Match confidence</span>
          <span className={s.confRow}>
            <span className={s.confTrack} role="img" aria-label={`${Math.round(slip.confidence * 100)} percent`}>
              <span data-color={tone} style={{ width: `${slip.confidence * 100}%` }} />
            </span>
            <span className={s.confPct} data-color={tone}>
              {Math.round(slip.confidence * 100)}%
            </span>
          </span>
        </div>
        <div className={s.slipActions}>
          {/* Always offered: a slip the parser couldn't fully read opens in edit mode and must still be dismissable. */}
          <ConfirmButton
            label="Delete"
            question="Delete this mail for good?"
            confirmLabel="Delete"
            className={`btn btn-line ${s.ignore}`}
            pending={busy === "delete"}
            onConfirm={() => run("delete", () => deleteSlipAction(slip.id))}
          />
          <button
            type="button"
            className={`btn btn-line ${s.ignore}`}
            disabled={!!busy || pending}
            title="Take it off the desk. You can put it back from the wire page."
            onClick={() => run("archive", () => ignoreSlipAction(slip.id), () => restoreSlipAction(slip.id))}
          >
            {busy === "archive" ? "…" : "Archive"}
          </button>
          {!incomplete && (
            <button type="button" className="btn btn-line" onClick={() => setEditing((e) => !e)} disabled={pending}>
              {editing ? "Cancel edit" : "Edit"}
            </button>
          )}
          <button type="submit" className="btn btn-ink" disabled={pending || !!busy} aria-busy={pending}>
            {pending ? "Filing…" : mode === "slate" ? (credit ? "Settle it" : "Add to slate") : slip.suggestion && !editing ? "Confirm" : "File it"}
          </button>
        </div>
      </footer>
      {(error || inlineError) && (
        <div className={s.error}>
          <FormError message={error ?? inlineError} />
        </div>
      )}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={s.field}>
      <dt className={s.fieldLabel}>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Which of your accounts the money moved through, named by the way it moved. */
function accountLabel(p: Slip["parsed"]) {
  if (p.channel === "Card") return "Card";
  return p.direction === "credit" ? "Into account" : p.direction === "debit" ? "From account" : "Account";
}

function Found({ value }: { value: string | null }) {
  return value ? <mark className={s.found}>{value}</mark> : <span className={s.missing}>couldn&apos;t read this</span>;
}

function TagPicker({ tags, suggested, credit }: { tags: Tag[]; suggested?: Tag; credit: boolean }) {
  const [id, setId] = useState(suggested ? String(suggested.id) : "");
  const tag = tags.find((t) => String(t.id) === id);
  const ordered = [...tags].sort((a, b) => (a.kind === (credit ? "income" : "spend") ? -1 : 1) - (b.kind === (credit ? "income" : "spend") ? -1 : 1));
  return (
    <Select
      variant="bare"
      className={tag ? `stamp ${s.picker}` : s.pickTag}
      dataColor={tag?.color}
      name="tag"
      aria-label="Tag"
      value={id}
      onChange={setId}
      chevron={!tag}
      placeholder={credit ? "No tag" : "Pick a tag"}
      options={[
        { value: "", label: credit ? "No tag" : "No tag yet" },
        ...ordered.map((t) => ({ value: String(t.id), label: t.name, color: t.color })),
      ]}
      renderValue={(o) => (o?.value ? o.label : credit ? "No tag" : "Pick a tag")}
    />
  );
}

function firstSentence(body: string) {
  const text = body.replace(/^Dear (Customer|Sir|Madam|[A-Z][a-z]+),?\s*/i, "");
  return text.split(/(?<!\b(?:Rs|no|No|Ref))\.\s+(?=[A-Z])/)[0].replace(/\.?$/, ".").slice(0, 220);
}
