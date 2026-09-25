import Link from "next/link";
import { monthLong, monthShort, monthTitle, shiftYm } from "@/lib/dates";
import { percent, rupees } from "@/lib/money";
import type { GroupReport } from "@/server/services/summary";
import s from "./GroupReports.module.css";

// Spending read through tag groups: each group's month, split by its tags.
// `selected` narrows the page to one group (?group=); a tag in two groups
// counts in both, so the groups need not add up to the month.
export function GroupReports({ ym, reports, selected, hrefFor }: { ym: string; reports: GroupReport[]; selected: number | null; hrefFor: (group: number | null) => string }) {
  const shown = selected == null ? reports : reports.filter((r) => r.group.id === selected);
  return (
    <section className={s.section} id="groups" aria-labelledby="groups-title">
      <div className="rule" />
      <div className="section-head">
        <h2 id="groups-title">
          By group <small>{monthTitle(ym)} {ym.slice(0, 4)}, read through your tag groups</small>
        </h2>
        {reports.length > 1 && (
          <nav className="chips" aria-label="Show one group">
            <Link className="chip" href={hrefFor(null)} aria-current={selected == null} scroll={false}>
              All groups
            </Link>
            {reports.map((r) => (
              <Link key={r.group.id} className="chip" href={hrefFor(r.group.id)} aria-current={r.group.id === selected} scroll={false}>
                {r.group.name}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {reports.length === 0 ? (
        <div className="empty-state">
          <h3>No tag groups yet.</h3>
          <p>Gather tags under one name, like Health for Healthy, Junk and Leisure, to see what each group cost this month.</p>
          <Link className="btn btn-line" href="/tags#groups">
            Make a group
          </Link>
        </div>
      ) : (
        <div className={s.grid}>
          {shown.map((r) => (
            <Group key={r.group.id} r={r} />
          ))}
        </div>
      )}
    </section>
  );
}

function Group({ r }: { r: GroupReport }) {
  const max = Math.max(...r.byTag.map((t) => t.total), 1);
  const delta = r.spent - r.prevSpent;
  const prev = monthLong(shiftYm(r.ym, -1));
  return (
    <article className={s.group} aria-labelledby={`g-${r.group.id}`}>
      <header className={s.head}>
        <h3 id={`g-${r.group.id}`} className={s.name}>
          {r.group.name}
        </h3>
        <p className={s.total}>
          <span className={s.sign}>₹</span>
          {rupees(r.spent)}
        </p>
        <p className="caption">
          {r.count} line{r.count === 1 ? "" : "s"}
          {r.prevSpent > 0
            ? ` · ${delta === 0 ? "same as" : `₹${rupees(delta)} ${delta < 0 ? "less than" : "more than"}`} ${prev}`
            : r.spent > 0
              ? ` · nothing in ${prev}`
              : ""}
        </p>
      </header>
      <ul className={s.bars}>
        {r.byTag.map((t) => (
          <li key={t.tag.id}>
            <div className={s.barRow}>
              <Link href={`/?m=${r.ym}&tag=${t.tag.id}`} className={s.tagName}>
                <span className="swatch" data-color={t.tag.color} />
                {t.tag.name}
              </Link>
              <span className={s.fig}>
                ₹{rupees(t.total)}
                <span className={s.pct}>{r.spent ? percent(t.total, r.spent) : "—"}</span>
              </span>
            </div>
            <div
              className={s.track}
              role="img"
              aria-label={`${t.tag.name}: ₹${rupees(t.total)} over ${t.count} line${t.count === 1 ? "" : "s"}`}
              title={`${t.tag.name} · ₹${rupees(t.total)} · ${t.count} line${t.count === 1 ? "" : "s"} in ${monthShort(r.ym)}`}
            >
              <span data-color={t.tag.color} style={{ width: `${(t.total / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
      {r.count > 0 ? (
        <Link className={s.see} href={`/?m=${r.ym}&group=${r.group.id}`}>
          See the {r.count} line{r.count === 1 ? "" : "s"} →
        </Link>
      ) : (
        <p className="caption">Nothing spent on these tags in {monthLong(r.ym)}.</p>
      )}
    </article>
  );
}
