"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/types";

export const OFFLINE_MESSAGE = "Couldn't reach the server — check your connection and try again. What you typed is still here.";

export interface SubmitState {
  pending: boolean;
  error: string | null;
  fieldErrors: Record<string, string>;
}

/**
 * Submits a form to a server action without React's automatic form reset, so
 * a failed submit (validation, conflict, network loss) never throws away what
 * the user typed. Ignores re-submits while one is in flight.
 */
export function useSubmit<T>(
  action: (form: FormData) => Promise<ActionResult<T>>,
  opts: { onSuccess?: (r: Extract<ActionResult<T>, { ok: true }>, form: HTMLFormElement) => void; resetOnSuccess?: boolean } = {},
) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const inFlight = useRef(false);

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (inFlight.current) return;
      const form = e.currentTarget;
      const data = new FormData(form, (e.nativeEvent as SubmitEvent).submitter ?? undefined);
      inFlight.current = true;
      startTransition(async () => {
        try {
          const r = await action(data);
          if (r.ok) {
            setError(null);
            setFieldErrors({});
            if (opts.resetOnSuccess) form.reset();
            opts.onSuccess?.(r, form);
          } else {
            setError(r.error);
            setFieldErrors(r.fieldErrors ?? {});
            const first = Object.keys(r.fieldErrors ?? {})[0];
            const field = first ? form.elements.namedItem(first) : null;
            if (field instanceof HTMLElement) field.focus();
          }
        } catch {
          setError(navigator.onLine ? "Something interrupted the request. Try again — what you typed is still here." : OFFLINE_MESSAGE);
        } finally {
          inFlight.current = false;
        }
      });
    },
    [action, opts],
  );

  return { onSubmit, pending, error, fieldErrors, setError } as const;
}

/** Calls an action outside a form (buttons, toasts), reporting failures the same way. */
export async function callAction<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch {
    return { ok: false, error: typeof navigator !== "undefined" && !navigator.onLine ? OFFLINE_MESSAGE : "Something interrupted the request. Try again." };
  }
}

export const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
