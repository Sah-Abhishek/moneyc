import { AutoFileToggle, RestoreSlipButton } from "@/components/WireControls";
import { WireDesk } from "@/components/Wire";
import { clock12, dayMonth } from "@/lib/dates";
import { rupeesExact } from "@/lib/money";
import { requireUser, wireConnection } from "@/server/app";
import { listRules } from "@/server/services/rules";
import { listTags } from "@/server/services/tags";
import { listSlips, wireStats } from "@/server/services/wire";
import s from "../section.module.css";

export const metadata = { title: "The Wire — Money Control" };

const STATUS_LABEL = { filed: "Filed", ignored: "Set aside", duplicate: "Matched an existing line" } as const;

export default async function WirePage() {
  const { user, ctx } = await requireUser();
  const [slips, decided, tags, stats, connection, rules] = await Promise.all([
    listSlips(ctx, "waiting"), listSlips(ctx, "decided", 30), listTags(ctx), wireStats(ctx), wireConnection(user.id), listRules(ctx),
  ]);

  return (
    <div className="page">
      <div className={s.narrow}>
        <WireDesk
          slips={slips}
          stats={stats}
          gmail={user.email}
          connection={connection}
          tags={tags}
          rules={rules}
          controls={<AutoFileToggle on={user.autoFile} />}
        />
      </div>
      <p className="page-lede" style={{ marginTop: 28 }}>
        Bank and wallet alerts from Gmail land here as slips. Check what was read, pick a tag, confirm. With auto-file on, mail that a
        rule or your history makes certain goes straight into the ledger — anything unclear, possibly duplicate, or on the slate always
        waits for you.
      </p>

      <section className={s.block} aria-labelledby="decided-title">
        <div className="section-head">
          <h2 id="decided-title">
            Recently decided <small>The last {decided.length} mails</small>
          </h2>
        </div>
        {decided.length === 0 ? (
          <p className="page-lede">Mail you file, set aside or match will be listed here.</p>
        ) : (
          <ul className={s.list}>
            {decided.map((d) => (
              <li key={d.id} className={s.listRow}>
                <span className={s.listMain}>
                  <span className={s.listTitle}>{d.parsed.payee ?? d.subject ?? "Unreadable mail"}</span>
                  <span className={s.listMeta}>
                    {d.bank} · {dayMonth(d.receivedAt)} {clock12(d.receivedAt)}
                    {d.parsed.amountPaise != null && ` · ₹${rupeesExact(d.parsed.amountPaise)}`}
                  </span>
                </span>
                <span className={s.listStatus} data-status={d.status}>
                  {STATUS_LABEL[d.status as keyof typeof STATUS_LABEL]}
                </span>
                {d.status === "ignored" && <RestoreSlipButton id={d.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
