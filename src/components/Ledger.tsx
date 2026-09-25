import Image from "next/image";
import Link from "next/link";
import { clock, dayHeader, dayMonth, monthTitle, shiftYm } from "@/lib/dates";
import { groupIndian, rupeesExact, signedAmount } from "@/lib/money";
import type { Entry, LedgerFilter, Tag } from "@/lib/types";
import { maskRef } from "@/lib/wire/parse";
import { PAGE_SIZE } from "@/server/services/entries";
import { QuickEntry } from "./QuickEntry";
import s from "./Ledger.module.css";

const FILTERS: { key: LedgerFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "wire", label: "From the wire" },
  { key: "hand", label: "By hand" },
  { key: "untagged", label: "Untagged" },
];

export function ledgerHref(p: { ym?: string; currentYm: string; filter?: LedgerFilter; q?: string; tag?: Tag | null; page?: number }) {
  const sp = new URLSearchParams();
  if (p.ym && p.ym !== p.currentYm) sp.set("m", p.ym);
  if (p.filter && p.filter !== "all") sp.set("filter", p.filter);
  if (p.q) sp.set("q", p.q);
  if (p.tag) sp.set("tag", String(p.tag.id));
  if (p.page && p.page > 1) sp.set("page", String(p.page));
  const qs = sp.toString();
  return qs ? `/?${qs}` : "/";
}

