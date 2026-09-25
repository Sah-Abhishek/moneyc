import { FrontPage } from "@/components/FrontPage";
import { LongView } from "@/components/LongView";
import Link from "next/link";
import { monthTitle, shiftYm, wallClock, YM, ymOf } from "@/lib/dates";
import { requireUser } from "@/server/app";
import { merchants, monthlySpend, monthSummary, type Range } from "@/server/services/summary";

export const metadata = { title: "Reports — Money Control" };

const RANGES: Range[] = ["6m", "1y", "all"];

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const { user, ctx } = await requireUser();
  const sp = await searchParams;
  const current = ymOf(wallClock(user.timezone));
  const ym = typeof sp.m === "string" && YM.test(sp.m) && sp.m <= current ? sp.m : current;
  const range = RANGES.find((r) => r === sp.range) ?? "6m";
  const [summary, months, merchantList] = await Promise.all([
    monthSummary(ctx, ym, user.monthlyBudget), monthlySpend(ctx, ym, range), merchants(ctx, ym),
  ]);

  const href = (m: string) => `/reports?m=${m}&range=${range}`;
  return (
    <>
      <nav className="page" aria-label="Month" style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 24, paddingBottom: 0 }}>
        <span className="eyebrow" style={{ marginRight: 8 }}>
          Report for {monthTitle(ym)} {ym.slice(0, 4)}
        </span>
        <Link className="chip" href={href(shiftYm(ym, -1))}>
          ‹ {monthTitle(shiftYm(ym, -1)).slice(0, 3)}
        </Link>
        {ym < current && (
          <Link className="chip" href={href(shiftYm(ym, 1))}>
            {monthTitle(shiftYm(ym, 1)).slice(0, 3)} ›
          </Link>
        )}
      </nav>
      <FrontPage m={summary} />
      <LongView full ym={ym} range={range} months={months} daily={summary.daily} daysElapsed={summary.daysElapsed} merchants={merchantList} />
    </>
  );
}
