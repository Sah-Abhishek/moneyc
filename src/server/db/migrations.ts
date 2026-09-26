// Ordered, append-only schema migrations. Never edit a shipped migration —
// add a new one. `schema_migrations` records which have been applied.
//
// Conventions
//  - money is BIGINT paise; negative = money out of your account
//  - `occurred_at` is the wall-clock time in the owner's timezone
//    (users.timezone), "YYYY-MM-DDTHH:MM:SS" — bank mail is written that way,
//    and it keeps month/day grouping correct without per-query tz maths
//  - `created_at` / `updated_at` are UTC ISO instants, stored as text so they
//    compare and round-trip exactly as the app writes them
//  - names that must be unique "ignoring case" are indexed on lower(name)
//  - every user-owned row carries user_id and every query filters on it

export const MIGRATIONS: string[] = [
  /* 1 — initial schema */ `
  CREATE TABLE users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    google_sub    TEXT NOT NULL UNIQUE,
    email         TEXT NOT NULL,
    name          TEXT,
    timezone      TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    monthly_budget BIGINT,
    auto_file     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE sessions (
    id            TEXT PRIMARY KEY,               -- sha256 of the cookie token
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at    TEXT NOT NULL,
    expires_at    TEXT NOT NULL,
    last_seen_at  TEXT NOT NULL,
    user_agent    TEXT
  );
  CREATE INDEX sessions_user ON sessions(user_id);
  CREATE INDEX sessions_expiry ON sessions(expires_at);

  CREATE TABLE google_grants (
    user_id       BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    refresh_token TEXT,                           -- encrypted
    access_token  TEXT,                           -- encrypted
    access_expires_at TEXT,
    scope         TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'active', -- active | revoked
    updated_at    TEXT NOT NULL
  );

  CREATE TABLE tags (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    color         TEXT NOT NULL,
    kind          TEXT NOT NULL DEFAULT 'spend',  -- spend | income
    budget        BIGINT,                         -- paise per month, optional
    created_at    TEXT NOT NULL
  );
  CREATE UNIQUE INDEX tags_user_name ON tags(user_id, lower(name));

  CREATE TABLE people (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    match_names   TEXT NOT NULL DEFAULT '',       -- extra names/VPAs the wire may use, newline-separated
    phone         TEXT,
    note          TEXT,
    reminders_sent INTEGER NOT NULL DEFAULT 0,
    last_reminded_at TEXT,
    created_at    TEXT NOT NULL,
    archived_at   TEXT
  );
  CREATE UNIQUE INDEX people_user_name ON people(user_id, lower(name));

  CREATE TABLE wire_mails (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gmail_id      TEXT NOT NULL,
    sender        TEXT NOT NULL,
    bank          TEXT NOT NULL,
    subject       TEXT,
    body          TEXT NOT NULL,
    received_at   TEXT NOT NULL,                  -- local wall clock
    status        TEXT NOT NULL,                  -- waiting | filed | ignored | duplicate | skipped
    created_at    TEXT NOT NULL,
    decided_at    TEXT
  );
  CREATE UNIQUE INDEX wire_mails_gmail ON wire_mails(user_id, gmail_id);
  CREATE INDEX wire_mails_status ON wire_mails(user_id, status, received_at);

  CREATE TABLE entries (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    occurred_at   TEXT NOT NULL,
    payee         TEXT NOT NULL,
    amount        BIGINT NOT NULL CHECK (amount <> 0),
    channel       TEXT NOT NULL,
    ref           TEXT,
    account       TEXT,
    note          TEXT,
    tag_id        BIGINT REFERENCES tags(id) ON DELETE SET NULL,
    source        TEXT NOT NULL,                  -- hand | wire
    auto          BOOLEAN NOT NULL DEFAULT FALSE, -- filed by a rule without review
    mail_id       BIGINT REFERENCES wire_mails(id) ON DELETE SET NULL,
    person_id     BIGINT REFERENCES people(id) ON DELETE SET NULL, -- set when the money moved on the slate
    client_key    TEXT,                           -- idempotency key from the form that created it
    version       INTEGER NOT NULL DEFAULT 1,     -- bumped on every change; guards concurrent edits
    corrected     BOOLEAN NOT NULL DEFAULT FALSE, -- a person changed a line the wire filed by itself
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    deleted_at    TEXT
  );
  CREATE INDEX entries_user_time ON entries(user_id, occurred_at);
  CREATE INDEX entries_tag ON entries(tag_id) WHERE tag_id IS NOT NULL;
  CREATE INDEX entries_person ON entries(person_id) WHERE person_id IS NOT NULL;
  CREATE UNIQUE INDEX entries_mail ON entries(mail_id) WHERE mail_id IS NOT NULL;
  CREATE UNIQUE INDEX entries_client_key ON entries(user_id, client_key) WHERE client_key IS NOT NULL;

  -- The slate: money lent and borrowed. Positive amount = you gave them money.
  CREATE TABLE slate_lines (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    person_id     BIGINT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    occurred_at   TEXT NOT NULL,
    amount        BIGINT NOT NULL CHECK (amount <> 0),
    note          TEXT NOT NULL,
    entry_id      BIGINT REFERENCES entries(id) ON DELETE SET NULL,
    client_key    TEXT,
    created_at    TEXT NOT NULL,
    deleted_at    TEXT
  );
  CREATE INDEX slate_lines_person ON slate_lines(user_id, person_id, occurred_at);
  CREATE INDEX slate_lines_person_fk ON slate_lines(person_id);
  CREATE UNIQUE INDEX slate_lines_entry ON slate_lines(entry_id) WHERE entry_id IS NOT NULL;
  CREATE UNIQUE INDEX slate_lines_client_key ON slate_lines(user_id, client_key) WHERE client_key IS NOT NULL;

  CREATE TABLE rules (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    field         TEXT NOT NULL,                  -- sender | payee_prefix | amount_over
    value         TEXT NOT NULL,
    action        TEXT NOT NULL,                  -- file | tag | ask
    tag_id        BIGINT REFERENCES tags(id) ON DELETE CASCADE,
    position      INTEGER NOT NULL,
    created_at    TEXT NOT NULL
  );
  CREATE INDEX rules_user ON rules(user_id, position);
  CREATE INDEX rules_tag ON rules(tag_id) WHERE tag_id IS NOT NULL;

  CREATE TABLE sync_state (
    user_id       BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    running_since TEXT,
    last_started_at TEXT,
    last_success_at TEXT,
    last_error    TEXT,
    last_error_at TEXT,
    mails_seen    INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE oauth_states (
    state         TEXT PRIMARY KEY,
    code_verifier TEXT NOT NULL,
    return_to     TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );
  CREATE INDEX oauth_states_created ON oauth_states(created_at);
  `,
  /* 2 — which senders the wire reads */ `
  -- Newline-separated addresses or domains. Empty = every bank in the built-in list.
  ALTER TABLE users ADD COLUMN mail_senders TEXT NOT NULL DEFAULT '';
  -- Set when the sender list widens: the next read looks back to signup
  -- instead of from the last read, so the new senders' mail arrives too.
  ALTER TABLE sync_state ADD COLUMN rescan_requested_at TEXT;
  `,
  /* 3 — the parser learned UBI's and Jupiter's formats: read skipped mail again.
     Skipped rows hold no text (only the Gmail id, so they aren't fetched twice)
     and nothing refers to them; forgetting them and rescanning from signup
     lets the sync fetch and parse them afresh. Repeat this whenever the
     parser learns a new format. */ `
  DELETE FROM wire_mails WHERE status = 'skipped';
  UPDATE sync_state SET rescan_requested_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  `,
  /* 4 — the wire starts on the signup day. Mail read earlier from before that
     day goes, unless it is part of the ledger (filed, or matched to a line). */ `
  DELETE FROM wire_mails m USING users u
  WHERE m.user_id = u.id
    AND m.status NOT IN ('filed', 'duplicate')
    AND m.received_at < to_char((u.created_at::timestamptz AT TIME ZONE u.timezone)::date, 'YYYY-MM-DD');
  `,
  /* 5 — cash moved to the wallet, and tag groups */ `
  -- An ATM withdrawal the owner will write down spend by spend: the money only
  -- moved from the bank to the wallet, so it counts neither as spending nor
  -- against the balance (the cash lines written by hand do). Existing lines
  -- keep counting as spent, as they did before.
  ALTER TABLE entries ADD COLUMN to_wallet BOOLEAN NOT NULL DEFAULT FALSE;

  -- Named sets of tags ("Health": Healthy, Junk, Leisure) to read spending
  -- through. A tag can sit in any number of groups.
  CREATE TABLE tag_groups (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );
  CREATE UNIQUE INDEX tag_groups_user_name ON tag_groups(user_id, lower(name));

  CREATE TABLE tag_group_tags (
    group_id      BIGINT NOT NULL REFERENCES tag_groups(id) ON DELETE CASCADE,
    tag_id        BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, tag_id)
  );
  CREATE INDEX tag_group_tags_tag ON tag_group_tags(tag_id);
  `,
  /* 6 — what the money was for */ `
  -- "Biscuits" when the payee is the shop: what was bought, kept apart from
  -- who was paid and from the free-form note.
  ALTER TABLE entries ADD COLUMN item TEXT;
  `,
  /* 7 — a promise to pay back the rest */ `
  -- "Paid 1,800 of 2,000, the rest by 5 Oct": the day (YYYY-MM-DD, the
  -- owner's calendar) the open balance was promised by. Cleared once the
  -- account is square.
  ALTER TABLE people ADD COLUMN promised_by TEXT;
  `,
];
