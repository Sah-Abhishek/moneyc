"use client";

import { useEffect, useRef, useState } from "react";
import s from "./ui.module.css";

// Destructive actions ask twice, in place: the button becomes "Delete for
// good? Yes / Keep it". No modal to lose focus in, and Escape backs out.
export function ConfirmButton({
  label,
  question,
  confirmLabel = "Yes",
  onConfirm,
  pending,
  className = "btn btn-line",
}: {
  label: string;
  question: string;
  confirmLabel?: string;
  onConfirm: () => void;
  pending?: boolean;
  className?: string;
}) {
  const [asking, setAsking] = useState(false);
  const yes = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (asking) yes.current?.focus();
  }, [asking]);

  if (!asking)
    return (
      <button type="button" className={className} onClick={() => setAsking(true)} disabled={pending}>
        {pending ? "Working…" : label}
      </button>
    );

  return (
    <span className={s.confirm} role="group" aria-label={question} onKeyDown={(e) => e.key === "Escape" && setAsking(false)}>
      <span className={s.confirmQ}>{question}</span>
      <button
        ref={yes}
        type="button"
        className="btn btn-danger"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className="btn btn-line" onClick={() => setAsking(false)}>
        Cancel
      </button>
    </span>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={id} className={s.fieldError} role="alert">
      {message}
    </span>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className={s.formError} role="alert">
      {message}
    </p>
  );
}
