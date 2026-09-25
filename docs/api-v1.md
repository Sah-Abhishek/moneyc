# Money Control API v1

The JSON API the Android app uses. Base URL: `https://moneyc.vercel.app/api/v1/`.
Routing lives in `src/server/api/router.ts`; every endpoint calls the same services and validation as the
website, so the website and the app behave identically. Tests: `src/server/api/api.test.ts`.

## Conventions

- **Auth.** Send `Authorization: Bearer <token>` on every request except `POST auth/google`. Tokens are
  ordinary sessions: stored hashed, valid 30 days, extended on use. A `401` with code `signed_out` means
  sign in again.
- **Requests.** Bodies are JSON objects (`Content-Type: application/json`, at most 64 KB).
  Amounts are **strings as the person typed them** (`"1,899.50"`, `"+2500"` in quick entry) so the server's
  parsing and error messages apply. Ids may be numbers or numeric strings.
- **Responses.** Amounts are **integer paise** (negative = money out of your account). Times are the user's
  wall clock, `"YYYY-MM-DDTHH:MM:SS"`, in `user.timezone`. Instants (`createdAt`, session expiry, sync
  times) are UTC ISO strings.
- **Envelope.** Success: `{ "ok": true, "data"?: …, "message"?: "…" }`. `message` is written for the person;
  show it as a toast/snackbar.
  Failure: `{ "ok": false, "code": "…", "error": "…", "fieldErrors"?: { "<field>": "…" } }`.

| Status | code | Meaning |
|---|---|---|
| 400 | `bad_request` | body isn't a JSON object |
| 401 | `signed_out` / `google_refused` | no/expired token; Google refused the sign-in code |
| 403 | `unverified` | the Google account's email isn't verified |
| 404 | `not_found` / `no_route` | record gone (or not yours) / unknown address |
| 405 | `method_not_allowed` | see the `Allow` header |
| 409 | `conflict` | changed elsewhere (stale `version`, slip already filed…) — reload and retry |
| 413 / 415 | `too_large` / `unsupported_media_type` | |
| 422 | `invalid` | validation or a rule of the book; `fieldErrors` names the fields |
| 500 | `server` | our fault; `error` carries a ref to quote |
| 503 | `not_configured` / `google_unreachable` | |

- **Idempotency.** Creating lines (`entries`, `entries/quick`, `slate` with a first line, `slate/:id/lines`)
  takes a `clientKey` (8–64 chars, e.g. a UUID made when the form opens). Resending the same key returns the
  first result with status `200` instead of `201`: safe to retry after a timeout.
- **Concurrency.** `PUT entries/:id` needs the `version` you loaded; `409` means someone changed it.

## Signing in (Android)

1. The app asks Google for authorization with scopes `openid email profile
   https://www.googleapis.com/auth/gmail.readonly`, requesting **offline access for the web client id**
   (`GOOGLE_CLIENT_ID`). Google returns a one-time **server auth code**.
2. `POST auth/google { "code": "<server auth code>" }` → `{ token, expiresAt, created, gmail, user }`.
   The server redeems the code (so the Gmail refresh token never lives on the phone), creates the account on
   first sign-in, and stores the Gmail grant encrypted. `gmail: false` means mail access wasn't granted.
3. Reconnecting Gmail is the same call again.

Requires an **Android** OAuth client in Google Cloud (package name + signing-certificate SHA-1) in the same
project as the web client.

## Endpoints

`:id` is a numeric id. Query parameters in `?…`.

### Session and shell
| | | |
|---|---|---|
| POST | `auth/google` | `{ code }` → `{ token, expiresAt, created, gmail, user }` (no auth) |
| POST | `auth/signout` | ends this token's session |
| GET | `me` | `{ user, connection, sync, waiting, book, hasEntries, today, bankCount }` |

`connection` is `connected` \| `reconnect` \| `no_gmail_scope` \| `not_configured`.

### Ledger
| | | |
|---|---|---|
| GET | `summary?m=YYYY-MM` | the month: spent, received, budget, daily spend, by tag |
| GET | `entries?m&filter&q&tag&group&page` | `filter`: `all` \| `wire` \| `hand` \| `untagged`; `group`: only lines stamped with one of that tag group's tags → `{ entries, total, page, pages, … }` (20 a page, newest first, each with the running `balance`) |
| GET | `entries/:id` | one line |
| POST | `entries` | `{ payee, amount, direction: out\|in, occurredAt, channel, tagId?, note?, chequeNo?, cash?, clientKey }` |
| POST | `entries/quick` | `{ payee, amount ("+…" = in), tagId?, channel?, clientKey }` — `channel` any but `ATM`, default `Cash` |
| PUT | `entries/:id` | same fields as create + `version` |
| DELETE | `entries/:id` | soft delete (undo with restore) |
| POST | `entries/:id/restore` | |
| PUT | `entries/:id/slate` | `{ personId }` — move the line onto someone's slate |
| DELETE | `entries/:id/slate` | make it an ordinary line again |
| GET | `export?month=YYYY-MM` | CSV file (`text/csv`) |

