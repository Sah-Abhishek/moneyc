// Structured, single-line JSON logs so failures can be diagnosed from the
// server output alone. Never pass tokens, mail bodies or secrets in `fields`.

type Level = "debug" | "info" | "warn" | "error";

const REDACT = /token|secret|password|authorization|cookie|code_verifier|refresh/i;

function clean(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (REDACT.test(k)) out[k] = "[redacted]";
    else if (v instanceof Error) out[k] = { name: v.name, message: v.message, stack: v.stack?.split("\n").slice(0, 6).join("\n") };
    else out[k] = v;
  }
  return out;
}

function write(level: Level, event: string, fields: Record<string, unknown> = {}) {
  if (level === "debug" && process.env.LOG_LEVEL !== "debug") return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...clean(fields) });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, fields?: Record<string, unknown>) => write("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>) => write("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => write("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => write("error", event, fields),
};
