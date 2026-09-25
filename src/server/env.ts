import "server-only";

// Configuration is read once and validated. Missing values do not crash the
// server: pages that need them render a setup notice instead, so an operator
// can see exactly what is missing.

export interface Config {
  appUrl: string;
  googleClientId: string;
  googleClientSecret: string;
  /** 32 raw bytes, used to encrypt Google tokens at rest */
  secretKey: Buffer;
  isProduction: boolean;
}

export type ConfigResult = { ok: true; config: Config } | { ok: false; missing: string[]; problems: string[] };

let cached: ConfigResult | undefined;

export function loadConfig(): ConfigResult {
  if (cached) return cached;
  const env = process.env;
  const missing: string[] = [];
  const problems: string[] = [];

  const need = (key: string) => {
    const v = env[key]?.trim();
    if (!v) missing.push(key);
    return v ?? "";
  };

  const appUrl = need("APP_URL").replace(/\/+$/, "");
  const googleClientId = need("GOOGLE_CLIENT_ID");
  const googleClientSecret = need("GOOGLE_CLIENT_SECRET");
  const rawSecret = need("APP_SECRET");

  let secretKey = Buffer.alloc(0);
  if (rawSecret) {
    secretKey = Buffer.from(rawSecret, "base64");
    if (secretKey.length !== 32) problems.push("APP_SECRET must be 32 bytes, base64-encoded (openssl rand -base64 32).");
  }
  if (appUrl && !/^https?:\/\//.test(appUrl)) problems.push("APP_URL must start with http:// or https://.");
  const isProduction = env.NODE_ENV === "production";
  if (isProduction && appUrl.startsWith("http://")) problems.push("APP_URL must use https in production.");

  cached =
    missing.length || problems.length
      ? { ok: false, missing, problems }
      : { ok: true, config: { appUrl, googleClientId, googleClientSecret, secretKey, isProduction } };
  return cached;
}

/** The database is needed even when OAuth is not configured. */
export function databaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set. Point it at a Postgres database (e.g. your Neon connection string) — see .env.example.");
  return url;
}
