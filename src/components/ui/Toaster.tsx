"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import s from "./ui.module.css";

// Confirmations after an action ("Line added · Undo"). Announced politely to
// screen readers; errors that need attention are shown next to the form
// instead, where the user is looking.

interface Toast {
  id: number;
  message: string;
  tone: "info" | "error";
  action?: { label: string; run: () => void | Promise<void> };
}

const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export const useToast = () => useContext(Ctx);

const LIFETIME_MS = 7000;

export function Toaster({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = next.current++;
    setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
  }, []);

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className={s.toasts} role="status" aria-live="polite">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDone={() => dismiss(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastItem({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (hover || busy) return;
    const t = setTimeout(onDone, LIFETIME_MS);
    return () => clearTimeout(t);
  }, [hover, busy, onDone]);

  return (
    <div className={s.toast} data-tone={toast.tone} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <span>{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className={s.toastAction}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await toast.action!.run();
            } finally {
              onDone();
            }
          }}
        >
          {busy ? "…" : toast.action.label}
        </button>
      )}
      <button type="button" className={s.toastClose} onClick={onDone} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
