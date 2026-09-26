import Image from "next/image";
import Link from "next/link";
import { clock, dayMonth, dayMonthYear, daysBetween } from "@/lib/dates";
import { rupees } from "@/lib/money";
import { maskRef } from "@/lib/wire/parse";
import type { Account, SlateLine } from "@/server/services/slate";
import { ClearPromise, DeleteSlateLine, PersonEditor, RemindButton, SettleUp, SlateLineForm } from "./SlateActions";
import s from "./slate.module.css";

export function OpenAccount({ account, lines, others, now }: { account: Account; lines: SlateLine[]; others: Account[]; now: string }) {
  const b = account.balance;
  const newestFirst = [...lines].reverse();
  const matched = lines.filter((l) => l.fromWire).length;
  const late = account.promisedBy && account.promisedBy < now.slice(0, 10) ? daysBetween(account.promisedBy, now) : 0;

  return (
    <section className={s.accountSection} id="account" aria-labelledby="account-title">
      <div className="rule" />
      <div className="section-head">
        <h2 id="account-title">
          An open account <small>Every rupee that moved between you</small>
        </h2>
        <nav className="chips" aria-label="Other accounts">
          <span className="chip" aria-current="true">
            {account.name}
          </span>
          {others.map((o) => (
            <Link key={o.id} className="chip" href={`/slate?person=${o.id}#account`}>
              {o.name}
            </Link>
          ))}
        </nav>
      </div>

      <div className={s.accountGrid}>
        <div>
          {lines.length === 0 ? (
            <div className="empty-state">
              <h3>No lines yet.</h3>
              <p>Record the first thing that moved between you and {account.name} below.</p>
            </div>
          ) : (
            <table className={s.statement}>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">What happened</th>
                  <th scope="col" className={s.num}>You gave ₹</th>
                  <th scope="col" className={s.num}>They gave ₹</th>
                  <th scope="col" className={s.num}>Balance ₹</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {newestFirst.map((l) => (
                  <tr key={l.id}>
                    <td className={s.stDate}>
                      <span>{dayMonth(l.occurredAt)}</span>
                      <span className={s.stTime}>{clock(l.occurredAt)}</span>
                    </td>
                    <td>
                      <span className={s.stWhat}>
                        {l.entryId ? <Link href={`/entries/${l.entryId}`}>{l.note}</Link> : l.note}
                        {l.fromWire && (
                          <span className="auto-badge">
                            <Image src="/icons/auto-dot.svg" alt="" width={4} height={4} /> WIRE
                          </span>
                        )}
                      </span>
                      <span className={s.stMeta}>
                        {l.fromWire ? `Matched from the wire${l.ref ? ` · RRN ${maskRef(l.ref)}` : ""}` : l.entryId ? "From the ledger" : "Entered by hand"}
                      </span>
                    </td>
                    <td className={`${s.num} ${s.stFig}`}>{l.amount > 0 ? rupees(l.amount) : "—"}</td>
                    <td className={`${s.num} ${s.stFig}`} data-credit={l.amount < 0 || undefined}>
                      {l.amount < 0 ? rupees(-l.amount) : "—"}
                    </td>
                    <td className={`${s.num} ${s.stBal}`}>{l.balance < 0 ? `−${rupees(-l.balance)}` : rupees(l.balance)}</td>
                    <td className={s.num}>{!l.entryId && <DeleteSlateLine id={l.id} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className={s.stFoot}>
            <span className="caption">
              {lines.length} {lines.length === 1 ? "entry" : "entries"}
              {account.firstLineAt && ` · opened ${dayMonthYear(account.firstLineAt)}`}
            </span>
            <span className={s.pageFootTotal}>
              {b === 0 ? "All square" : b > 0 ? "Balance owed to you" : "Balance you owe"} <strong>₹{rupees(Math.abs(b))}</strong>
            </span>
          </div>
          <SlateLineForm personId={account.id} name={account.name} now={now} balance={b} startDirection={b > 0 ? "got" : "gave"} />
        </div>

        <aside className={s.card} aria-label={`${account.name}'s account`}>
          <div className={s.cardHead}>
            <span className={s.bigInitial} aria-hidden>
              {account.name.trim()[0]?.toUpperCase()}
            </span>
            <div>
              <p className={s.cardName}>{account.name}</p>
              <p className={s.cardMeta}>{[account.matchNames[0], account.phone].filter(Boolean).join(" · ") || "No other names or phone yet"}</p>
            </div>
          </div>
          <div className={s.cardBalance}>
            <span className="eyebrow">{b === 0 ? "All square" : b > 0 ? "They owe you" : "You owe them"}</span>
            <span className={s.cardFig}>
              <span className={s.sign}>₹</span>
              {rupees(Math.abs(b))}
            </span>
            {account.ageDays != null && b !== 0 && (
              <span className={s.age} data-color={account.ageDays > 90 ? "spend" : account.ageDays > 30 ? "pending" : "credit"}>
                <span className="swatch" /> {account.ageDays} days
              </span>
            )}
            {account.promisedBy && (
              <span className={s.promise} data-late={late > 0 || undefined}>
                {b > 0 ? "Promised back by" : "You said by"} {dayMonth(account.promisedBy)}
                {late > 0 && ` · ${late} day${late === 1 ? "" : "s"} late`}
                <ClearPromise personId={account.id} />
              </span>
            )}
          </div>
          <div className={s.cardActions}>
            <a className="btn btn-ink" href="#record">
              Record a payment
            </a>
            <SettleUp key={b} personId={account.id} name={account.name} balance={b} now={now}>
              {b > 0 && <RemindButton className="btn btn-line" personId={account.id} name={account.name} age={account.ageDays ?? 0} />}
            </SettleUp>
          </div>
          <div className={s.linked}>
            <p className="eyebrow">Linked to the wire</p>
            <p>
              {account.matchNames.length
                ? `Bank mail mentioning ${account.matchNames.slice(0, 2).join(" or ")} or ${account.name} is offered against this account before it lands in the ledger.`
                : `Bank mail naming ${account.name} is offered against this account. Add how the bank writes their name to catch more.`}
            </p>
            <p className="caption">
              {matched} of {lines.length} entries matched from the wire
            </p>
          </div>
          {account.remindersSent > 0 && (
            <p className="caption">
              {account.remindersSent} reminder{account.remindersSent === 1 ? "" : "s"} sent
            </p>
          )}
          <PersonEditor person={account} />
        </aside>
      </div>
    </section>
  );
}
