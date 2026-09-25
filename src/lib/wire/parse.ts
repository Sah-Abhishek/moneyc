// Parses Indian bank / UPI transaction-alert emails into ledger fields.
//
// Banks phrase these alerts differently but they share a vocabulary:
// an amount after Rs./INR/₹, "debited"/"credited", a VPA or "Info:" payee,
// a reference number (UPI RRN, NEFT UTR, IMPS ref), a masked account and a
// timestamp. Each extractor is independent so a slip can show exactly which
// fields were found — the wire is a desk, not a feed.

export type Channel = "UPI" | "NEFT" | "IMPS" | "RTGS" | "Card" | "ATM" | "Other";

export interface ParsedMail {
  direction: "debit" | "credit" | null;
  amountPaise: number | null;
  payee: string | null;
  channel: Channel;
  ref: string | null;
  account: string | null;
  /** ISO local timestamp, "2026-09-22T11:18:42" */
  postedAt: string | null;
  /** 0–1: how many of the fields that matter were found, weighted */
  confidence: number;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

function parseAmount(text: string): number | null {
  const m = text.match(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!m) return null;
  const [whole, frac = ""] = m[1].replace(/,/g, "").split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

function parseDirection(text: string): ParsedMail["direction"] {
  const debit = text.search(/\b(debited|spent|paid|withdrawn|sent)\b/i);
  const credit = text.search(/\b(credited|received|deposited|refunded)\b/i);
  if (debit === -1 && credit === -1) return null;
  if (credit === -1) return "debit";
  if (debit === -1) return "credit";
  return debit < credit ? "debit" : "credit";
}

function parseChannel(text: string): Channel {
  if (/\bUPI\b|\bVPA\b/i.test(text)) return "UPI";
  if (/\bNEFT\b/i.test(text)) return "NEFT";
  if (/\bIMPS\b/i.test(text)) return "IMPS";
  if (/\bRTGS\b/i.test(text)) return "RTGS";
  if (/\bATM\b/i.test(text)) return "ATM";
  if (/\b(credit|debit)\s+card\b|\bcard\s+(?:no\.?|ending|xx)/i.test(text)) return "Card";
  return "Other";
}

function parseRef(text: string): string | null {
  const m =
    text.match(/(?:UPI\s+)?(?:transaction\s+)?(?:reference|ref|RRN|UTR)(?:\s+(?:number|no\.?))?\s*(?:is|:|-)?\s*([A-Z0-9]{6,22})/i);
  return m ? m[1] : null;
}

function parseAccount(text: string): string | null {
  const m = text.match(/(?:a\/c|account|acct|card)(?:\s+(?:no\.?|number|ending(?:\s+with)?))?\s*[:\-]?\s*(?:[x*]+|\*\*)(\d{4})/i);
  return m ? m[1] : null;
}

function parsePayee(text: string, direction: ParsedMail["direction"]): string | null {
  // "to VPA vinodsi@okaxis VINOD SI on 22-09-26"
  const vpa = text.match(/\b(?:to|from|by)\s+VPA\s+\S+@\S+\s+(.+?)\s+on\s+\d/i);
  if (vpa) return vpa[1].trim();
  // "Info: PAYU*MERCHANT." / "Info- UPI-SWIGGY"
  const info = text.match(/\bInfo\s*[:\-]\s*([^\n.]+?)(?:\.\s|\.$|\n|$)/i);
  if (info) return info[1].replace(/^(UPI|IMPS|NEFT)[-/]/i, "").trim();
  // "at SWIGGY on" / "at SWIGGY."
  const at = text.match(/\bat\s+([A-Z0-9][A-Z0-9 &*'._-]{1,40}?)(?:\s+on\s|\.\s|\.$|\n)/);
  if (at) return at[1].trim();
  // "credited ... by PRIYA NAIR" (NEFT/IMPS credits)
  if (direction === "credit") {
    const by = text.match(/\b(?:by|from)\s+([A-Z][A-Z .&]{2,40}?)(?:\s+(?:on|via|ref|UTR)\b|\.|\n)/);
    if (by) return by[1].trim();
  }
  return null;
}

function parsePostedAt(text: string): string | null {
  const time = text.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  const hms = time ? `${pad(+time[1])}:${time[2]}:${time[3] ?? "00"}` : "00:00:00";
  const year = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

  // 22-09-2026, 22/09/26
  let m = text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/);
  if (m) return `${year(m[3])}-${pad(+m[2])}-${pad(+m[1])}T${hms}`;
  // 22-Sep-26, 22 Sep 2026
  m = text.match(/\b(\d{1,2})[-\s]([A-Za-z]{3})[a-z]*[-\s,]+(\d{2,4})\b/);
  if (m && MONTHS[m[2].toLowerCase()])
    return `${year(m[3])}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(+m[1])}T${hms}`;
  return null;
}

export function parseBankMail(body: string): ParsedMail {
  const text = body.replace(/\s+/g, " ").trim();
  const direction = parseDirection(text);
  const parsed = {
    direction,
    amountPaise: parseAmount(text),
    payee: parsePayee(text, direction),
    channel: parseChannel(text),
    ref: parseRef(text),
    account: parseAccount(text),
    postedAt: parsePostedAt(text),
  };
  const weights: [unknown, number][] = [
    [parsed.amountPaise, 0.3],
    [parsed.direction, 0.2],
    [parsed.payee, 0.2],
    [parsed.postedAt, 0.12],
    [parsed.ref, 0.1],
    [parsed.account, 0.08],
  ];
  const confidence = weights.reduce((sum, [v, w]) => sum + (v == null ? 0 : w), 0);
  return { ...parsed, confidence: Math.round(confidence * 100) / 100 };
}

/** 626123456772 → "626xxxxx72", the way the design shows references. */
export function maskRef(ref: string): string {
  if (ref.length <= 5) return ref;
  return `${ref.slice(0, 3)}${"x".repeat(Math.min(5, ref.length - 5))}${ref.slice(-2)}`;
}

/** Parses a stored mail: the body first, falling back to subject + body when the body alone lacks the amount. */
export function parseMail(subject: string | null, body: string): ParsedMail {
  const fromBody = parseBankMail(body);
  if ((fromBody.amountPaise != null && fromBody.direction != null) || !subject) return fromBody;
  const combined = parseBankMail(`${subject}. ${body}`);
  return combined.confidence > fromBody.confidence ? combined : fromBody;
}

/**
 * When did the payment happen? The time written in the mail, unless it is
 * missing, date-only on the day the mail arrived, or implausibly far from the
 * arrival time (a misread) — then the arrival time.
 */
export function resolveOccurredAt(parsed: ParsedMail, receivedAt: string): string {
  const p = parsed.postedAt;
  if (!p) return receivedAt;
  if (p.endsWith("T00:00:00") && p.slice(0, 10) === receivedAt.slice(0, 10)) return receivedAt;
  const drift = (Date.parse(`${receivedAt}Z`) - Date.parse(`${p}Z`)) / 86_400_000;
  if (!Number.isFinite(drift) || drift < -1 || drift > 60) return receivedAt;
  return p;
}
