"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { linkEntryAction } from "@/app/actions/slate";
import { FormError } from "./ui/Confirm";
import { useToast } from "./ui/Toaster";
import { callAction } from "./ui/useSubmit";
import s from "./EntryForm.module.css";

// Moves a ledger line onto someone's slate: a payment to a friend becomes
// money they owe you; money from them pays down what they owe.
export function SlateLinker({ entryId, amount, people }: { entryId: number; amount: number; people: { id: number; name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [person, setPerson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className={s.form} style={{ marginTop: 40 }} aria-labelledby="slate-link-title">
      <div className="rule" />
      <h3 id="slate-link-title" className="eyebrow">
        Was this money lent or borrowed?
      </h3>
      <p className="page-lede" style={{ margin: 0 }}>
        {amount < 0
          ? "If you paid this for someone who'll pay you back, put it on their slate. It stops counting as your spending."
          : "If this was someone paying you back, put it on their slate. It stops counting as income."}
      </p>
      {people.length === 0 ? (
        <p className="hint">
          You don&apos;t have anyone on the slate yet. <Link href="/slate#new-account">Open an account</Link> first.
        </p>
      ) : (
        <div className={s.slateRow}>
          <select className="select" style={{ width: "auto" }} value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Whose slate">
            <option value="">Choose a person…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-ink"
            disabled={!person || pending}
            onClick={() =>
              start(async () => {
                const r = await callAction(() => linkEntryAction(entryId, Number(person)));
                if (!r.ok) return setError(r.error);
                setError(null);
                toast({ tone: "info", message: r.message ?? "Put on the slate." });
                router.refresh();
              })
            }
          >
            {pending ? "Moving…" : "Put on their slate"}
          </button>
        </div>
      )}
      <FormError message={error} />
    </section>
  );
}
