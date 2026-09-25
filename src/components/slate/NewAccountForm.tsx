"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPersonAction } from "@/app/actions/slate";
import { FieldError, FormError } from "../ui/Confirm";
import { useToast } from "../ui/Toaster";
import { newKey, useSubmit } from "../ui/useSubmit";
import s from "./slate.module.css";

/** "Lend to someone — add an account" / "Record something you borrowed". */
export function NewAccountForm({ now }: { now: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(newKey);
  const [direction, setDirection] = useState<"gave" | "got">("gave");
  const { onSubmit, pending, error, fieldErrors } = useSubmit(createPersonAction, {
    resetOnSuccess: true,
    onSuccess: (r) => {
      setKey(newKey());
      setOpen(false);
      toast({ tone: "info", message: r.message ?? "Account opened." });
      if (r.data?.id) router.push(`/slate?person=${r.data.id}#account`);
    },
  });

  if (!open)
    return (
      <button type="button" className={s.newAccountTrigger} onClick={() => setOpen(true)} id="new-account">
        <span className={s.plus} aria-hidden>
          +
        </span>
        Lend to someone, or record something you borrowed
      </button>
    );

  return (
    <form onSubmit={onSubmit} className={s.newAccount} noValidate>
      <input type="hidden" name="clientKey" value={key} />
      <div className="segmented" role="radiogroup" aria-label="Which way did the money go">
        <label>
          <input type="radio" name="direction" value="gave" checked={direction === "gave"} onChange={() => setDirection("gave")} />
          <span>I lent</span>
        </label>
        <label>
          <input type="radio" name="direction" value="got" checked={direction === "got"} onChange={() => setDirection("got")} />
          <span>I borrowed</span>
        </label>
      </div>
      <div className={s.lineFields}>
        <label className={s.lf}>
          <span className="eyebrow">{direction === "gave" ? "To whom" : "From whom"}</span>
          <input name="name" className="input" maxLength={60} autoFocus aria-invalid={!!fieldErrors.name || undefined} placeholder="Priya Nair" />
          <FieldError id="na-name" message={fieldErrors.name} />
        </label>
        <label className={s.lf}>
          <span className="eyebrow">Amount ₹</span>
          <input name="amount" className="input mono" inputMode="decimal" placeholder="Optional" aria-invalid={!!fieldErrors.amount || undefined} />
          <FieldError id="na-amount" message={fieldErrors.amount} />
        </label>
        <label className={s.lf} style={{ flex: 2 }}>
          <span className="eyebrow">What for</span>
          <input name="lineNote" className="input" maxLength={140} placeholder={direction === "gave" ? "Concert tickets" : "Rent for September"} />
        </label>
        <label className={s.lf}>
          <span className="eyebrow">When</span>
          <input name="occurredAt" type="datetime-local" className="input mono" defaultValue={now.slice(0, 16)} aria-invalid={!!fieldErrors.occurredAt || undefined} />
          <FieldError id="na-when" message={fieldErrors.occurredAt} />
        </label>
      </div>
      <label className={s.lf}>
        <span className="eyebrow">Phone (optional, for reminders)</span>
        <input name="phone" className="input mono" inputMode="tel" maxLength={20} placeholder="+91 98765 43210" aria-invalid={!!fieldErrors.phone || undefined} />
        <FieldError id="na-phone" message={fieldErrors.phone} />
      </label>
      <FormError message={error} />
      <div className={s.formButtons}>
        <button type="submit" className="btn btn-ink" disabled={pending}>
          {pending ? "Opening…" : "Open the account"}
        </button>
        <button type="button" className="btn btn-line" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
