// Money is stored as integer paise. Formatting follows the Indian grouping
// the design uses throughout (1,47,210 — lakhs, then thousands).

export function groupIndian(whole: number): string {
  const s = Math.abs(Math.trunc(whole)).toString();
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

/** 4821000 → "48,210" (rupees, no decimals, no sign) */
export function rupees(paise: number): string {
  return groupIndian(Math.round(Math.abs(paise) / 100));
}

/** 4821000 → "48,210.00" (rupees with paise, no sign) */
export function rupeesExact(paise: number): string {
  const abs = Math.abs(Math.round(paise));
  return `${groupIndian(Math.floor(abs / 100))}.${String(abs % 100).padStart(2, "0")}`;
}

/** Signed ledger amount: "−10.00" / "+92,000.00". Uses a true minus sign. */
export function signedAmount(paise: number): string {
  return `${paise < 0 ? "−" : "+"}${rupeesExact(paise)}`;
}

/** Split for the big serif figures: 4821000 → ["48,210", ".00"] */
export function splitRupees(paise: number): [string, string] {
  const [whole, frac] = rupeesExact(paise).split(".");
  return [whole, `.${frac}`];
}

/** "1,899.00" / "1899" / "Rs. 1,899.00" → 189900. Returns null when unparseable. */
export function parsePaise(input: string): number | null {
  const cleaned = input.replace(/(rs\.?|inr|₹)/gi, "").replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export function percent(part: number, whole: number, digits = 0): string {
  if (!whole) return "0%";
  return `${((part / whole) * 100).toFixed(digits)}%`;
}
