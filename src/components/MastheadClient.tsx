"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import s from "./Masthead.module.css";

export const SECTIONS = [
  { href: "/", label: "The Ledger", short: "Ledger" },
  { href: "/wire", label: "The Wire", short: "Wire", badge: true },
  { href: "/slate", label: "The Slate", short: "Slate" },
  { href: "/tags", label: "Tags", short: "Tags" },
  { href: "/budgets", label: "Budgets", short: "Budgets" },
  { href: "/reports", label: "Reports", short: "Reports" },
  { href: "/rules", label: "Rules", short: "Rules" },
] as const;

export const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" || pathname.startsWith("/entries") || pathname === "/new" : pathname.startsWith(href);

export function NavLinks({ waiting }: { waiting: number }) {
  const pathname = usePathname();
  return (
    <nav className={s.nav} aria-label="Sections">
      {SECTIONS.map((n) => (
        <Link key={n.href} href={n.href} className={s.navItem} aria-current={isActive(pathname, n.href) ? "page" : undefined}>
          <span className={s.navLabel}>
            <span className={s.hideSm}>{n.label}</span>
            <span className={s.showSm}>{n.short}</span>
            {"badge" in n && waiting > 0 && (
              <span className={s.badge} aria-label={`${waiting} waiting`}>
                {waiting > 99 ? "99+" : waiting}
              </span>
            )}
          </span>
        </Link>
      ))}
    </nav>
  );
}

/** Searches the ledger; on the slate it searches people instead. */
export function SearchBox() {
  const pathname = usePathname();
  const params = useSearchParams();
  const onSlate = pathname.startsWith("/slate");
  return (
    <form role="search" action={onSlate ? "/slate" : "/"} className={s.search}>
      <Image src="/icons/search.svg" alt="" width={14} height={14} />
      <label className="sr-only" htmlFor="q">
        {onSlate ? "Search people" : "Search the ledger"}
      </label>
      <input
        key={pathname}
        id="q"
        name="q"
        type="search"
        maxLength={100}
        defaultValue={params.get("q") ?? ""}
        placeholder={onSlate ? "Search people" : "Search the ledger"}
      />
    </form>
  );
}
