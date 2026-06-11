import { sql } from './db'

export async function initSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      company     TEXT DEFAULT '',
      email       TEXT DEFAULT '',
      phone       TEXT DEFAULT '',
      source      TEXT DEFAULT 'other',
      status      TEXT DEFAULT 'new',
      service     TEXT DEFAULT '',
      notes       TEXT DEFAULT '',
      touchpoints JSONB DEFAULT '[]'::jsonb,
      created_at  TIMESTAMPTZ DEFAULT now(),
      last_contacted_at TIMESTAMPTZ
    )
  `

  // Dedupe key for Sheet/CSV imports: one lead per non-empty email *per
  // workspace*. Scoping by workspace lets the same contact exist as both a
  // private lead and a government lead without a constraint collision, and keeps
  // imports from one workspace from clobbering another's leads.
  // NB: this index is created after the `workspace` column is added below; see
  // the workspace migration block at the end of this function.

  await sql`
    CREATE TABLE IF NOT EXISTS clients (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      company       TEXT DEFAULT '',
      email         TEXT DEFAULT '',
      phone         TEXT DEFAULT '',
      service       TEXT DEFAULT 'GEO',
      type          TEXT DEFAULT 'retainer',
      monthly_value NUMERIC DEFAULT 0,
      project_value NUMERIC DEFAULT 0,
      status        TEXT DEFAULT 'active',
      start_date    DATE,
      notes         TEXT DEFAULT '',
      created_at    TIMESTAMPTZ DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS financials (
      id       TEXT PRIMARY KEY,
      kind     TEXT NOT NULL,
      amount   NUMERIC NOT NULL,
      label    TEXT DEFAULT '',
      date     DATE NOT NULL,
      source   TEXT DEFAULT 'manual',
      ext_id   TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `

  // Stripe-synced rows are keyed by ext_id so re-syncs don't duplicate.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS financials_source_ext_id
    ON financials (source, ext_id)
    WHERE ext_id IS NOT NULL
  `

  // Single-row store for the connected Google account's OAuth tokens.
  await sql`
    CREATE TABLE IF NOT EXISTS ga4_connection (
      id            INT PRIMARY KEY DEFAULT 1,
      access_token  TEXT,
      refresh_token TEXT,
      expiry        TIMESTAMPTZ,
      email         TEXT,
      created_at    TIMESTAMPTZ DEFAULT now(),
      CONSTRAINT ga4_connection_singleton CHECK (id = 1)
    )
  `

  // Trend store: one row per (property, range) pull so deltas accumulate.
  await sql`
    CREATE TABLE IF NOT EXISTS ga4_snapshots (
      id           TEXT PRIMARY KEY,
      property_id  TEXT NOT NULL,
      property_name TEXT DEFAULT '',
      range_start  DATE NOT NULL,
      range_end    DATE NOT NULL,
      metrics      JSONB NOT NULL,
      fetched_at   TIMESTAMPTZ DEFAULT now()
    )
  `

  // Optionally pin a GA4 property to a client record.
  await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS ga4_property_id TEXT`

  // Authority content (LinkedIn/GEO posts). status + scheduled_for are present
  // now so later auto-posting needs no migration.
  await sql`
    CREATE TABLE IF NOT EXISTS posts (
      id           TEXT PRIMARY KEY,
      topic        TEXT DEFAULT '',
      body         TEXT NOT NULL,
      status       TEXT DEFAULT 'draft',
      scheduled_for TIMESTAMPTZ,
      source       TEXT DEFAULT 'claude',
      created_at   TIMESTAMPTZ DEFAULT now(),
      posted_at    TIMESTAMPTZ
    )
  `

  // Email outbox. The dashboard enqueues here; a local helper script sends via
  // the gws CLI (which can't run on Vercel), then marks sent + logs a touchpoint.
  await sql`
    CREATE TABLE IF NOT EXISTS email_outbox (
      id          TEXT PRIMARY KEY,
      lead_id     TEXT,
      to_email    TEXT NOT NULL,
      subject     TEXT NOT NULL,
      body        TEXT NOT NULL,
      status      TEXT DEFAULT 'queued',
      error       TEXT,
      created_at  TIMESTAMPTZ DEFAULT now(),
      sent_at     TIMESTAMPTZ
    )
  `

  // Government capture pipeline. Different shape from private leads: a
  // solicitation tied to an agency, vehicle, NAICS, due date, set-aside, source.
  // `extra` JSONB holds per-source fields that don't fit the fixed columns.
  await sql`
    CREATE TABLE IF NOT EXISTS opportunities (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      sol_no      TEXT DEFAULT '',
      agency      TEXT DEFAULT '',
      naics       TEXT DEFAULT '',
      vehicle     TEXT DEFAULT '',
      set_aside   TEXT DEFAULT '',
      value       NUMERIC DEFAULT 0,
      due_date    DATE,
      stage       TEXT DEFAULT 'identified',
      source      TEXT DEFAULT 'manual',
      url         TEXT DEFAULT '',
      notes       TEXT DEFAULT '',
      extra       JSONB DEFAULT '{}'::jsonb,
      workspace   TEXT DEFAULT 'government',
      created_at  TIMESTAMPTZ DEFAULT now()
    )
  `

  // Intake-agent columns on opportunities. RFPMart (and similar) emails are read
  // by the local fetch script, first-pass classified (RFI vs RFP), then verified +
  // researched. These columns hold that triage state. Idempotent ALTERs so they
  // apply to an existing opportunities table without a destructive migration.
  //   opp_type        'RFI' | 'RFP' | 'unknown'   — the differentiated record type
  //   verified        'pending' | 'verified' | 'rejected'
  //   verify_notes    research/verification summary (SAM.gov cross-check, etc.)
  //   source_email_id Gmail message id — the dedupe key so re-fetches don't double-insert
  //   intake_at       when verification last ran
  await sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS opp_type        TEXT DEFAULT 'unknown'`
  await sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS verified        TEXT DEFAULT 'pending'`
  await sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS verify_notes    TEXT DEFAULT ''`
  await sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS source_email_id TEXT`
  await sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS intake_at       TIMESTAMPTZ`

  // One opportunity per source email — makes the fetch script safely re-runnable.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS opportunities_source_email_idx
    ON opportunities (source_email_id) WHERE source_email_id IS NOT NULL
  `

  // Deal-room columns. Each opportunity becomes a "folder": a plain-language
  // summary plus a real Google Drive folder (created by the local sync-drive
  // script via gws). drive_folder_id is the Drive id; drive_folder_url is its
  // webViewLink for the "Open in Drive" button. Structured sub-objects that vary
  // in presence (keyDates, keyPeople) live in the existing `extra` JSONB instead
  // of dedicated columns.
  await sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS drive_folder_id  TEXT`
  await sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS drive_folder_url TEXT`
  await sql`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS summary          TEXT DEFAULT ''`

  // Cached Drive file list per opportunity. The local sync-drive script lists the
  // contract's Drive subfolders and upserts rows here so the deal-room page renders
  // instantly without a live Drive call. `folder` is the subfolder a file sits in
  // (Solicitation Docs / Our Responses / Research & Intel).
  await sql`
    CREATE TABLE IF NOT EXISTS opp_documents (
      id            TEXT PRIMARY KEY,
      opp_id        TEXT NOT NULL,
      name          TEXT NOT NULL,
      drive_file_id TEXT NOT NULL,
      url           TEXT DEFAULT '',
      mime_type     TEXT DEFAULT '',
      folder        TEXT DEFAULT '',
      size_bytes    BIGINT,
      modified_at   TIMESTAMPTZ,
      synced_at     TIMESTAMPTZ DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS opp_documents_opp_idx ON opp_documents (opp_id)`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS opp_documents_file_idx ON opp_documents (opp_id, drive_file_id)`

  // Payment-plan columns on clients. Deals range from simple retainers to
  // hybrid setup-fee + monthly, to milestone projects. Fixed terms live here;
  // the variable schedule lives in client_installments below.
  //   setup_fee          one-time onboarding/setup fee (hybrid GEO deals)
  //   billing_day        day-of-month the retainer bills (1-28)
  //   contract_months    minimum term length in months (0 = month-to-month)
  //   contract_end       computed/agreed end or renewal date
  //   stripe_customer_id link to the real Stripe customer for payment history
  await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS setup_fee          NUMERIC DEFAULT 0`
  await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS billing_day        INT`
  await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS contract_months    INT DEFAULT 0`
  await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS contract_end       DATE`
  await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`

  // Installment / milestone schedule per client. Covers deposit-milestone
  // project plans ("50% deposit, 25% design, 25% launch"), setup fees, and any
  // custom split. status is 'pending' | 'paid'; overdue is derived in the UI
  // (due_date < today AND pending) so it never goes stale in the DB.
  await sql`
    CREATE TABLE IF NOT EXISTS client_installments (
      id                TEXT PRIMARY KEY,
      client_id         TEXT NOT NULL,
      label             TEXT DEFAULT '',
      amount            NUMERIC NOT NULL,
      due_date          DATE,
      status            TEXT DEFAULT 'pending',
      paid_at           TIMESTAMPTZ,
      stripe_invoice_id TEXT,
      notes             TEXT DEFAULT '',
      created_at        TIMESTAMPTZ DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS client_installments_client_idx ON client_installments (client_id)`

  // Single-row store for the connected LinkedIn account's OAuth tokens.
  await sql`
    CREATE TABLE IF NOT EXISTS linkedin_connection (
      id            INT PRIMARY KEY DEFAULT 1,
      access_token  TEXT,
      refresh_token TEXT,
      expiry        TIMESTAMPTZ,
      member_urn    TEXT,
      name          TEXT,
      created_at    TIMESTAMPTZ DEFAULT now(),
      CONSTRAINT linkedin_connection_singleton CHECK (id = 1)
    )
  `

  // Track LinkedIn post id on posts so we don't double-publish.
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS linkedin_id TEXT`

  // Workspace separation columns. Run AFTER all CREATE TABLEs so this works on a
  // fresh database (the tables must exist before we alter them).
  await sql`ALTER TABLE leads      ADD COLUMN IF NOT EXISTS workspace TEXT DEFAULT 'private'`
  await sql`ALTER TABLE clients    ADD COLUMN IF NOT EXISTS workspace TEXT DEFAULT 'private'`
  await sql`ALTER TABLE financials ADD COLUMN IF NOT EXISTS workspace TEXT DEFAULT 'private'`
  await sql`ALTER TABLE posts      ADD COLUMN IF NOT EXISTS workspace TEXT DEFAULT 'private'`

  // Lead dedupe index — created here (not at table-creation) because it depends
  // on the workspace column above. Replace the old email-only index (which would
  // wrongly collide the same email across workspaces) with a per-workspace one.
  await sql`DROP INDEX IF EXISTS leads_email_unique`
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS leads_workspace_email_unique
    ON leads (workspace, lower(email)) WHERE email <> ''
  `

  // Indexes for the workspace filter present on every list query. Without these,
  // each GET full-scans the table as data grows.
  await sql`CREATE INDEX IF NOT EXISTS leads_workspace_idx      ON leads (workspace)`
  await sql`CREATE INDEX IF NOT EXISTS clients_workspace_idx    ON clients (workspace)`
  await sql`CREATE INDEX IF NOT EXISTS financials_workspace_idx ON financials (workspace)`
  await sql`CREATE INDEX IF NOT EXISTS posts_workspace_idx      ON posts (workspace)`
  await sql`CREATE INDEX IF NOT EXISTS opportunities_workspace_idx ON opportunities (workspace)`
}
