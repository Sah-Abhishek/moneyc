import Image from "next/image";
import Link from "next/link";
import { percent, rupees } from "@/lib/money";
import type { Tag } from "@/lib/types";
import type { MonthSummary } from "@/server/services/summary";
import s from "./StampRack.module.css";

export function StampRack({ m, tags }: { m: MonthSummary; tags: Tag[] }) {
  const max = Math.max(...m.byTag.map((t) => t.total), 1);
  // Every spending tag gets a card, used this month or not.
  const cards = tags
    .filter((t) => t.kind === "spend")
    .map((t) => {
      const row = m.byTag.find((r) => r.tag?.id === t.id);
      return { tag: t, total: row?.total ?? 0, count: row?.count ?? 0 };
    })
    .sort((a, b) => b.total - a.total || a.tag.name.localeCompare(b.tag.name));
  const untagged = m.byTag.find((r) => r.tag == null);

  return (
    <section className={s.section} id="stamps" aria-labelledby="stamps-title">
      <div className="rule" />
      <div className="section-head">
        <h2 id="stamps-title">
          The Stamp Rack <small>Every tag you stamp on a line</small>
        </h2>
        <div className="chips">
          <Link className="chip" href="/tags">
            Rename · merge
          </Link>
          <Link className="chip" href="/budgets">
            Budget per tag
          </Link>
        </div>
      </div>
      <ul className={s.rack}>
        {cards.map((c) => {
          const budget = c.tag.budget;
          const over = budget != null && c.total > budget;
          return (
            <li key={c.tag.id}>
              <Link href={`/?tag=${c.tag.id}${m.isCurrent ? "" : `&m=${m.ym}`}#ledger-title`} className={s.card} data-color={c.tag.color} aria-label={`${c.tag.name}: ₹${rupees(c.total)}`}>
                <span className={s.name}>
                  <span className="swatch" />
                  {c.tag.name}
                </span>
                <span className={s.fig}>
                  <span className={s.sign}>₹</span>
                  <span className="serif">{rupees(c.total)}</span>
                </span>
                <span className={s.track} data-over={over || undefined}>
                  <span style={{ width: `${budget ? Math.min(100, (c.total / budget) * 100) : (c.total / max) * 100}%` }} />
                </span>
                <span className={s.foot}>
                  <span>
                    {c.count} {c.count === 1 ? "entry" : "entries"}
                  </span>
                  <span className={s.pct}>
                    {budget != null ? (over ? `over ₹${rupees(c.total - budget)}` : `of ₹${rupees(budget)}`) : percent(c.total, m.spent)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
        {untagged && (
          <li>
            <Link href="/?filter=untagged" className={s.card} data-color="faint">
              <span className={s.name}>
                <span className="swatch" />
                Untagged
              </span>
              <span className={s.fig}>
                <span className={s.sign}>₹</span>
                <span className="serif">{rupees(untagged.total)}</span>
              </span>
              <span className={s.track}>
                <span style={{ width: `${(untagged.total / max) * 100}%` }} />
              </span>
              <span className={s.foot}>
                <span>
                  {untagged.count} to stamp
                </span>
                <span className={s.pct}>{percent(untagged.total, m.spent)}</span>
              </span>
            </Link>
          </li>
        )}
        <li>
          <Link href="/tags#new-tag" className={s.newTag}>
            <Image src="/icons/plus-ink.svg" alt="" width={16} height={16} />
            New tag
          </Link>
        </li>
      </ul>
    </section>
  );
}
