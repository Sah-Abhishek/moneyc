"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addSlateLineAction, archivePersonAction, deletePersonAction, deleteSlateLineAction, remindAction, updatePersonAction } from "@/app/actions/slate";
import { rupees } from "@/lib/money";
import { ConfirmButton, FieldError, FormError } from "../ui/Confirm";
import { useToast } from "../ui/Toaster";
import { callAction, newKey, useSubmit } from "../ui/useSubmit";
import s from "./slate.module.css";

const whatsappUrl = (phone: string, text: string) => `https://wa.me/${phone.replace(/[^\d]/g, "").replace(/^0+/, "")}?text=${encodeURIComponent(text)}`;

/** Records the reminder, then lets the user send it the way they like. Nothing is sent automatically. */
export function RemindButton({ personId, name, age, className }: { personId: number; name: string; age: number; className?: string }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const label = age > 90 ? "Chase" : age > 60 ? "Remind" : "Nudge";
  return (
    <button
      type="button"
      className={className ?? s.doLink}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await callAction(() => remindAction(personId));
          if (!r.ok || !r.data) return toast({ tone: "error", message: r.ok ? "Couldn't prepare the reminder." : r.error });
          const { text, phone } = r.data;
          toast({
            tone: "info",
            message: phone ? `Reminder for ${name} is ready.` : `Reminder for ${name} copied — add a phone number to send it on WhatsApp.`,
            action: phone
              ? { label: "Open WhatsApp", run: () => void window.open(whatsappUrl(phone, text), "_blank", "noopener") }
              : undefined,
          });
          if (!phone) await navigator.clipboard?.writeText(text).catch(() => {});
        })
      }
    >
      {pending ? "…" : label}
    </button>
  );
}

/** Adds a line to the open account: money you gave, or money they gave you. */
export function SlateLineForm({ personId, name, now, balance, startDirection }: { personId: number; name: string; now: string; balance: number; startDirection: "gave" | "got" }) {
  const toast = useToast();
  const [key, setKey] = useState(newKey);
  const [direction, setDirection] = useState(startDirection);
  const { onSubmit, pending, error, fieldErrors } = useSubmit(addSlateLineAction, {
    resetOnSuccess: true,
    onSuccess: (r) => {
      setKey(newKey());
      toast({ tone: "info", message: r.message ?? "Recorded." });
    },
  });
  return (
    <form onSubmit={onSubmit} className={s.lineForm} id="record" noValidate>
      <input type="hidden" name="personId" value={personId} />
      <input type="hidden" name="clientKey" value={key} />
      <div className="segmented" role="radiogroup" aria-label="Who paid">
        <label>
          <input type="radio" name="direction" value="gave" checked={direction === "gave"} onChange={() => setDirection("gave")} />
          <span>I gave {name.split(" ")[0]}</span>
        </label>
        <label>
          <input type="radio" name="direction" value="got" checked={direction === "got"} onChange={() => setDirection("got")} />
          <span>{name.split(" ")[0]} gave me</span>
        </label>
      </div>
      <div className={s.lineFields}>
        <label className={s.lf}>
          <span className="eyebrow">Amount ₹</span>
          <input
            name="amount"
            className="input mono"
            inputMode="decimal"
            placeholder={balance && ((direction === "got" && balance > 0) || (direction === "gave" && balance < 0)) ? rupees(Math.abs(balance)) : "0.00"}
            aria-invalid={!!fieldErrors.amount || undefined}
          />
          <FieldError id="sl-amount" message={fieldErrors.amount} />
        </label>
        <label className={s.lf} style={{ flex: 2 }}>
          <span className="eyebrow">What happened</span>
          <input name="note" className="input" maxLength={140} placeholder={direction === "gave" ? "Lent for the concert tickets" : "Paid back in cash"} aria-invalid={!!fieldErrors.note || undefined} />
          <FieldError id="sl-note" message={fieldErrors.note} />
        </label>
        <label className={s.lf}>
          <span className="eyebrow">When</span>
          <input name="occurredAt" type="datetime-local" className="input mono" defaultValue={now.slice(0, 16)} aria-invalid={!!fieldErrors.occurredAt || undefined} />
          <FieldError id="sl-when" message={fieldErrors.occurredAt} />
        </label>
      </div>
      <FormError message={error} />
      <button type="submit" className="btn btn-ink" disabled={pending}>
        {pending ? "Recording…" : "Record it"}
      </button>
    </form>
  );
}

