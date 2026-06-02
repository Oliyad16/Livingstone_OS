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

  // Dedupe key for Sheet/CSV imports: one lead per non-empty email.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS leads_email_unique
    ON leads (lower(email)) WHERE email <> ''
  `

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

  // Workspace separation: every record belongs to 'private' (SMB/GEO) or
  // 'government' (capture/RFP). Existing rows default to private.
  await sql`ALTER TABLE leads      ADD COLUMN IF NOT EXISTS workspace TEXT DEFAULT 'private'`
  await sql`ALTER TABLE clients    ADD COLUMN IF NOT EXISTS workspace TEXT DEFAULT 'private'`
  await sql`ALTER TABLE financials ADD COLUMN IF NOT EXISTS workspace TEXT DEFAULT 'private'`
  await sql`ALTER TABLE posts      ADD COLUMN IF NOT EXISTS workspace TEXT DEFAULT 'private'`

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
}
