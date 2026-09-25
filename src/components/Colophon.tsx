import { monthLong } from "@/lib/dates";
import { rupees } from "@/lib/money";
import s from "./Colophon.module.css";

export function Colophon({ entries, tracked, since }: { entries: number; tracked: number; since: string }) {
  return (
    <footer className={s.colophon}>
      <div className="double-rule flip" />
      <div className={s.line}>
        <span className={s.muted}>Money Control — a personal ledger</span>
        <span>
          Keeping the book since {monthLong(since.slice(0, 7))} {since.slice(0, 4)}
        </span>
        <span>
          {entries} {entries === 1 ? "entry" : "entries"} · ₹{rupees(tracked)} tracked
        </span>
      </div>
    </footer>
  );
}
