"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { syncWireAction } from "@/app/actions/wire";
import { ago } from "@/lib/dates";
import { callAction } from "./ui/useSubmit";
import { useToast } from "./ui/Toaster";
import s from "./Masthead.module.css";

export interface WireStatusProps {
  connection: "connected" | "reconnect" | "no_gmail_scope" | "not_configured";
  lastSuccessAt: string | null;
  lastError: string | null;
}

// Sync automatically when the page opens (if the last read is stale) and every
// few minutes while the tab is visible. Clicking the chip reads mail now.
const STALE_MS = 5 * 60_000;
const EVERY_MS = 10 * 60_000;

type Phase = "idle" | "syncing" | "error";

export function WireStatus({ connection, lastSuccessAt, lastError, dateLabel }: WireStatusProps & { dateLabel: string }) {
  const pathname = usePathname();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>(lastError ? "error" : "idle");
  const [message, setMessage] = useState<string | null>(lastError);
  const [lastOk, setLastOk] = useState(lastSuccessAt);
  const running = useRef(false);

  const sync = useCallback(
    async (force: boolean) => {
      if (running.current || connection !== "connected") return;
      running.current = true;
      setPhase("syncing");
      let added = 0;
      let filed = 0;
      let tooSoon = false;
      try {
        // A big first read arrives in batches; keep going while the server says there's more.
        for (let batch = 0; batch < 20; batch++) {
          const r = await callAction(() => syncWireAction(force || batch > 0), { quiet: true });
          if (!r.ok) {
            setPhase("error");
            setMessage(r.error);
            if (force) toast({ message: r.error, tone: "error" });
            return;
          }
          added += r.data?.added ?? 0;
          filed += r.data?.autoFiled ?? 0;
          if (r.data?.state === "done") setLastOk(new Date().toISOString());
          tooSoon = r.data?.state === "too_soon";
          if (!r.data?.more) break;
        }
        setPhase("idle");
        setMessage(null);
        if (added) {
          const waiting = added - filed;
          toast({
            tone: "info",
            message: [waiting && `${waiting} new mail${waiting === 1 ? "" : "s"} on the wire`, filed && `${filed} filed automatically`].filter(Boolean).join(" · "),
          });
        } else if (force) toast({ tone: "info", message: tooSoon ? "The wire was read a moment ago. Try again in a few seconds." : "The wire is up to date." });
      } finally {
        running.current = false;
      }
    },
    [connection, toast],
  );

  useEffect(() => {
    if (connection !== "connected") return;
    const stale = !lastSuccessAt || Date.now() - Date.parse(lastSuccessAt) > STALE_MS;
    if (stale) void sync(false);
    const t = setInterval(() => document.visibilityState === "visible" && void sync(false), EVERY_MS);
    return () => clearInterval(t);
  }, [connection, lastSuccessAt, sync]);

  const note =
    connection === "not_configured" ? "Mail sync not set up"
    : connection !== "connected" ? "Not reading mail"
    : phase === "error" ? "Wire paused"
    : lastOk ? `Wire synced ${ago(lastOk)}` : "Not synced yet";

  return (
    <>
      <div className={s.dateline}>
        <span>{dateLabel}</span>
        <span className={s.faint} id="wire-sync-note" title={phase === "error" ? message ?? undefined : undefined} suppressHydrationWarning>
          {note}
        </span>
      </div>
      <span className={s.divider} aria-hidden />
      {wireChip()}
    </>
  );

  function wireChip() {
    if (connection === "not_configured")
      return (
        <span className={s.live} data-state="off" title="Google sign-in isn't configured on this server">
          Wire offline
        </span>
      );
    if (connection !== "connected")
      return (
        <Link className={s.live} data-state="warn" href={`/auth/google?next=${encodeURIComponent(pathname)}`}>
          {connection === "no_gmail_scope" ? "Allow mail access" : "Reconnect Gmail"}
        </Link>
      );
    return (
      <button
        type="button"
        className={s.live}
        data-state={phase === "error" ? "warn" : phase}
        onClick={() => sync(true)}
        disabled={phase === "syncing"}
        aria-describedby="wire-sync-note"
        title={message ?? "Read new bank mail now"}
      >
        {phase !== "error" && <Image src="/icons/live-dot.svg" alt="" width={7} height={7} />}
        <span>{phase === "syncing" ? "Reading mail…" : phase === "error" ? "Retry" : <><span className={s.hideSm}>Wire </span>live</>}</span>
      </button>
    );
  }
}
