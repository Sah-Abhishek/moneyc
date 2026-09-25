import { BudgetsForm } from "@/components/BudgetsForm";
import { wallClock, ymOf } from "@/lib/dates";
import { requireUser } from "@/server/app";
import { monthSummary } from "@/server/services/summary";
import { listTags } from "@/server/services/tags";

export const metadata = { title: "Budgets — Money Control" };

export default async function BudgetsPage() {
  const { user, ctx } = await requireUser();
  const ym = ymOf(wallClock(user.timezone));
  const [m, tags] = await Promise.all([monthSummary(ctx, ym, user.monthlyBudget), listTags(ctx)]);
  const spentByTag = Object.fromEntries(m.byTag.filter((r) => r.tag).map((r) => [r.tag!.id, r.total]));

  return (
    <div className="page">
      <div className="section-head">
        <h2>
          Budgets <small>What each month is allowed to cost</small>
        </h2>
      </div>
      <p className="page-lede">
        The monthly budget drives the bar on the front page. Tag budgets show on each stamp in the rack. Leave a box empty for no limit.
        Money on the slate never counts against a budget.
      </p>
      <BudgetsForm
        monthly={user.monthlyBudget}
        spent={m.spent}
        daysLeft={m.days - m.daysElapsed}
        tags={tags.filter((t) => t.kind === "spend")}
        spentByTag={spentByTag}
      />
    </div>
  );
}
