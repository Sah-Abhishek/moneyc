import Image from "next/image";
import Link from "next/link";
import { monthLong, monthShort, shiftYm } from "@/lib/dates";
import { percent, rupees, splitRupees } from "@/lib/money";
import type { TagColor } from "@/lib/types";
import type { MonthSummary } from "@/server/services/summary";
import { BurnRate } from "./BurnRate";
import s from "./FrontPage.module.css";

export function FrontPage({ m }: { m: MonthSummary }) {
  return (
    <section className={s.front} aria-label="This month">
      <SpendPanel m={m} />
      <KeyFigures m={m} />
    </section>
  );
}

function SpendPanel({ m }: { m: MonthSummary }) {
  const [whole, frac] = splitRupees(m.spent);
  const delta = m.spent - m.prevSpent;
  const prevName = monthLong(shiftYm(m.ym, -1));
  const used = m.budget ? m.spent / m.budget : 0;
  const avg = m.daysElapsed ? m.spent / m.daysElapsed : 0;
  const daysLeft = m.days - m.daysElapsed;
  const year = m.ym.slice(0, 4);

  return (
    <div className={s.panel} id="budget">
      <div className={s.panelHead}>
        <div className={s.panelEyebrow}>
          <span>
            Spent · {monthLong(m.ym)} <span className={s.hideSm}>{year}</span>
          </span>
          <span className={s.dim}>
            <span className={s.hideSm}>Cycle </span>01 — {m.days} {monthShort(m.ym)}
          </span>
        </div>
        <p className={s.hero} aria-label={`₹${whole}${frac} spent`}>
          <span className={s.heroSign}>₹</span>
          <span className={s.heroWhole}>{whole}</span>
          <span className={s.heroFrac}>{frac}</span>
        </p>
        {m.prevSpent > 0 && (
          <p className={s.delta}>
            {delta >= 0 ? (
              <Image src="/icons/up-triangle.svg" alt="" width={9} height={7} />
            ) : (
              <span className={s.downTri} aria-hidden />
            )}
            <span className={s.deltaPct} data-direction={delta < 0 ? "down" : "up"}>
              {percent(Math.abs(delta), m.prevSpent, 1)} {delta < 0 ? "under" : "on"} {prevName}
            </span>
            <span className={s.bar} aria-hidden />
            <span className={s.dim}>
              ₹{rupees(delta)} {delta < 0 ? "less" : "more"}
              <span className={s.hideSm}> than last month</span>
            </span>
          </p>
        )}
      </div>

      <div className={s.chart}>
        <BurnRate daily={m.daily} daysElapsed={m.daysElapsed} average={avg} monthShort={monthShort(m.ym)} />
        <div className={s.axis}>
          <span>01 {monthShort(m.ym)}</span>
          <span className={s.hideSm}>— — —&nbsp; Daily average ₹{rupees(avg)}</span>
          <span>
            {m.days} {monthShort(m.ym)}
          </span>
        </div>
      </div>

      {m.budget ? (
        <div className={s.budget}>
          <div className={s.panelEyebrow}>
            <span>
              <span className={s.hideSm}>Monthly </span>budget ₹{rupees(m.budget)}
            </span>
            <span>
              {used > 1 ? `Over by ₹${rupees(m.spent - m.budget)}` : `${(used * 100).toFixed(1)}% used`}
              {m.isCurrent && ` · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
            </span>
          </div>
          <div
            className={s.track}
            role="meter"
            aria-label="Budget used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.round(used * 100))}
            aria-valuetext={`${Math.round(used * 100)}% of the monthly budget used`}
          >
            <div className={s.fill} style={{ width: `${Math.min(100, used * 100)}%` }} data-over={used > 1} />
          </div>
        </div>
      ) : (
        <div className={s.budget}>
          <div className={s.panelEyebrow}>
            <span>No monthly budget set</span>
            <Link href="/budgets" className={s.setBudget}>
              Set a budget →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function KeyFigures({ m }: { m: MonthSummary }) {
  const net = m.received - m.spent;
  const receivedNote = m.receivedCount ? `${m.receivedCount} credit${m.receivedCount === 1 ? "" : "s"}` : "Nothing in yet";

  // Top four tags by spend, then everything else (smaller tags + untagged).
  const tagged = m.byTag.filter((t) => t.tag);
  const top = tagged.slice(0, 4);
  const rest = m.spent - top.reduce((a, t) => a + t.total, 0);
  const rows: { name: string; color: TagColor; total: number }[] = [
    ...top.map((t) => ({ name: t.tag!.name, color: t.tag!.color, total: t.total })),
    ...(rest > 0 ? [{ name: "Everything else", color: "faint" as const, total: rest }] : []),
  ];

  return (
    <div className={s.figures}>
      <div className={s.figRow}>
        <Figure label="Received" value={rupees(m.received)} note={receivedNote} />
        <Figure
          label={net >= 0 ? "Net saved" : "Net overspent"}
          value={rupees(net)}
          note={m.received ? `${percent(Math.abs(net), m.received, 1)} of income` : "No income yet"}
        />
      </div>
      <div className="rule-hair" />
      <div className={s.figRow}>
        <Figure
          label="From the wire"
          value={String(m.wireCount)}
          plain
          note={m.entryCount ? `of ${m.entryCount} entries · ${percent(m.wireCount, m.entryCount)}` : "No entries yet"}
        />
        <Figure
          label="Avg / day"
          value={rupees(m.daysElapsed ? m.spent / m.daysElapsed : 0)}
          note={m.daysElapsed ? `over ${m.daysElapsed} day${m.daysElapsed === 1 ? "" : "s"}` : "month not started"}
        />
      </div>
      <div className="rule-hair" />
      <div className={s.went}>
        <div className={s.wentHead}>
          <span className="eyebrow">Where it went</span>
          <span className="caption">{rows.length ? `${rows.length} tag${rows.length === 1 ? "" : "s"}` : ""}</span>
        </div>
        {rows.length === 0 && <p className={s.wentEmpty}>Nothing spent {m.isCurrent ? "yet this month" : "this month"}. When lines come in, this shows where the money went.</p>}
        <div className={s.segments} aria-hidden>
          {rows.map((r) => (
            <span
              key={r.name}
              data-color={r.color}
              style={{ flexGrow: r.total }}
              title={`${r.name} · ₹${rupees(r.total)}`}
            />
          ))}
        </div>
        <ul className={s.legend}>
          {rows.map((r) => (
            <li key={r.name}>
              <span className={s.legendName}>
                <span className="swatch" data-color={r.color} />
                {r.name}
              </span>
              <span className={s.legendFig}>
                <span>₹{rupees(r.total)}</span>
                <span className={s.legendPct}>{percent(r.total, m.spent)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Figure({ label, value, note, plain }: { label: string; value: string; note: string; plain?: boolean }) {
  return (
    <div className={s.figure}>
      <span className={s.figLabel}>{label}</span>
      <span className={s.figValue}>
        {!plain && <span className={s.figSign}>₹</span>}
        <span className="serif">{value}</span>
      </span>
      <span className="caption">{note}</span>
    </div>
  );
}

