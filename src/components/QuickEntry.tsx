"use client";

import Image from "next/image";
import { useState, useSyncExternalStore } from "react";
import { addLineAction, deleteEntryAction, restoreEntryAction } from "@/app/actions/entries";
import { QUICK_CHANNELS, type Tag } from "@/lib/types";
import { ItemChips, TagChips, usePayeeHistory } from "./PastUses";
import { Select } from "./ui/Select";
import { useToast } from "./ui/Toaster";
import { callAction, newKey, useSubmit } from "./ui/useSubmit";
import s from "./Ledger.module.css";

// Rule 02: the blank line is always ready. Who or what for (either will
// do) + amount, Enter, done.
// A leading "+" records money coming in. The line is dated now and paid the
// way chosen beside it (Cash until another is picked; the last choice is
// remembered on this device); open it afterwards to change anything.
const MODE_KEY = "quick-line-mode";
const modeListeners = new Set<() => void>();
/** the choice when this browser won't store it */
let memoryMode: string | null = null;

function readMode(): string {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved && (QUICK_CHANNELS as readonly string[]).includes(saved)) return saved;
  } catch {
    // storage blocked: this page's choice, else Cash
  }
  return memoryMode ?? "Cash";
}

function saveMode(mode: string) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // storage blocked: kept for this page only
    memoryMode = mode;
  }
  modeListeners.forEach((l) => l());
}
function subscribeMode(listener: () => void) {
  modeListeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === MODE_KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    modeListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function QuickEntry({ today, tags }: { today: string; tags: Tag[] }) {
  const toast = useToast();
  const [clientKey, setClientKey] = useState(newKey);
  const mode = useSyncExternalStore(subscribeMode, readMode, () => "Cash");
  const [payee, setPayee] = useState("");
  const [item, setItem] = useState("");
  const [tag, setTag] = useState("");
  const [incoming, setIncoming] = useState(false);
  // What this payee was paid for and tagged as before, offered under the line.
  const history = usePayeeHistory(payee, incoming ? "in" : "out");

  const { onSubmit, pending, error, fieldErrors } = useSubmit(addLineAction, {
    resetOnSuccess: true,
    onSuccess: (r, form) => {
      setClientKey(newKey());
      setPayee("");
      setItem("");
      setTag("");
      setIncoming(false);
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
    <form onSubmit={onSubmit} className={s.quick} id="new-line" aria-label="Add a line" aria-busy={pending} noValidate>
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
        placeholder="Who did you pay? (optional)"
        autoComplete="off"
        maxLength={120}
        value={payee}
        onChange={(e) => setPayee(e.target.value)}
        aria-invalid={!!fieldErrors.payee || undefined}
        aria-describedby={error ? "ql-error" : undefined}
      />
      <span className={`${s.quickRule} ${s.hideSm}`} aria-hidden />
      <label className="sr-only" htmlFor="ql-item">
        What for?
      </label>
      <input
        id="ql-item"
        name="item"
        className={`${s.quickPayee} ${s.quickItem}`}
        placeholder="What for?"
        autoComplete="off"
        maxLength={120}
        value={item}
        onChange={(e) => setItem(e.target.value)}
        aria-invalid={!!fieldErrors.item || undefined}
        aria-describedby={error ? "ql-error" : undefined}
      />
      <span className={`${s.quickRule} ${s.hideSm}`} aria-hidden />
      {/* On a phone the way paid, the tag and the button drop to a second row. */}
      <span className={s.quickBreak} aria-hidden />
      <Select
        variant="bare"
        className={s.quickMode}
        name="channel"
        value={mode}
        onChange={saveMode}
        options={QUICK_CHANNELS.map((c) => ({ value: c, label: c }))}
        aria-label="Paid by"
      />
      <Select
        variant="bare"
        className={s.quickTag}
        name="tag"
        value={tag}
        onChange={setTag}
        aria-label="Tag"
        options={[
          { value: "", label: "No tag" },
          { label: "Spending", options: tagSpend.map((t) => ({ value: String(t.id), label: t.name, color: t.color })) },
          { label: "Income", options: tagIncome.map((t) => ({ value: String(t.id), label: t.name, color: t.color })) },
        ]}
        renderValue={(o) => (
          <>
            {o?.color ? <span className="swatch" data-color={o.color} /> : <Image src="/icons/plus-tag.svg" alt="" width={9} height={9} />}
            <span className={s.quickTagName}>{o?.value ? o.label : "Tag"}</span>
          </>
        )}
      />
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
          onChange={(e) => setIncoming(e.target.value.trim().startsWith("+"))}
          aria-invalid={!!fieldErrors.amount || undefined}
          aria-describedby={error ? "ql-error" : undefined}
        />
      </label>
      <button type="submit" className={`btn btn-ink ${s.quickSubmit}`} disabled={pending} aria-busy={pending}>
        {pending ? "Adding…" : "Add line"}
      </button>
      {history && (history.items.length > 0 || history.tags.length > 0) && (
        <div className={s.quickPast}>
          <ItemChips history={history} value={item} payee={payee} onPick={setItem} />
          <TagChips history={history} value={tag} payee={payee} onPick={setTag} />
        </div>
      )}
      {error && (
        <p className={s.quickError} id="ql-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
