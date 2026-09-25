import { log } from "../log.ts";
import type { GmailMessage } from "./mime.ts";

// Minimal Gmail REST client: timeouts, bounded retries with exponential
// backoff + jitter for rate limits and server errors. Every call is a GET, so
// retrying is safe.

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 4;

export class GmailError extends Error {
  name = "GmailError";
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface GmailClient {
  list(q: string, pageToken?: string): Promise<{ ids: string[]; nextPageToken?: string }>;
  get(id: string): Promise<GmailMessage>;
}

export function gmailClient(accessToken: string, fetchImpl: typeof fetch = fetch, base = BASE): GmailClient {
  async function call<T>(path: string): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let res: Response;
      try {
        res = await fetchImpl(`${base}${path}`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch (e) {
        lastError = e;
        log.warn("gmail.network_error", { path: path.split("?")[0], attempt, error: e });
        if (attempt < MAX_ATTEMPTS) await sleep(backoff(attempt));
        continue;
      }
      if (res.ok) return (await res.json()) as T;
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after"));
        lastError = new GmailError(`Gmail answered ${res.status}`, res.status);
        log.warn("gmail.retryable", { status: res.status, attempt });
        if (attempt < MAX_ATTEMPTS) await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : backoff(attempt));
        continue;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new GmailError(body.error?.message ?? `Gmail answered ${res.status}`, res.status);
    }
    throw lastError instanceof GmailError ? lastError : new GmailError(`Could not reach Gmail: ${(lastError as Error)?.message ?? "unknown error"}`, 0);
  }

  return {
    async list(q, pageToken) {
      const params = new URLSearchParams({ q, maxResults: "100" });
      if (pageToken) params.set("pageToken", pageToken);
      const r = await call<{ messages?: { id: string }[]; nextPageToken?: string }>(`/messages?${params}`);
      return { ids: (r.messages ?? []).map((m) => m.id), nextPageToken: r.nextPageToken };
    },
    get(id) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new GmailError("Unexpected message id from Gmail", 0);
      return call<GmailMessage>(`/messages/${id}?format=full`);
    },
  };
}

function backoff(attempt: number) {
  return Math.min(8000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
}
