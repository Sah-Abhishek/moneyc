// Ledger times are wall-clock strings in the owner's timezone,
// "YYYY-MM-DDTHH:MM:SS" (see server/db/migrations.ts). These helpers slice
// those strings instead of round-tripping through Date, so the server's own
// timezone can never shift a payment onto the wrong day.

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAY = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const MONTH = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

export const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
export const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

const parts = (iso: string) => ({
  y: Number(iso.slice(0, 4)),
  m: Number(iso.slice(5, 7)),
  d: Number(iso.slice(8, 10)),
  time: iso.slice(11, 16) || "00:00",
  seconds: iso.slice(11, 19) || "00:00:00",
});

const pad = (n: number) => String(n).padStart(2, "0");

/** The instant local midnight began, in `timeZone`, on the day that contains `at`. */
export function startOfLocalDay(timeZone: string, at: Date): Date {
  const wall = wallClock(timeZone, at);
  const offsetMs = Date.parse(`${wall}Z`) - Math.floor(at.getTime() / 1000) * 1000;
  return new Date(Date.parse(`${wall.slice(0, 10)}T00:00:00Z`) - offsetMs);
}

/** Current wall-clock time in `timeZone`, e.g. "2026-09-22T11:18:42". */
export function wallClock(timeZone: string, at: Date = new Date()): string {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** True when the string is a real calendar date-time (rejects 2026-02-30). */
export function isWallClock(s: string): boolean {
  if (!WALL_CLOCK.test(s)) return false;
  const p = parts(s);
  const d = new Date(Date.UTC(p.y, p.m - 1, p.d));
  const [hh, mm, ss] = p.seconds.split(":").map(Number);
  return d.getUTCMonth() === p.m - 1 && d.getUTCDate() === p.d && hh < 24 && mm < 60 && ss < 60;
}

// ─── months ────────────────────────────────────────────────────────────────

export const ymOf = (wall: string) => wall.slice(0, 7);

export function shiftYm(ym: string, delta: number): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7)) - 1 + delta;
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function daysInMonth(ym: string): number {
  return new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
}

/** 0 = Monday … 6 = Sunday, for the first day of the month */
export function firstWeekday(ym: string): number {
  return (new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1)).getUTCDay() + 6) % 7;
}

export const monthShort = (ym: string) => MON[Number(ym.slice(5, 7)) - 1];
export const monthLong = (ym: string) => MONTH[Number(ym.slice(5, 7)) - 1];
export const monthTitle = (ym: string) => {
  const m = monthLong(ym);
  return `${m[0]}${m.slice(1).toLowerCase()}`;
};

// ─── display ───────────────────────────────────────────────────────────────

/** "22 SEP" */
export const dayMonth = (iso: string) => {
  const p = parts(iso);
  return `${pad(p.d)} ${MON[p.m - 1]}`;
};

/** "22 SEP 2026" */
export const dayMonthYear = (iso: string) => `${dayMonth(iso)} ${parts(iso).y}`;

/** "11:18" */
export const clock = (iso: string) => parts(iso).time;

/** "11:18 AM" */
export const clock12 = (iso: string) => {
  const [h, m] = parts(iso).time.split(":").map(Number);
  return `${pad(h % 12 || 12)}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
};

/** "22-09-2026 11:18:42" — the way the bank posts it */
export const posted = (iso: string) => {
  const p = parts(iso);
  return `${pad(p.d)}-${pad(p.m)}-${p.y} ${p.seconds}`;
};

/** "TUE 22 SEP" */
export const dayHeader = (iso: string) => {
  const p = parts(iso);
  const wd = WEEKDAY[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()].slice(0, 3);
  return `${wd} ${dayMonth(iso)}`;
};

/** "TUESDAY, 22 SEPTEMBER 2026" from a wall-clock string */
export const longDate = (iso: string) => {
  const p = parts(iso);
  return `${WEEKDAY[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()]}, ${p.d} ${MONTH[p.m - 1]} ${p.y}`;
};

/** Whole days between two wall-clock dates (b − a). */
export function daysBetween(a: string, b: string): number {
  const toDay = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((toDay(b) - toDay(a)) / 86_400_000);
}

/** "2 MIN AGO" for a UTC instant */
export function ago(instant: string, now = new Date()): string {
  const s = Math.max(0, Math.round((now.getTime() - new Date(instant).getTime()) / 1000));
  if (s < 60) return "JUST NOW";
  if (s < 3600) return `${Math.round(s / 60)} MIN AGO`;
  if (s < 86400) return `${Math.round(s / 3600)} HR AGO`;
  const d = Math.round(s / 86400);
  return `${d} DAY${d === 1 ? "" : "S"} AGO`;
}
