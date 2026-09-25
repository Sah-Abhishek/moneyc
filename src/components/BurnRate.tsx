import { rupees } from "@/lib/money";
import s from "./BurnRate.module.css";

// Daily spend for the month. Days over the running daily average burn in
// signal orange; the rest stay as dim paper. Future days are left empty.
export function BurnRate({
  daily,
  daysElapsed,
  average,
  monthShort,
}: {
  daily: number[];
  daysElapsed: number;
  average: number;
  monthShort: string;
}) {
  const max = Math.max(...daily, average, 1);
  return (
    <figure className={s.chart} aria-label={`Daily spending, average ₹${rupees(average)} a day`}>
      <div className={s.avg} style={{ bottom: `${(average / max) * 100}%` }} aria-hidden />
      <ol className={s.bars}>
        {daily.map((v, i) => {
          const day = i + 1;
          const future = day > daysElapsed;
          return (
            <li
              key={day}
              className={s.day}
              data-future={future || undefined}
              data-tip={future ? undefined : `${String(day).padStart(2, "0")} ${monthShort} · ₹${rupees(v)}`}
            >
              <span
                className={s.bar}
                data-hot={v > average || undefined}
                style={{ height: future ? 0 : `${Math.max((v / max) * 100, v ? 2 : 0)}%` }}
              />
              <span className="sr-only">
                {day} {monthShort}: ₹{rupees(v)}
              </span>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
