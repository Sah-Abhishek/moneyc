// Senders whose mail the wire reads. Only mail from these domains (plus any
// sender the user adds through a "sender is …" rule) is ever fetched — the app
// never looks at the rest of the inbox.

export const BANK_DOMAINS: { domain: string; name: string }[] = [
  { domain: "hdfcbank.net", name: "HDFC Bank" },
  { domain: "hdfcbank.com", name: "HDFC Bank" },
  { domain: "icicibank.com", name: "ICICI Bank" },
  { domain: "axisbank.com", name: "Axis Bank" },
  { domain: "axis.bank.in", name: "Axis Bank" },
  { domain: "sbi.co.in", name: "SBI" },
  { domain: "kotak.com", name: "Kotak Bank" },
  { domain: "yesbank.in", name: "Yes Bank" },
  { domain: "idfcfirstbank.com", name: "IDFC First Bank" },
  { domain: "indusind.com", name: "IndusInd Bank" },
  { domain: "pnb.co.in", name: "PNB" },
  { domain: "bankofbaroda.co.in", name: "Bank of Baroda" },
  { domain: "bobfinancial.com", name: "BoB Financial" },
  { domain: "canarabank.com", name: "Canara Bank" },
  { domain: "unionbankofindia.co.in", name: "Union Bank" },
  { domain: "federalbank.co.in", name: "Federal Bank" },
  { domain: "aubank.in", name: "AU Bank" },
  { domain: "rblbank.com", name: "RBL Bank" },
  { domain: "bandhanbank.com", name: "Bandhan Bank" },
  { domain: "idbibank.co.in", name: "IDBI Bank" },
  { domain: "sc.com", name: "Standard Chartered" },
  { domain: "hsbc.co.in", name: "HSBC" },
  { domain: "aexp.com", name: "American Express" },
  { domain: "paytmbank.com", name: "Paytm Bank" },
  { domain: "amazonpay.in", name: "Amazon Pay" },
  { domain: "getonecard.app", name: "OneCard" },
  { domain: "jupiter.money", name: "Jupiter" },
  { domain: "fi.money", name: "Fi" },
];

export function domainOf(address: string): string {
  return (address.split("@")[1] ?? "").toLowerCase().replace(/>$/, "");
}

export function bankFor(sender: string): string {
  const d = domainOf(sender);
  const hit = BANK_DOMAINS.find((b) => d === b.domain || d.endsWith(`.${b.domain}`));
  if (hit) return hit.name;
  const base = d.split(".").slice(-2, -1)[0] ?? d;
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "Unknown sender";
}

/** Gmail search for transaction alerts from known senders newer than `afterEpochSeconds`. */
export function buildQuery(extraSenders: string[], afterEpochSeconds: number): string {
  const senders = [...new Set([...BANK_DOMAINS.map((b) => b.domain), ...extraSenders.map((s) => s.trim().toLowerCase()).filter(Boolean)])];
  return `from:(${senders.join(" OR ")}) after:${Math.floor(afterEpochSeconds)}`;
}

/** "HDFC Bank InstaAlerts <alerts@hdfcbank.net>" → "alerts@hdfcbank.net" */
export function addressOf(fromHeader: string): string {
  const m = fromHeader.match(/<([^>]+)>/);
  return (m ? m[1] : fromHeader).trim().toLowerCase();
}