`channel`: `UPI` `Card` `Cash` `Cheque` `NEFT` `IMPS` `RTGS` `ATM` `Bank`. An unknown or future `m` falls back to
this month.

- `chequeNo` (digits, 4–12) is kept as the line's `ref` when `channel` is `Cheque`, and ignored otherwise.
  The bank's clearing mail up to 45 days later is flagged as this same line (`duplicateOf`) instead of a new payment.
- `cash` is required for money out over `ATM`: `wallet` = "I'll write down what I spend" (the line gets
  `toWallet: true`, counts neither as spending nor in the balance, and carries no tag), `spent` = count it all as spent.
- Every line carries `toWallet` (boolean).

### The wire
| | | |
|---|---|---|
| GET | `wire` | `{ waiting, decided (last 30), stats, connection, sync, autoFile }` |
| POST | `wire/sync` | `{ force? }` → `{ state: done\|busy\|too_soon, added, autoFiled, more }` |
| POST | `wire/:id/file` | `{ tagId?, personId?, payee?, amount?, cash? }` — sending `payee`/`amount` means "edited"; `cash` (`wallet`\|`spent`) is required for an ATM withdrawal, which is never filed automatically |
| POST | `wire/:id/unfile` | undo a filing |
| POST | `wire/:id/archive` · `wire/:id/restore` | |
| POST | `wire/:id/duplicate` | `{ entryId }` — "it's the same one" |
| POST | `wire/:id/unduplicate` | |
| DELETE | `wire/:id` | delete for good (never re-read from Gmail) |

### Tags, budgets, rules
| | | |
|---|---|---|
| GET | `tags` | `{ tags, usage: { "<id>": { entries, rules } } }` |
| POST · PUT | `tags` · `tags/:id` | `{ name, color, kind: spend\|income, budget? }` |
| DELETE | `tags/:id` | |
| POST | `tags/:id/merge` | `{ into }` |
| GET | `tag-groups` | `{ groups: [{ id, name, tagIds }], tags }` |
| POST · PUT | `tag-groups` · `tag-groups/:id` | `{ name, tagIds: [id, …] }` — spending tags only, at least one; a tag can be in several groups |
| DELETE | `tag-groups/:id` | the group only; its tags and lines stay |
| GET | `budgets?m` | `{ summary, tags, monthly }` |
| PUT | `budgets` | `{ monthly, tags: { "<id>": "5,000" \| "" } }` — all or nothing; errors keyed `monthly` / `tag-<id>` |
| GET | `rules` | `{ rules, tags }` |
| POST · PUT | `rules` · `rules/:id` | `{ field: sender\|payee_prefix\|amount_over, value, action: file\|tag\|ask, tagId? }` |
| DELETE | `rules/:id` | |
| POST | `rules/:id/move` | `{ direction: up\|down }` → the reordered rules |

`color`: `spend` `ink` `pending` `plum` `teal` `indigo` `credit` `faint`.

### The slate
| | | |
|---|---|---|
| GET | `slate` | `{ accounts (incl. archived), stats, fromWire }` |
| GET | `slate/:id` | `{ account, lines }` |
| POST | `slate` | `{ name, matchNames?, phone?, note?, amount?, direction?: gave\|got, occurredAt?, lineNote?, clientKey? }` |
| PUT · DELETE | `slate/:id` | |
| POST | `slate/:id/archive` | `{ archived: true\|false }` (only settled accounts) |
| POST | `slate/:id/lines` | `{ amount, direction: gave\|got, occurredAt, note, clientKey }` |
| DELETE | `slate/lines/:id` | |
| POST | `slate/:id/remind` | → `{ text, phone }` to share (WhatsApp / share sheet) |

### Reports and settings
| | | |
|---|---|---|
| GET | `reports?m&range=6m\|1y\|all` | `{ summary, months, merchants, groups }` — `groups`: per tag group `{ group, spent, prevSpent, count, byTag: [{ tag, total, count }] }` |
| GET | `settings` | `{ user, connection, sync, bankCount }` |
| PUT | `settings` | `{ monthlyBudget, timezone (IANA), autoFile: boolean }` |
| PUT | `settings/auto-file` | `{ on: boolean }` |
| PUT | `settings/senders` | `{ scope: banks\|only, senders: string[] \| "one per line" }` |
| POST | `gmail/disconnect` | revoke mail access (the book stays) |
| DELETE | `account` | `{ confirm: "<account email>" }` — deletes everything |