export function Ledger({
  entries, total, page, pages, filter, q, tag, ym, currentYm, today, tags, bookIsEmpty,
}: {
  entries: Entry[];
  total: number;
  page: number;
  pages: number;
  filter: LedgerFilter;
  q?: string;
  tag: Tag | null;
  ym: string;
  currentYm: string;
  today: string;
  tags: Tag[];
  bookIsEmpty: boolean;
}) {
  const link = (over: { ym?: string; filter?: LedgerFilter; q?: string; tag?: Tag | null; page?: number }) =>
    ledgerHref({ ym, filter, q, tag, currentYm, ...over });
  const dayNet = new Map<string, number>();
  for (const e of entries) dayNet.set(e.occurredAt.slice(0, 10), (dayNet.get(e.occurredAt.slice(0, 10)) ?? 0) + e.amount);
  const year = ym.slice(0, 4);

  return (
    <section className={s.ledger} aria-labelledby="ledger-title">
      <div className="section-head">
        <h2 id="ledger-title">
          The Ledger
          <small>
            {total} {total === 1 ? "entry" : "entries"} · {monthTitle(ym).toUpperCase()} {year}
            {q && ` · matching “${q}”`}
          </small>
          {tag && (
            <Link className={`stamp ${s.tagFilter}`} data-color={tag.color} href={link({ tag: null, page: 1 })} aria-label={`Showing ${tag.name} only. Remove this filter`}>
              {tag.name} ×
            </Link>
          )}
        </h2>
        <div className={s.headControls}>
          <nav className={s.months} aria-label="Month">
            <Link className="chip" href={link({ ym: shiftYm(ym, -1), page: 1 })} aria-label="Previous month" scroll={false}>
              ‹ {monthTitle(shiftYm(ym, -1)).slice(0, 3)}
            </Link>
            {ym < currentYm ? (
              <Link className="chip" href={link({ ym: shiftYm(ym, 1), page: 1 })} aria-label="Next month" scroll={false}>
                {monthTitle(shiftYm(ym, 1)).slice(0, 3)} ›
              </Link>
            ) : null}
            {ym !== currentYm && (
              <Link className="chip" href={link({ ym: currentYm, page: 1 })} scroll={false}>
                This month
              </Link>
            )}
          </nav>
          <nav className="chips" aria-label="Filter the ledger">
            {FILTERS.map((f) => (
              <Link key={f.key} href={link({ filter: f.key, page: 1 })} className="chip" aria-current={f.key === filter} scroll={false}>
                {f.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {ym === currentYm ? (
        <QuickEntry today={today} tags={tags} />
      ) : (
        <Link href={`/new?date=${ym}-01`} className={s.addPast}>
          + Add a line to {monthTitle(ym)} {year}
        </Link>
      )}

      <div className={s.head} aria-hidden>
        <span>Date</span>
        <span>Payee &amp; channel</span>
        <span>Tag</span>
        <span className={s.num}>Amount ₹</span>
        <span className={s.num}>Balance ₹</span>
      </div>
      <div className="rule" />

      {entries.length === 0 ? (
        <Empty bookIsEmpty={bookIsEmpty} q={q} filter={tag ? "tag" : filter} ym={ym} clearHref={link({ q: "", filter: "all", tag: null, page: 1 })} />
      ) : (
        <ol className={s.rows}>
          {entries.map((e, i) => {
            const day = e.occurredAt.slice(0, 10);
            const firstOfDay = i === 0 || entries[i - 1].occurredAt.slice(0, 10) !== day;
            const net = dayNet.get(day) ?? 0;
            return (
              <li key={e.id}>
                {firstOfDay && (
                  <div className={s.dayHead}>
                    <span>{dayHeader(e.occurredAt)}</span>
                    <span>
                      {net < 0 ? "−" : "+"}
                      {rupeesExact(net)}
                    </span>
                  </div>
                )}
                <Row e={e} />
              </li>
            );
          })}
        </ol>
      )}

      <div className={s.foot}>
        <span className="caption">
          {total > 0 && `Showing ${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + entries.length} of ${total}`}
        </span>
        {pages > 1 && <Pager page={page} pages={pages} href={(p) => link({ page: p })} />}
      </div>
    </section>
  );
}

function Empty({ bookIsEmpty, q, filter, ym, clearHref }: { bookIsEmpty: boolean; q?: string; filter: LedgerFilter | "tag"; ym: string; clearHref: string }) {
  if (bookIsEmpty)
    return (
      <div className="empty-state">
        <h3>Your book is open.</h3>
        <p>
          Write the first line above — who you paid and how much. Payments from your bank alerts will appear on the wire as they
          arrive; confirm them and they land here too.
        </p>
      </div>
    );
  if (q)
    return (
      <div className="empty-state">
        <h3>Nothing matches “{q}”.</h3>
        <p>Search looks at payee names, notes, references and accounts in {monthTitle(ym)}. Try another month or a shorter word.</p>
        <Link className="btn btn-line" href={clearHref}>
          Clear search
        </Link>
      </div>
    );
  if (filter !== "all")
    return (
      <div className="empty-state">
        <h3>
          {filter === "untagged" ? "Every spend this month has a tag."
            : filter === "wire" ? "Nothing came from the wire this month."
            : filter === "tag" ? "Nothing stamped with this tag this month."
            : "Nothing written by hand this month."}
        </h3>
        <Link className="btn btn-line" href={clearHref}>
          Show all lines
        </Link>
      </div>
    );
  return (
    <div className="empty-state">
      <h3>No lines in {monthTitle(ym)}.</h3>
      <p>Nothing was recorded this month.</p>
    </div>
  );
}

function Row({ e }: { e: Entry }) {
  const meta = [
    e.channel,
    e.ref && (e.channel === "UPI" || e.channel === "IMPS" ? `RRN ${maskRef(e.ref)}` : maskRef(e.ref)),
    e.note,
    e.account,
  ].filter(Boolean);
  const metaSm = [clock(e.occurredAt), e.channel, e.ref ? maskRef(e.ref) : e.note].filter(Boolean);

  return (
    <div className={s.row}>
      <div className={s.date}>
        <span>{dayMonth(e.occurredAt)}</span>
        <span className={s.time}>{clock(e.occurredAt)}</span>
      </div>
      <div className={s.payee}>
        <div className={s.payeeLine}>
          <Link href={`/entries/${e.id}`} className={s.payeeName}>
            {e.payee}
          </Link>
          {e.source === "wire" && (
            <span className="auto-badge" title={e.auto ? "Filed automatically from your bank mail" : "Confirmed from your bank mail"}>
              <Image src="/icons/auto-dot.svg" alt="" width={4} height={4} />
              {e.auto ? "AUTO" : "WIRE"}
            </span>
          )}
        </div>
        <span className={s.meta}>{meta.join(" · ")}</span>
      </div>
      <div className={s.tag}>
        {e.personId ? (
          <Link href={`/slate?person=${e.personId}`} className={s.onSlate}>
            Slate · {e.personName}
          </Link>
        ) : e.tag ? (
          <span className="stamp" data-color={e.tag.color}>
            {e.tag.name}
          </span>
        ) : e.amount < 0 ? (
          <Link href={`/entries/${e.id}`} className={s.untagged}>
            + Tag
          </Link>
        ) : null}
        <span className={s.metaSm}>{metaSm.join(" · ")}</span>
      </div>
      <span className={s.amount} data-credit={e.amount > 0 || undefined}>
        {signedAmount(e.amount)}
      </span>
      <span className={s.balance}>{e.balance < 0 ? "−" : ""}{groupIndian(Math.round(Math.abs(e.balance) / 100))}</span>
    </div>
  );
}

function Pager({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  const shown = [...new Set([1, 2, page - 1, page, page + 1, pages - 1, pages])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  return (
    <nav className={s.pager} aria-label="Pages">
      <Link className="chip" href={href(Math.max(1, page - 1))} aria-disabled={page === 1} aria-label="Previous page" scroll={false}>
        ‹
      </Link>
      {shown.map((p, i) => (
        <span key={p} className={s.pagerGroup}>
          {i > 0 && p - shown[i - 1] > 1 && <span className="chip" aria-hidden>…</span>}
          <Link className="chip" href={href(p)} aria-current={p === page} scroll={false}>
            {p}
          </Link>
        </span>
      ))}
      <Link className="chip" href={href(Math.min(pages, page + 1))} aria-disabled={page === pages} aria-label="Next page" scroll={false}>
        ›
      </Link>
    </nav>
  );
}
