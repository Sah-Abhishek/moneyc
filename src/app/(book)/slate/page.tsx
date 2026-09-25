import Link from "next/link";
import { NewAccountForm } from "@/components/slate/NewAccountForm";
import { OpenAccount } from "@/components/slate/OpenAccount";
import { SlateOverview } from "@/components/slate/SlateOverview";
import { SlatePages } from "@/components/slate/SlatePages";
import { WireSlip } from "@/components/WireSlip";
import { clock12, wallClock } from "@/lib/dates";
import { requireUser } from "@/server/app";
import { NotFoundError } from "@/server/services/context";
import { getAccount, listAccounts, slateStats } from "@/server/services/slate";
import { listTags } from "@/server/services/tags";
import { listSlips } from "@/server/services/wire";
import s from "@/components/slate/slate.module.css";

export const metadata = { title: "The Slate — Money Control" };

export default async function SlatePage({ searchParams }: PageProps<"/slate">) {
  const { user, ctx } = await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const showArchived = sp.archived === "1";

  const [everyone, waitingSlips, tags] = await Promise.all([listAccounts(ctx, { includeArchived: true }), listSlips(ctx, "waiting"), listTags(ctx)]);
  const active = everyone.filter((a) => !a.archived);
  const shown = (showArchived ? everyone : active).filter(
    (a) => !q || a.name.toLowerCase().includes(q.toLowerCase()) || a.matchNames.some((m) => m.toLowerCase().includes(q.toLowerCase())),
  );
  const stats = await slateStats(ctx, active);

  // The open account: the one asked for, else the oldest debt owed to you.
  const requested = Number(sp.person);
  let open = null;
  if (Number.isInteger(requested) && requested > 0) {
    try {
      open = await getAccount(ctx, requested);
    } catch (e) {
      if (!(e instanceof NotFoundError)) throw e;
    }
  }
  if (!open) {
    const pick = [...active].filter((a) => a.balance !== 0).sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0))[0];
    if (pick) open = await getAccount(ctx, pick.id);
  }
  const fromWire = waitingSlips.filter((w) => w.person);
  const now = wallClock(user.timezone);

  return (
    <>
      <SlateOverview stats={stats} openCount={active.filter((a) => a.balance !== 0).length} />

      <section className={s.pagesSection} aria-label="Accounts">
        {q && (
          <p className={s.searchNote}>
            Showing people matching “{q}”. <Link href="/slate">Show everyone</Link>
          </p>
        )}
        <SlatePages accounts={shown} now={now} openId={open?.account.id ?? null} />
        {everyone.length === 0 && (
          <div className="empty-state">
            <h3>The slate is clean.</h3>
            <p>
              When you lend someone money or borrow some, open an account for them here. Payments to and from them that arrive on the wire
              will be offered against their account before they become ordinary spending.
            </p>
          </div>
        )}
        <div className={s.pagesFoot}>
          <NewAccountForm now={now} />
          {everyone.some((a) => a.archived) && (
            <Link className="chip" href={showArchived ? "/slate" : "/slate?archived=1"}>
              {showArchived ? "Hide settled accounts" : "Show settled accounts"}
            </Link>
          )}
        </div>
      </section>

      {open && <OpenAccount account={open.account} lines={open.lines} others={active.filter((a) => a.id !== open!.account.id).slice(0, 6)} now={now} />}

      {fromWire.length > 0 && (
        <section className={s.wireSection} aria-labelledby="slate-wire">
          <div className="rule" />
          <div className="section-head">
            <h2 id="slate-wire">
              From the wire <small>Mail that looks like it moves money on the slate</small>
            </h2>
            <span className="chip" aria-current="true">
              {fromWire.length} to confirm
            </span>
          </div>
          <div className={s.wireGrid}>
            {fromWire.map((slip) => (
              <WireSlip key={slip.id} slip={slip} tags={tags} clock={clock12(slip.receivedAt)} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
