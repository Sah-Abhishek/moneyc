import { percent, rupees } from "@/lib/money";
import type { SlateStats } from "@/server/services/slate";
import s from "./slate.module.css";

export function SlateOverview({ stats, openCount }: { stats: SlateStats; openCount: number }) {
  const favour = stats.net >= 0;
  const total = stats.owedToYou + stats.youOwe;
  return (
    <section className={s.overview} aria-label="Net position">
      <div className={s.panel}>
        <div className={s.panelEyebrow}>
          <span>Net position · the slate</span>
          <span className={s.dim}>
            {openCount} open account{openCount === 1 ? "" : "s"}
          </span>
        </div>
        <p className={s.hero}>
          <span className={s.heroSign}>₹</span>
          <span className={s.heroFig}>{rupees(stats.net)}</span>
        </p>
        <p className={s.favour}>
          <em>{stats.net === 0 ? "all square" : favour ? "in your favour" : "you owe, net"}</em>
          {stats.oldestDays != null && stats.oldestDays > 0 && (
            <>
              <span className={s.bar} aria-hidden />
              <span className={s.oldest}>Oldest debt {stats.oldestDays} days</span>
            </>
          )}
        </p>
        {total === 0 ? (
          <p className={s.clean}>No money is outstanding in either direction.</p>
        ) : (
        <div className={s.pages}>
          <div className={s.pageCol} style={{ flexGrow: stats.owedToYou || 0.0001 }}>
            <span className={s.pageLabel}>Owed to you</span>
            <span className={s.pageFig}>₹{rupees(stats.owedToYou)}</span>
            <span className={s.pageBar} data-side="owed" />
            <span className={s.pageCount}>
              {stats.owedCount} account{stats.owedCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className={s.pageCol} style={{ flexGrow: stats.youOwe || 0.0001 }} data-side="owe">
            <span className={s.pageLabel}>You owe</span>
            <span className={s.pageFig}>₹{rupees(stats.youOwe)}</span>
            <span className={s.pageBar} data-side="owe" />
            <span className={s.pageCount}>
              {stats.oweCount} account{stats.oweCount === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        )}
      </div>

      <div className={s.figures}>
        <div className={s.figRow}>
          <Figure label="Lent out this week" value={`₹${rupees(stats.lentThisWeek)}`} note={`${stats.newAccountsThisWeek} newly opened`} />
          <Figure label="Came back" value={`₹${rupees(stats.cameBackThisWeek)}`} note={`${stats.repaymentsThisWeek} repayment${stats.repaymentsThisWeek === 1 ? "" : "s"} this week`} tone="credit" />
        </div>
        <div className={s.figRow}>
          <Figure label="Reminders sent" value={String(stats.reminders)} note={`across ${stats.remindedPeople} ${stats.remindedPeople === 1 ? "person" : "people"}`} />
          <Figure label="Overdue" value={`₹${rupees(stats.overdue)}`} note="older than 90 days" tone={stats.overdue ? "spend" : undefined} />
        </div>
        <div className={s.aging}>
          <div className={s.agingHead}>
            <span className="eyebrow">How old the money is</span>
            <span className="caption">₹{rupees(stats.owedToYou)} out</span>
          </div>
          {stats.owedToYou > 0 ? (
            <>
              <div className={s.agingBar} aria-hidden>
                {stats.aging.filter((b) => b.total > 0).map((b) => (
                  <span key={b.label} data-color={b.color} style={{ flexGrow: b.total }} />
                ))}
              </div>
              <ul className={s.agingLegend}>
                {stats.aging.map((b) => (
                  <li key={b.label}>
                    <span>
                      <span className="swatch" data-color={b.color} /> {b.label}
                    </span>
                    <span className={s.agingFig}>
                      ₹{rupees(b.total)} <span>{percent(b.total, stats.owedToYou)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className={s.agingEmpty}>Nobody owes you anything right now.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Figure({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "credit" | "spend" }) {
  return (
    <div className={s.figure}>
      <span className={s.figLabel}>{label}</span>
      <span className={s.figValue} data-tone={tone}>
        {value}
      </span>
      <span className="caption">{note}</span>
    </div>
  );
}
