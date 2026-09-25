import Image from "next/image";
import Link from "next/link";
import { longDate, wallClock } from "@/lib/dates";
import { NavLinks, SearchBox } from "./MastheadClient";
import { WireStatus, type WireStatusProps } from "./WireStatus";
import s from "./Masthead.module.css";

export function Masthead({
  issue,
  initial,
  tz,
  wire,
}: {
  issue: number;
  initial: string;
  tz: string;
  wire: WireStatusProps & { waiting: number };
}) {
  return (
    <header className={s.masthead}>
      <div className={s.top}>
        <Link href="/" className={s.wordmark}>
          <span className={s.issue}>Personal ledger · No. {String(issue).padStart(2, "0")}</span>
          <span className={s.title}>Money Control</span>
        </Link>
        <div className={s.utilities}>
          <WireStatus {...wire} dateLabel={longDate(wallClock(tz))} />
          <Link href="/settings" className={s.avatar} aria-label="Your account and settings" title="Account & settings">
            {initial}
          </Link>
        </div>
      </div>
      <div className="double-rule" />
      <div className={s.sectionLine}>
        <NavLinks waiting={wire.waiting} />
        <div className={s.actions}>
          <SearchBox />
          <Link href="/new" className="btn btn-ink">
            <Image src="/icons/plus-paper.svg" alt="" width={12} height={12} />
            New entry
          </Link>
        </div>
      </div>
      <div className="rule" />
    </header>
  );
}