/** Writes the line that brings the balance to zero. */
export function SettleUpButton({ personId, name, balance, now }: { personId: number; name: string; balance: number; now: string }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [key] = useState(newKey);
  if (balance === 0) return null;
  const question = balance > 0 ? `${name} paid you ₹${rupees(balance)} in full?` : `You paid ${name} ₹${rupees(-balance)} in full?`;
  return (
    <ConfirmButton
      label="Settle up"
      question={question}
      confirmLabel="Yes, settled"
      pending={pending}
      onConfirm={() =>
        start(async () => {
          const f = new FormData();
          f.set("personId", String(personId));
          f.set("amount", (Math.abs(balance) / 100).toFixed(2));
          f.set("direction", balance > 0 ? "got" : "gave");
          f.set("occurredAt", now.slice(0, 16));
          f.set("note", "Settled up");
          f.set("clientKey", key);
          const r = await callAction(() => addSlateLineAction(f));
          toast(r.ok ? { tone: "info", message: `Settled with ${name}.` } : { tone: "error", message: r.error });
        })
      }
    />
  );
}

export function DeleteSlateLine({ id }: { id: number }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <ConfirmButton
      className={s.lineDelete}
      label="Remove"
      question="Remove this line?"
      confirmLabel="Remove"
      pending={pending}
      onConfirm={() =>
        start(async () => {
          const r = await callAction(() => deleteSlateLineAction(id));
          toast(r.ok ? { tone: "info", message: r.message ?? "Removed." } : { tone: "error", message: r.error });
        })
      }
    />
  );
}

export function PersonEditor({ person }: { person: { id: number; name: string; matchNames: string[]; phone: string | null; note: string | null; balance: number; lineCount: number; archived: boolean } }) {
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const save = useSubmit(updatePersonAction, { onSuccess: (r) => { toast({ tone: "info", message: r.message ?? "Saved." }); setOpen(false); } });

  return (
    <div className={s.personEdit}>
      <div className={s.personEditButtons}>
        <button type="button" className="btn btn-line" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Close" : "Edit details"}
        </button>
        {person.balance === 0 && person.lineCount > 0 && (
          <button
            type="button"
            className="btn btn-line"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await callAction(() => archivePersonAction(person.id, !person.archived));
                toast(r.ok ? { tone: "info", message: r.message ?? "Done." } : { tone: "error", message: r.error });
              })
            }
          >
            {person.archived ? "Restore account" : "Archive (settled)"}
          </button>
        )}
        {person.lineCount === 0 && (
          <ConfirmButton
            label="Remove account"
            question="Remove this empty account?"
            confirmLabel="Remove"
            pending={pending}
            onConfirm={() =>
              start(async () => {
                const r = await callAction(() => deletePersonAction(person.id));
                toast(r.ok ? { tone: "info", message: r.message ?? "Removed." } : { tone: "error", message: r.error });
                if (r.ok) router.push("/slate");
              })
            }
          />
        )}
      </div>
      {open && (
        <form onSubmit={save.onSubmit} className={s.personForm} noValidate>
          <input type="hidden" name="id" value={person.id} />
          <label className={s.lf}>
            <span className="eyebrow">Name</span>
            <input name="name" className="input" defaultValue={person.name} maxLength={60} aria-invalid={!!save.fieldErrors.name || undefined} />
            <FieldError id="pe-name" message={save.fieldErrors.name} />
          </label>
          <label className={s.lf}>
            <span className="eyebrow">How the bank writes their name</span>
            <textarea name="matchNames" className="textarea mono" defaultValue={person.matchNames.join("\n")} placeholder={"VINOD SI\nvinodsi@okaxis"} />
            <span className="hint">One per line — names or UPI IDs. Wire mail mentioning any of these is offered against this account.</span>
          </label>
          <label className={s.lf}>
            <span className="eyebrow">Phone (for WhatsApp reminders)</span>
            <input name="phone" className="input mono" defaultValue={person.phone ?? ""} inputMode="tel" placeholder="+91 98765 43210" aria-invalid={!!save.fieldErrors.phone || undefined} />
            <FieldError id="pe-phone" message={save.fieldErrors.phone} />
          </label>
          <label className={s.lf}>
            <span className="eyebrow">Note</span>
            <input name="note" className="input" defaultValue={person.note ?? ""} maxLength={280} />
          </label>
          <FormError message={save.error} />
          <button type="submit" className="btn btn-ink" disabled={save.pending}>
            {save.pending ? "Saving…" : "Save"}
          </button>
        </form>
      )}
    </div>
  );
}
