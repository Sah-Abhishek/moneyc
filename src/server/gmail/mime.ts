// Pulls readable text out of a Gmail API message (format=full). Bank alerts
// are often HTML-only, so HTML is flattened to text when no plain part exists.

export interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
}

export interface GmailMessage {
  id: string;
  threadId?: string;
  internalDate?: string;
  payload?: GmailPart;
}

export const MAX_BODY_CHARS = 20_000;

export function header(msg: GmailMessage, name: string): string | null {
  const h = msg.payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? null;
}

const decode = (data: string) => Buffer.from(data, "base64url").toString("utf8");

function collect(part: GmailPart | undefined, type: string, out: string[]) {
  if (!part) return;
  if (part.filename) return; // attachments are never read
  if (part.mimeType === type && part.body?.data) out.push(decode(part.body.data));
  for (const p of part.parts ?? []) collect(p, type, out);
}

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", rsquo: "’", lsquo: "‘", ndash: "–", mdash: "—", rupee: "₹" };

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d|table)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export function messageText(msg: GmailMessage): string {
  const plain: string[] = [];
  collect(msg.payload, "text/plain", plain);
  let text = plain.join("\n").trim();
  if (!text) {
    const html: string[] = [];
    collect(msg.payload, "text/html", html);
    text = htmlToText(html.join("\n"));
  }
  return text.slice(0, MAX_BODY_CHARS);
}
