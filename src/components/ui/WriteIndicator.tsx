"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { subscribeWrites, writesInFlight } from "./writes";
import s from "./ui.module.css";

// "Saving…" while anything is being written. Shown after a short beat so fast
// saves don't flicker, and kept up until the server has answered and the page
// has redrawn with the change.
const SHOW_AFTER_MS = 250;

export function WriteIndicator() {
  const busy = useSyncExternalStore(subscribeWrites, () => writesInFlight() > 0, () => false);
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!busy) return;
    const t = setTimeout(() => setLate(true), SHOW_AFTER_MS);
    return () => {
      clearTimeout(t);
      setLate(false);
    };
  }, [busy]);
  const shown = busy && late;
  return (
    <>
      <div className={s.writeBar} data-on={shown || undefined} aria-hidden />
      <div className={s.writePill} data-on={shown || undefined} role="status" aria-live="polite">
        {shown ? (
          <>
            <span className={s.writeDot} aria-hidden />
            Saving…
          </>
        ) : null}
      </div>
    </>
  );
}
