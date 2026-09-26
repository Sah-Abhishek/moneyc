import Link from "next/link";
import { dayMonth, daysBetween } from "@/lib/dates";
import { rupees } from "@/lib/money";
import type { Account } from "@/server/services/slate";
import { RemindButton } from "./SlateActions";
import s from "./slate.module.css";

// The double-entry book: owed to you on the left page, you owe on the right.
export function SlatePages({ accounts, now, openId }: { accounts: Account[]; now: string; openId: number | null }) {
  const owed = accounts.filter((a) => a.balance > 0).sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));
  const owe = accounts.filter((a) => a.balance < 0).sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));
  const settled = accounts.filter((a) => a.balance === 0);
  if (accounts.length === 0) return null;

  return (
    <div className={s.book}>
      <Page title="Owed to you" dek="They borrowed from you" rows={owed} openId={openId} side="owed" today={now.slice(0, 10)} />
      <div className={s.gutter} aria-hidden />
      <Page title="You owe" dek="You borrowed from them" rows={owe} openId={openId} side="owe" today={now.slice(0, 10)} />
      {settled.length > 0 && (
        <div className={s.settled}>
          <span className="eyebrow">Settled</span>
          <span className={s.settledNames}>
            {settled.map((a, i) => (
              <span key={a.id}>
                {i > 0 && " · "}
                <Link href={`/slate?person=${a.id}#account`}>{a.name}</Link>
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}

function Page({ title, dek, rows, openId, side, today }: { title: string; dek: string; rows: Account[]; openId: number | null; side: "owed" | "owe"; today: string }) {
  const total = rows.reduce((t, a) => t + Math.abs(a.balance), 0);
  return (
    <section className={s.page} aria-label={title}>
      <div className={s.pageHead}>
        <h2>
          {title} <small>{dek}</small>
        </h2>
        <span className={s.pageTotal}>
          <span className={s.sign}>₹</span>
          {rupees(total)}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className={s.pageEmpty}>{side === "owed" ? "Nobody owes you money." : "You don't owe anyone."}</p>
      ) : (
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col" colSpan={2}>Who</th>
              <th scope="col">Age</th>
              <th scope="col" className={s.num}>Amount ₹</th>
              <th scope="col" className={s.num}>Do</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const age = a.ageDays ?? 0;
              const tone = age > 90 ? "spend" : age > 30 ? "pending" : "credit";
              return (
                <tr key={a.id} data-open={a.id === openId || undefined}>
                  <td className={s.initialCell}>
                    <span className={s.initial} data-color={side === "owed" ? "indigo" : "plum"} aria-hidden>
                      {a.name.trim()[0]?.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <Link href={`/slate?person=${a.id}#account`} className={s.who}>
                      {a.name}
                    </Link>
                    <span className={s.whoMeta}>
                      {a.lineCount} {a.lineCount === 1 ? "entry" : "entries"}
                      {a.openSince && ` · since ${dayMonth(a.openSince)}`}
                    </span>
                    {a.promisedBy && (
                      <span className={s.promise} data-late={a.promisedBy < today || undefined}>
                        {a.promisedBy < today
                          ? `Promised by ${dayMonth(a.promisedBy)} · ${daysBetween(a.promisedBy, today)} days late`
                          : `Promised by ${dayMonth(a.promisedBy)}`}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={s.age} data-color={tone}>
                      <span className="swatch" /> {age} day{age === 1 ? "" : "s"}
                    </span>
                  </td>
                  <td className={`${s.num} ${s.amount}`}>{rupees(a.balance)}</td>
                  <td className={s.num}>
                    {side === "owed" ? (
                      <RemindButton personId={a.id} name={a.name} age={age} />
                    ) : (
                      <Link className={s.doLink} href={`/slate?person=${a.id}#record`}>
                        Pay back
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className={s.pageFoot}>
        <span className="caption">
          {rows.length} open account{rows.length === 1 ? "" : "s"}
        </span>
        <span className={s.pageFootTotal}>
          Total <strong>₹{rupees(total)}</strong>
        </span>
      </div>
    </section>
  );
}
