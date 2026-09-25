import { FrontPage } from "@/components/FrontPage";
import { Ledger } from "@/components/Ledger";
import { LongView } from "@/components/LongView";
import { WireAlert } from "@/components/Mobile";
import { StampRack } from "@/components/StampRack";
import { WireDesk } from "@/components/Wire";
import { dayMonth, wallClock, YM, ymOf } from "@/lib/dates";
import { LEDGER_FILTERS } from "@/lib/types";
import { requireUser, wireConnection } from "@/server/app";
import { hasAnyEntries, listEntries } from "@/server/services/entries";
import { listRules } from "@/server/services/rules";
import { merchants, monthlySpend, monthSummary } from "@/server/services/summary";
import { listGroups } from "@/server/services/tagGroups";
import { listTags } from "@/server/services/tags";
import { listSlips, wireStats } from "@/server/services/wire";
import s from "./page.module.css";


export default async function LedgerPage({ searchParams }: PageProps<"/">) {
  const { user, ctx } = await requireUser();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const now = wallClock(user.timezone);
  const currentYm = ymOf(now);
  const requested = one(sp.m);
  // Unknown or future months fall back to this month rather than erroring.
  const ym = requested && YM.test(requested) && requested <= currentYm ? requested : currentYm;
  const filter = LEDGER_FILTERS.find((f) => f === one(sp.filter)) ?? "all";
  const q = one(sp.q)?.trim().slice(0, 100) || undefined;
  const page = Math.max(1, Math.min(10_000, Number.parseInt(one(sp.page) ?? "1", 10) || 1));

  const tagsP = listTags(ctx);
  const groupsP = listGroups(ctx);
  // An unknown tag or group (deleted, another user's) is ignored, not an error.
  const ledgerP = Promise.all([tagsP, groupsP]).then(([tags, groups]) => {
    const tag = tags.find((t) => String(t.id) === one(sp.tag)) ?? null;
    const group = groups.find((g) => String(g.id) === one(sp.group)) ?? null;
    return listEntries(ctx, { ym, filter, q, tagId: tag?.id ?? null, groupId: group?.id ?? null, page }).then((ledger) => ({ tag, group, ledger }));
  });
  const [summary, tags, groups, { tag, group, ledger }, slips, connection, bookHasEntries, stats, rules, months, merchantList] = await Promise.all([
    monthSummary(ctx, ym, user.monthlyBudget), tagsP, groupsP, ledgerP, listSlips(ctx, "waiting"), wireConnection(user.id),
    hasAnyEntries(ctx), wireStats(ctx), listRules(ctx), monthlySpend(ctx, ym, "6m"), merchants(ctx, ym),
  ]);

  return (
    <>
      <FrontPage m={summary} />
      <WireAlert waiting={slips.length} banks={[...new Set(slips.map((w) => w.bank))]} />
      <div className={s.body}>
        <div className={`rule ${s.bodyRule}`} />
        <div className={s.columns}>
          <Ledger
            {...ledger}
            filter={filter}
            q={q}
            tag={tag}
            group={group}
            groups={groups}
            ym={ym}
            currentYm={currentYm}
            today={dayMonth(now)}
            tags={tags}
            bookIsEmpty={!bookHasEntries}
          />
          <div className={s.wireColumn}>
            <WireDesk
              compact
              slips={slips}
              stats={stats}
              gmail={user.email}
              connection={connection}
              tags={tags}
              rules={rules}
            />
          </div>
        </div>
      </div>
      <LongView ym={ym} months={months} daily={summary.daily} daysElapsed={summary.daysElapsed} merchants={merchantList} range="6m" />
      <StampRack m={summary} tags={tags} />
    </>
  );
}
