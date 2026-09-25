import Image from "next/image";
import Link from "next/link";
import { clock12, monthShort } from "@/lib/dates";
import { rupeesExact } from "@/lib/money";
import type { Rule, Tag } from "@/lib/types";
import type { WireSlip as Slip } from "@/server/services/wire";
import type { WireConnection } from "@/server/app";
import { describeAction, describeCondition } from "./ruleText";
import { WireSlip } from "./WireSlip";
import s from "./Wire.module.css";

export interface WireDeskProps {
  slips: Slip[];
  stats: { ym: string; autoFiled: number; accuracy: number | null; banksSeen: number };
  gmail: string;
  connection: WireConnection;
  tags: Tag[];
  rules: Rule[];
  /** the ledger sidebar shows two slips and a link; the wire page shows them all */
  compact?: boolean;
  /** extra controls in the header (the wire page puts the auto-file switch here) */
  controls?: React.ReactNode;
}

const ON_DESK = 2;

export function WireDesk({ slips, stats, gmail, connection, tags, rules, compact, controls }: WireDeskProps) {
  const desk = compact ? slips.slice(0, ON_DESK) : slips;
  const queued = slips.slice(desk.length);
  const month = `${monthShort(stats.ym)[0]}${monthShort(stats.ym).slice(1).toLowerCase()}`;

  return (
    <section className={s.wire} id="wire" aria-labelledby="wire-title">
      <div className={s.head}>
        <div className={s.titleRow}>
          <h2 id="wire-title" className={s.title}>
            {compact ? <Link href="/wire">The Wire</Link> : "The Wire"}
          </h2>
          <span className={s.waiting}>{slips.length ? `${slips.length} waiting` : "All clear"}</span>
        </div>
        <div className={s.sourceRow}>
          <p className={s.source}>
            <Image src="/icons/mail-faint.svg" alt="" width={13} height={13} />
            Gmail · {gmail}
          </p>
          {controls}
        </div>
      </div>
      <div className="rule" />

      <ConnectionNotice connection={connection} />

      {connection === "connected" && (
        <div className={s.filed}>
          <div>
            <p className={s.filedTitle}>
              {stats.autoFiled} {stats.autoFiled === 1 ? "entry" : "entries"} filed automatically
            </p>
            <p className={s.filedNote}>
              Since 01 {month}
              {stats.banksSeen > 0 && ` · ${stats.banksSeen} bank${stats.banksSeen === 1 ? "" : "s"} & wallet${stats.banksSeen === 1 ? "" : "s"} seen`}
            </p>
          </div>
          {stats.accuracy != null && (
            <div className={s.accuracy} title="Share of automatically filed lines you didn't have to correct">
              <span className="serif">{(stats.accuracy * 100).toFixed(1)}%</span>
              <span>Accurate</span>
            </div>
          )}
        </div>
      )}

      <div className={s.desk}>
        {desk.map((slip) => (
          <WireSlip key={slip.id} slip={slip} tags={tags} clock={clock12(slip.receivedAt)} />
        ))}
        {queued.length > 0 && (
          <Link href="/wire" className={s.queued}>
            <span>
              <span className={s.queuedTitle}>{queued.length} more in the queue</span>
              <span className={s.queuedNote}>
                {queued[0].bank} · ₹ {queued[0].parsed.amountPaise != null ? rupeesExact(queued[0].parsed.amountPaise) : "—"} · {clock12(queued[0].receivedAt)}
              </span>
            </span>
            <span className={s.reviewLink}>
              Review
              <Image src="/icons/arrow-right.svg" alt="" width={11} height={11} />
            </span>
          </Link>
        )}
        {slips.length === 0 && connection === "connected" && (
          <p className={s.clear}>Nothing on the desk. New bank alerts land here first, and confident ones go straight into the ledger.</p>
        )}
      </div>

      <div className={s.rules} id="rules">
        <div className={s.rulesHead}>
          <span className="eyebrow">Standing rules</span>
          <Link className="caption" href="/rules">
            {rules.length ? `${rules.length} active · edit` : "Add a rule"}
          </Link>
        </div>
        <div className="rule-hair" />
        {rules.length === 0 ? (
          <p className={s.if}>No rules yet. Rules tag mail by payee, file trusted senders automatically, or hold big amounts for you to check.</p>
        ) : (
          <ul>
            {rules.slice(0, compact ? 3 : rules.length).map((r) => (
              <li key={r.id}>
                <span className={s.if}>If&nbsp;&nbsp;{describeCondition(r)}</span>
                <span className={s.then}>
                  <Image src="/icons/arrow-rule.svg" alt="" width={10} height={10} />
                  {describeAction(r)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ConnectionNotice({ connection }: { connection: WireConnection }) {
  if (connection === "connected") return null;
  const copy = {
    not_configured: { title: "Mail sync isn't set up on this server.", body: "Whoever runs this server needs to add the Google OAuth settings. You can still keep the book by hand.", cta: null },
    reconnect: { title: "Gmail isn't connected.", body: "Access was revoked or has expired, so no new bank mail is being read. Your book is safe.", cta: "Reconnect Gmail" },
    no_gmail_scope: { title: "Money Control can't read your mail.", body: "When you signed in, mail access wasn't allowed. Allow read-only access to the alerts so the wire can work.", cta: "Allow mail access" },
  }[connection];
  return (
    <div className={s.connNotice} role="status">
      <p className={s.filedTitle}>{copy.title}</p>
      <p className={s.connBody}>{copy.body}</p>
      {copy.cta && (
        <a className="btn btn-ink" href="/auth/google?next=/wire">
          {copy.cta}
        </a>
      )}
    </div>
  );
}
