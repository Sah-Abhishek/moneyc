"use client";

import { useState, useTransition } from "react";
import { restoreSlipAction, setAutoFileAction } from "@/app/actions/wire";
import { useToast } from "./ui/Toaster";
import { callAction } from "./ui/useSubmit";
import s from "./WireControls.module.css";

export function AutoFileToggle({ on }: { on: boolean }) {
  const toast = useToast();
  const [value, setValue] = useState(on);
  const [pending, start] = useTransition();
  return (
    <label className={s.toggle}>
      <span className={s.label}>Auto-file</span>
      <input
        type="checkbox"
        role="switch"
        checked={value}
        disabled={pending}
        aria-describedby="autofile-help"
        onChange={(e) => {
          const next = e.target.checked;
          setValue(next);
          start(async () => {
            const r = await callAction(() => setAutoFileAction(next));
            if (!r.ok) {
              setValue(!next);
              toast({ tone: "error", message: r.error });
            } else toast({ tone: "info", message: r.message ?? "Saved." });
          });
        }}
      />
      <span className={s.track} aria-hidden>
        <span />
      </span>
      <span id="autofile-help" className="sr-only">
        When on, mail that a rule or your history makes certain is filed without asking.
      </span>
    </label>
  );
}

export function RestoreSlipButton({ id }: { id: number }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-line"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await callAction(() => restoreSlipAction(id));
          toast(r.ok ? { tone: "info", message: r.message ?? "Back on the desk." } : { tone: "error", message: r.error });
        })
      }
    >
      {pending ? "…" : "Put back"}
    </button>
  );
}
