"use client";

import { useEffect, useState } from "react";
import type { PayeeHistory } from "@/server/services/entries";
import s from "./PastUses.module.css";

// What a payee was paid for, and how it was tagged, the last times: offered as
// chips under the fields so a regular payment is one tap, never filled in
// without asking.

type Direction = "in" | "out";

const WAIT_MS = 250;
const FRESH_MS = 60_000;
const KEEP = 50;
/** recent answers, so retyping a payee or flipping direction doesn't ask again */
const seen = new Map<string, { at: number; history: PayeeHistory }>();

const keyOf = (payee: string, direction?: Direction) => `${direction ?? "any"}|${payee.trim().replace(/\s+/g, " ").toLowerCase()}`;

function fresh(key: string): PayeeHistory | null {
  const hit = seen.get(key);
  return hit && Date.now() - hit.at < FRESH_MS ? hit.history : null;
}

function remember(key: string, history: PayeeHistory) {
  seen.delete(key);
  seen.set(key, { at: Date.now(), history });
  if (seen.size > KEEP) seen.delete(seen.keys().next().value!);
}

/**
 * The history of whoever is typed in `payee`, looked up a moment after typing
 * stops. `known` is a history the page already has (a wire slip's, for the
 * payee the mail named), used without asking. Null while there's nothing to
 * offer; a failed lookup only means no suggestions.
 */
export function usePayeeHistory(payee: string, direction?: Direction, known?: { payee: string; history: PayeeHistory | null }): PayeeHistory | null {
  const key = keyOf(payee, direction);
  const empty = !payee.trim();
  const given = known && known.history && keyOf(known.payee, direction) === key ? known.history : null;
  const [found, setFound] = useState<{ key: string; history: PayeeHistory } | null>(null);

  const cached = empty || given ? null : fresh(key);

  useEffect(() => {
    if (empty || given || fresh(key)) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ payee: payee.trim() });
        if (direction) qs.set("direction", direction);
        const res = await fetch(`/api/payee-history?${qs}`, { signal: abort.signal, cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { ok: boolean; data?: PayeeHistory };
        if (!body.ok || !body.data) return;
        remember(key, body.data);
        setFound({ key, history: body.data });
      } catch {
        // offline or aborted: no suggestions this time
      }
    }, WAIT_MS);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [key, empty, given, payee, direction]);

  if (empty) return null;
  return given ?? cached ?? (found?.key === key ? found.history : null);
}

const times = (n: number) => `${n} time${n === 1 ? "" : "s"}`;

/** "Before: Milk · Bread" under What for. Tapping one fills it in. */
export function ItemChips({ history, value, onPick, payee }: { history: PayeeHistory | null; value: string; onPick: (text: string) => void; payee: string }) {
  if (!history?.items.length) return null;
  const now = value.trim().toLowerCase();
  return (
    <div className={s.row} role="group" aria-label={`What ${payee.trim()} was paid for before`}>
      <span className={s.label} aria-hidden>
        Before
      </span>
      {history.items.map((i) => (
        <button
          key={i.text}
          type="button"
          className={`chip ${s.item}`}
          aria-pressed={i.text.toLowerCase() === now}
          title={`Used ${times(i.uses)}`}
          onClick={() => onPick(i.text)}
        >
          {i.text}
        </button>
      ))}
    </div>
  );
}

/** The tags this payee's lines carried. Tapping one picks it. */
export function TagChips({ history, value, onPick, payee, skip }: { history: PayeeHistory | null; value: string; onPick: (tagId: string) => void; payee: string; skip?: string }) {
  const tags = history?.tags.filter((t) => String(t.tag.id) !== skip) ?? [];
  if (!tags.length) return null;
  return (
    <div className={s.row} role="group" aria-label={`How ${payee.trim()} was tagged before`}>
      <span className={s.label} aria-hidden>
        Tagged
      </span>
      {tags.map(({ tag, uses }) => (
        <button
          key={tag.id}
          type="button"
          className={`stamp ${s.tag}`}
          data-color={tag.color}
          aria-pressed={String(tag.id) === value}
          title={`Tagged ${tag.name} ${times(uses)}`}
          onClick={() => onPick(String(tag.id))}
        >
          {tag.name}
        </button>
      ))}
    </div>
  );
}
