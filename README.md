# Money Control

A personal ledger that reads your bank mail. Sign in with Google, and bank/UPI alerts from Gmail arrive on
**the wire** as slips you confirm (or that file themselves when a rule makes them certain). Everything lands
in **the ledger** — a running book with tags, budgets and reports — and money lent or borrowed lives on
**the slate**, a double-entry book per person.

Design: Figma file `BtH367PTje0x7dZJU1V9WD`, page **Money Control** ("Ledger Broadsheet").
Engineering standard: [`rules.md`](rules.md).

## Set up

1. **Node 22.6+** and a **PostgreSQL** database — a [Neon](https://neon.tech) project (a dev branch works
   well locally) or any Postgres 14+.
2. `npm install`
3. **Google OAuth client** — Google Cloud Console:
   - Create a project → *APIs & Services* → enable the **Gmail API**.
   - *OAuth consent screen*: External; add the scope `.../auth/gmail.readonly`; while in testing, add your
     Google account under *Test users*.
   - *Credentials* → *Create OAuth client ID* → *Web application*. Authorised redirect URI:
     `http://localhost:3000/auth/google/callback` (and your production URL's equivalent).
4. `cp .env.example .env.local` and fill in `DATABASE_URL`, `APP_URL`, `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, and `APP_SECRET` (`openssl rand -base64 32`). The schema is created on the
   first request (or run `npm run db:migrate`).
5. `npm run dev` → http://localhost:3000

Without the Google values the app still runs: the welcome page says sign-in isn't configured, and `/api/health`
reports `configured: false`.

## API for the Android app

`/api/v1/*` is a JSON API with bearer-token sessions and native Google sign-in, over the same services as
the website. Reference: [`docs/api-v1.md`](docs/api-v1.md).

## Scripts

| | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | service, sync, auth and parser tests (Node's test runner, in-process Postgres via PGlite — no database needed) |
| `npm run lint` | ESLint |
| `npm run db:migrate` | apply pending migrations to `DATABASE_URL` (reads `.env.local`) |

## How it's built

```
src/app/                 routes: /welcome, the signed-in book under (book)/, server actions, auth + api routes
src/components/          UI, one component + CSS module per section of the broadsheet
src/lib/                 client-safe helpers: money, dates (wall-clock, timezone-safe), mail parser, types
src/server/
  app.ts                 Next.js bridge: session → user, `act()` wrapper for every server action, sync runner
  env.ts  log.ts         validated config, structured JSON logs (secrets redacted)
  db/                    Postgres access (pg Pool) + append-only migrations (schema_migrations)
  auth/                  Google OAuth (PKCE, single-use state), hashed session tokens
  gmail/                 Gmail client (timeouts, retry/backoff), MIME → text, sync, bank sender list
  services/              all business logic; every function takes the signed-in user's context
  rules-engine.ts        standing rules (pure)
```

Decisions worth knowing:

- **Ownership is enforced in SQL.** Every service query filters on `user_id`; IDs from the browser are
  never trusted. Another user's record behaves exactly like a missing one.
- **Money is integer paise.** Times in the book are wall-clock strings in the user's timezone
  (`users.timezone`, default Asia/Kolkata), because that's how bank alerts state them.
- **Safe to repeat.** Hand-written lines carry an idempotency key; a Gmail message is stored once per user;
  filing a mail is a compare-and-set on its status; edits carry a version and refuse to overwrite a newer
  one.
- **The wire only reads bank mail.** The Gmail search is limited to known bank/wallet domains
  (`src/server/gmail/banks.ts`) plus senders you add as rules — or, when a user picks *Only these senders*
  in Settings, exactly their list (rules don't widen it). Adding a sender makes the next read look back
  to the signup day so its mail since then arrives; mail already on the wire is never removed. Mail that isn't a transaction is recorded
  as skipped with its text discarded. Google tokens are AES-256-GCM encrypted with `APP_SECRET`.
- **Auto-filing is conservative.** It needs a complete parse and a known tag (or a "file" rule), and it
  never applies to likely duplicates, slate payments, or anything an "ask me first" rule matches.
- **Deletes are soft** where users expect undo (lines); destructive account actions ask to confirm.

## Operating it

- **Database:** PostgreSQL via `DATABASE_URL`. Each server instance keeps a small pool (5 connections),
  so on serverless hosts use a pooled endpoint (Neon's `-pooler` host). Writes that check-then-act run in
  SERIALIZABLE transactions and are retried on conflict, so any number of instances can run at once.
  Backups: Neon keeps point-in-time history; elsewhere use `pg_dump`.
- **Migrations** run on first use (an advisory lock makes concurrent instances take turns), or explicitly
  with `npm run db:migrate`. A build refuses to run against a database from a newer build.
- **Deploying to Vercel:** add the Neon integration (it sets `DATABASE_URL`), set the other variables from
  `.env.example`, and register `https://<your-domain>/auth/google/callback` with Google. Put the Vercel
  functions and the Neon project in nearby regions (e.g. Mumbai / `bom1` with AWS `ap-south-1`).
- **Mail sync** runs when a signed-in user has the app open (on load if stale, every 10 minutes while the
  tab is visible, or on demand). There is no background worker yet, so mail isn't read while nobody has the
  app open — it catches up on the next visit. Mail from before the day the account was made is never read.
- **Logs** are one JSON object per line on stdout/stderr (`wire.sync_done`, `action.failed` with a `ref`
  users see in error messages, `auth.*`).
- **Health:** `GET /api/health` → 200 when the database is reachable and configuration is complete.
- **Rotating `APP_SECRET`** makes stored Google tokens unreadable; users simply reconnect Gmail.

## Known limits

- Reminders are prepared and recorded, then sent by you (WhatsApp link or clipboard) — the app doesn't send
  messages itself, and there are no scheduled nudges.
- The bank-mail parser covers common Indian bank/UPI alert formats; unfamiliar formats arrive as slips
  with the unread fields marked, for you to fill in.
