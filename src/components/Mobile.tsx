"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive } from "./MastheadClient";
import s from "./Mobile.module.css";

// Pieces that only exist on the phone layout: the wire alert strip on the
// ledger, and the bottom tab bar.

export function WireAlert({ waiting, banks }: { waiting: number; banks: string[] }) {
  if (!waiting) return null;
  return (
    <Link href="/wire" className={s.alert}>
      <span>
        <span className={s.alertTitle}>
          {waiting} mail{waiting === 1 ? "" : "s"} waiting in the wire
        </span>
        <span className={s.alertNote}>{banks.slice(0, 4).join(" · ")}&nbsp; — &nbsp;tap to file them</span>
      </span>
      <Image src="/icons/arrow-alert.svg" alt="" width={15} height={15} />
    </Link>
  );
}

const TABS = [
  { href: "/", label: "Ledger", icon: "/icons/tab-ledger.svg", w: 19 },
  { href: "/wire", label: "Wire", icon: "/icons/tab-wire.svg", w: 27 },
  { href: "/slate", label: "Slate", icon: "/icons/tab-slate.svg", w: 19 },
  { href: "/tags", label: "Tags", icon: "/icons/tab-tags.svg", w: 19 },
];

export function TabBar({ waiting }: { waiting: number }) {
  const pathname = usePathname();
  return (
    <nav className={s.tabs} aria-label="Sections">
      {TABS.map((t) => (
        <Link key={t.label} href={t.href} className={s.tab} aria-current={isActive(pathname, t.href) ? "page" : undefined}>
          <Image src={t.icon} alt="" width={t.w} height={19} className={t.label === "Wire" && !waiting ? s.noDot : undefined} />
          <span>
            {t.label}
            {t.label === "Wire" && waiting > 0 && <span className="sr-only"> ({waiting} waiting)</span>}
          </span>
        </Link>
      ))}
    </nav>
  );
}
