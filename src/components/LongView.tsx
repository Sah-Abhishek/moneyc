import Image from "next/image";
import Link from "next/link";
import { firstWeekday, monthLong, monthShort, monthTitle } from "@/lib/dates";
import { rupees } from "@/lib/money";
import type { Merchant, Range } from "@/server/services/summary";
import s from "./LongView.module.css";

const WEEK = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const RANGES: { key: Range; label: string }[] = [
  { key: "6m", label: "6 months" },
  { key: "1y", label: "1 year" },
  { key: "all", label: "All time" },
];

export function LongView({
  ym, months, daily, daysElapsed, merchants, range, full,
}: {
  ym: string;
  months: { ym: string; spent: number }[];
  daily: number[];
  daysElapsed: number;
  merchants: Merchant[];
  range: Range;
  /** on the Reports page: every merchant, range chips link within the page */
  full?: boolean;
}) {
  const rangeHref = (r: Range) => `/reports?range=${r}${ym ? `&m=${ym}` : ""}`;
  return (
    <section className={s.section} id="long-view" aria-labelledby="long-view-title">
      <div className="rule" />
      <div className="section-head">
        <h2 id="long-view-title">
          The Long View <small>How the months compare</small>
        </h2>
        <div className="chips">
          {RANGES.map((r) => (
            <Link key={r.key} className="chip" href={rangeHref(r.key)} aria-current={r.key === range} scroll={!full ? true : false}>
              {r.label}
            </Link>
          ))}
          <a className="chip" href={`/api/export?month=${ym}`} download>
            Export {monthShort(ym)}
          </a>
        </div>
      </div>
      <div className={s.grid}>
        <MonthBars ym={ym} months={months} />
        <Calendar ym={ym} daily={daily} daysElapsed={daysElapsed} />
        <Merchants ym={ym} merchants={merchants} full={full} />
      </div>
    </section>
  );
}

function MonthBars({ ym, months }: { ym: string; months: { ym: string; spent: number }[] }) {
  const max = Math.max(...months.map((x) => x.spent), 1);
  const title = months.length <= 6 ? "Six months of spending" : months.length <= 12 ? "A year of spending" : `${months.length} months of spending`;
  return (
    <div className={s.col}>
      <h3 className="eyebrow">{title}</h3>
      <ul className={s.months} data-dense={months.length > 12 || undefined}>
        {months.map((x) => {
          const current = x.ym === ym;
          return (
            <li key={x.ym} data-current={current || undefined}>
              <div className={s.monthRow}>
                <span className={s.monthName}>
                  {monthShort(x.ym)}
                  {months.length > 6 && ` ’${x.ym.slice(2, 4)}`}
                  {current && <span className={s.thisMonth}>Selected</span>}
                </span>
                <span className={s.monthFig}>₹{rupees(x.spent)}</span>
              </div>
              <div className={s.track} role="img" aria-label={`${monthLong(x.ym)} ${x.ym.slice(0, 4)}: ₹${rupees(x.spent)}`}>
                <span style={{ width: `${(x.spent / max) * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Calendar({ ym, daily, daysElapsed }: { ym: string; daily: number[]; daysElapsed: number }) {
  const lead = firstWeekday(ym);
  const cells: (number | null)[] = [...Array(lead).fill(null), ...daily.map((_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  // Five steps of one hue, split at quintiles of the days that had spending.
  const spentDays = daily.filter((v, i) => v > 0 && i < daysElapsed).sort((a, b) => a - b);
  const cut = (q: number) => spentDays[Math.min(spentDays.length - 1, Math.floor(q * spentDays.length))] ?? 0;
  const edges = [cut(0.2), cut(0.4), cut(0.6), cut(0.8)];
  const level = (v: number) => (v <= 0 ? 0 : 1 + edges.filter((e) => v > e).length);
  const busiest = daily.reduce((best, v, i) => (v > daily[best] ? i : best), 0);

  return (
    <div className={s.col}>
      <h3 className="eyebrow">{monthTitle(ym)}, day by day</h3>
      <div className={s.cal} role="table" aria-label={`${monthTitle(ym)} spending by day`}>
        <div className={s.calRow} role="row">
          {WEEK.map((d) => (
            <span key={d} className={s.weekday} role="columnheader">
              {d}
            </span>
          ))}
        </div>
        {Array.from({ length: cells.length / 7 }, (_, w) => (
          <div key={w} className={s.calRow} role="row">
            {cells.slice(w * 7, w * 7 + 7).map((day, i) => {
              if (day == null) return <span key={`x${w}-${i}`} className={s.cell} data-level="none" role="cell" />;
              const v = daily[day - 1];
              const future = day > daysElapsed;
              return (
                <span
                  key={day}
                  className={s.cell}
                  data-level={future ? "none" : level(v)}
                  role="cell"
                  aria-label={future ? `${day} ${monthShort(ym)}` : `${day} ${monthShort(ym)}: ₹${rupees(v)}`}
                  data-tip={future ? undefined : `${day} ${monthShort(ym)} · ₹${rupees(v)}`}
                >
                  {!future && day}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className={s.legend}>
        <span>Lighter</span>
        {[1, 2, 3, 4, 5].map((l) => (
          <span key={l} className={s.key} data-level={l} />
        ))}
        <span>Heavier</span>
        <span className={s.legendRule} />
        {daily[busiest] > 0 ? (
          <span className={s.busiest}>
            Busiest: {busiest + 1} {monthShort(ym)} · ₹{rupees(daily[busiest])}
          </span>
        ) : (
          <span className={s.busiest}>No spending yet</span>
        )}
      </div>
    </div>
  );
}

function Merchants({ ym, merchants, full }: { ym: string; merchants: Merchant[]; full?: boolean }) {
  const shown = full ? merchants : merchants.slice(0, 5);
  return (
    <div className={`${s.col} ${s.merchants}`}>
      <div className={s.merchHead}>
        <h3 className="eyebrow">Where it leaks</h3>
        <span className="caption">By total · {monthShort(ym)}</span>
      </div>
      <div className="rule" />
      {shown.length === 0 ? (
        <p className={s.merchEmpty}>No spending recorded in {monthTitle(ym)}.</p>
      ) : (
        <ol>
          {shown.map((x, i) => (
            <li key={x.payee}>
              <span className={s.rank}>{i + 1}</span>
              <span className={s.merchName}>
                <Link href={`/?m=${ym}&q=${encodeURIComponent(x.payee)}`}>{x.payee}</Link>
                <span className={s.merchMeta}>
                  {x.count} payment{x.count === 1 ? "" : "s"}
                  {x.tag && ` · ${x.tag.name}`}
                </span>
              </span>
              <span className={s.merchFig}>₹{rupees(x.total)}</span>
            </li>
          ))}
        </ol>
      )}
      {!full && merchants.length > 5 && (
        <Link className={s.seeAll} href={`/reports?m=${ym}#long-view`}>
          See all {merchants.length} merchants
          <Image src="/icons/arrow-right.svg" alt="" width={11} height={11} />
        </Link>
      )}
    </div>
  );
}
