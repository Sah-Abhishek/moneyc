"use client";

import { setBudgetsAction } from "@/app/actions/book";
import { rupees, rupeesExact } from "@/lib/money";
import type { Tag } from "@/lib/types";
import { FieldError, FormError } from "./ui/Confirm";
import { useToast } from "./ui/Toaster";
import { useSubmit } from "./ui/useSubmit";
import s from "./BudgetsForm.module.css";

function Meter({ spent, budget }: { spent: number; budget: number | null }) {
  if (!budget) return <span className={s.none}>₹{rupees(spent)} spent · no limit</span>;
  const pct = spent / budget;
  return (
    <span className={s.meter}>
      <span className={s.track} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(pct * 100))} aria-label="Budget used">
        <span style={{ width: `${Math.min(100, pct * 100)}%` }} data-over={pct > 1 || undefined} />
      </span>
      <span className={s.meterText} data-over={pct > 1 || undefined}>
        ₹{rupees(spent)} of ₹{rupees(budget)}
        {pct > 1 ? ` · over by ₹${rupees(spent - budget)}` : ` · ${Math.round(pct * 100)}%`}
      </span>
    </span>
  );
}

export function BudgetsForm({
  monthly, spent, daysLeft, tags, spentByTag,
}: {
  monthly: number | null;
  spent: number;
  daysLeft: number;
  tags: Tag[];
  spentByTag: Record<number, number>;
}) {
  const toast = useToast();
  const { onSubmit, pending, error, fieldErrors } = useSubmit(setBudgetsAction, { onSuccess: (r) => toast({ tone: "info", message: r.message ?? "Saved." }) });
  const left = monthly != null ? monthly - spent : null;

  return (
    <form onSubmit={onSubmit} className={s.form} noValidate>
      <div className={s.monthly}>
        <label htmlFor="b-monthly" className="eyebrow">
          This month, everything
        </label>
        <div className={s.monthlyRow}>
          <span className={s.rupee}>₹</span>
          <input
            id="b-monthly"
            name="monthly"
            className={s.big}
            inputMode="decimal"
            defaultValue={monthly != null ? rupeesExact(monthly) : ""}
            placeholder="No limit"
            aria-invalid={!!fieldErrors.monthly || undefined}
          />
        </div>
        <FieldError id="b-monthly-err" message={fieldErrors.monthly} />
        <Meter spent={spent} budget={monthly} />
        {left != null && (
          <p className="hint">
            {left >= 0 ? `₹${rupees(left)} left` : `₹${rupees(-left)} over`} with {daysLeft} day{daysLeft === 1 ? "" : "s"} to go
            {left > 0 && daysLeft > 0 && ` — about ₹${rupees(left / daysLeft)} a day`}
          </p>
        )}
      </div>

      <table className={s.table}>
        <thead>
          <tr>
            <th scope="col">Tag</th>
            <th scope="col">This month</th>
            <th scope="col">Monthly budget ₹</th>
          </tr>
        </thead>
        <tbody>
          {tags.map((t) => (
            <tr key={t.id}>
              <th scope="row">
                <span className="stamp" data-color={t.color}>
                  {t.name}
                </span>
              </th>
              <td>
                <Meter spent={spentByTag[t.id] ?? 0} budget={t.budget} />
              </td>
              <td>
                <input
                  name={`tag-${t.id}`}
                  className="input mono"
                  inputMode="decimal"
                  defaultValue={t.budget != null ? rupeesExact(t.budget) : ""}
                  placeholder="No limit"
                  aria-label={`Monthly budget for ${t.name}`}
                  aria-invalid={!!fieldErrors[`tag-${t.id}`] || undefined}
                />
                <FieldError id={`b-${t.id}`} message={fieldErrors[`tag-${t.id}`]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <FormError message={error} />
      <button type="submit" className="btn btn-ink" disabled={pending}>
        {pending ? "Saving…" : "Save budgets"}
      </button>
    </form>
  );
}
