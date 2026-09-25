"use client";

import Image from "next/image";
import { useState } from "react";
import { addLineAction, deleteEntryAction, restoreEntryAction } from "@/app/actions/entries";
import type { Tag } from "@/lib/types";
import { useToast } from "./ui/Toaster";
import { callAction, newKey, useSubmit } from "./ui/useSubmit";
import s from "./Ledger.module.css";

// Rule 02: the blank line is always ready. Payee + amount, Enter, done.
// A leading "+" records money coming in. The line is dated now and marked
// cash; open it afterwards to change anything.
export function QuickEntry({ today, tags }: { today: string; tags: Tag[] }) {
  const toast = useToast();
  const [clientKey, setClientKey] = useState(newKey);
  const { onSubmit, pending, error, fieldErrors } = useSubmit(addLineAction, {
    resetOnSuccess: true,
    onSuccess: (r, form) => {
      setClientKey(newKey());
      (form.elements.namedItem("payee") as HTMLInputElement | null)?.focus();
      const id = r.data?.id;
      toast({
        tone: "info",
        message: r.message ?? "Line added.",
        action: id
          ? {
              label: "Undo",
              run: async () => {
                const del = await callAction(() => deleteEntryAction(id));
                toast(
                  del.ok
                    ? { tone: "info", message: "Line removed.", action: { label: "Put it back", run: async () => void (await callAction(() => restoreEntryAction(id))) } }
                    : { tone: "error", message: del.error },
                );
              },
            }
          : undefined,
      });
    },
  });
  const tagSpend = tags.filter((t) => t.kind === "spend");
  const tagIncome = tags.filter((t) => t.kind === "income");

  return (
    <form onSubmit={onSubmit} className={s.quick} id="new-line" aria-label="Add a line" noValidate>
      <input type="hidden" name="clientKey" value={clientKey} />
      <span className={s.quickPlus} aria-hidden>
        <Image src="/icons/plus-entry.svg" alt="" width={13} height={13} />
      </span>
      <span className={s.quickDate}>{today}</span>
      <span className={s.quickRule} aria-hidden />
      <label className="sr-only" htmlFor="ql-payee">
        Who did you pay?
      </label>
      <input
        id="ql-payee"
        name="payee"
        className={s.quickPayee}
        placeholder="Who did you pay?"
        autoComplete="off"
        maxLength={120}
        required
        aria-invalid={!!fieldErrors.payee || undefined}
        aria-describedby={error ? "ql-error" : undefined}
      />
      <span className={`${s.quickRule} ${s.hideSm}`} aria-hidden />
      <label className={s.quickTag}>
        <span className="sr-only">Tag</span>
        <Image src="/icons/plus-tag.svg" alt="" width={9} height={9} />
        <select name="tag" defaultValue="">
          <option value="">Tag</option>
          <optgroup label="Spending">
            {tagSpend.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
          {tagIncome.length > 0 && (
            <optgroup label="Income">
              {tagIncome.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <span className={`${s.quickRule} ${s.hideSm}`} aria-hidden />
      <label className={s.quickAmount}>
        <span aria-hidden>₹</span>
        <span className="sr-only">Amount — start with + for money in</span>
        <input
          name="amount"
          inputMode="decimal"
          placeholder="0.00"
          autoComplete="off"
          maxLength={20}
          required
          aria-invalid={!!fieldErrors.amount || undefined}
          aria-describedby={error ? "ql-error" : undefined}
        />
      </label>
      <button type="submit" className={`btn btn-ink ${s.quickSubmit}`} disabled={pending} aria-busy={pending}>
        {pending ? "Adding…" : "Add line"}
      </button>
      {error && (
        <p className={s.quickError} id="ql-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
