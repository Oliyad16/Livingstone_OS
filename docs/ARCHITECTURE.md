# Architecture

How the command center is built.

---

## Overview

```
                ┌─────────────────────────────────────────┐
                │  Next.js app (Vercel)                    │
                │  ┌──────────┐   ┌────────────────────┐   │
   Browser ───▶ │  │ Pages    │──▶│ API routes (/api)  │──┐│
                │  │ (client) │   └────────────────────┘  ││
                │  └──────────┘                           ││
                └──────────────────────────────────────── ││
                                                           ▼▼
                                              ┌────────────────────┐
                                              │ Neon Postgres       │
                                              │ (system of record)  │
                                              └────────────────────┘
        External (read):  Stripe API ─┐   GA4 API ─┐   LinkedIn API
                                       └─ synced into Neon via API routes

        Local only (CLI): gws ──▶ Gmail / Sheets   (scripts/send-outbox.mjs)
```

- The **browser** renders client components that call internal **API routes**.
- API routes read/write **Neon Postgres**, the single source of truth.
- **Stripe / GA4 / LinkedIn** are reached server-side from API routes and their
  data is stored in or rendered through Neon.
- **Gmail / Sheets** go through the `gws` CLI, which runs **locally** (it's a
  binary with local OAuth creds) — never on Vercel.

---

## Workspaces

Three top-level modes, held in React context (`app/components/WorkspaceContext.tsx`),
persisted to `localStorage`, switched from the top bar (`TopBar.tsx`):

- `private` — SMB / GEO / web
- `government` — capture / RFPs
- `client` — client cockpit

Every data table has a `workspace` column. API GET routes read `?workspace=` (via
`workspaceOf()` in `app/lib/handler.ts`) and filter to it; POSTs tag new rows with
the active workspace. The sidebar nav (`Sidebar.tsx`) shows different links per
workspace.

> Stripe revenue is always tagged `private` (private-side clients pay through
> Stripe), so it appears only under Private Financials.

---

## Data model (Neon Postgres)

Defined in `app/lib/schema.ts`, created/migrated by `POST /api/init` (idempotent).

| Table | Purpose | Key columns |
|---|---|---|
| `leads` | CRM pipeline | name, company, status, source, service, `touchpoints` (jsonb), `last_contacted_at`, `workspace` |
| `clients` | Client records | name, type (retainer/project), monthly_value, project_value, `ga4_property_id`, `workspace` |
| `financials` | Revenue + expenses | kind, amount, label, date, source, `ext_id` (Stripe charge id), `workspace` |
| `posts` | Authority content | topic, body, status (draft→approved→posted), `scheduled_for`, `linkedin_id`, `workspace` |
| `opportunities` | Gov capture | title, sol_no, agency, naics, vehicle, set_aside, value, due_date, stage, source, `extra` (jsonb) |
| `email_outbox` | Queued follow-up emails | lead_id, to_email, subject, body, status (queued→sent/failed) |
| `ga4_connection` | GA4 OAuth tokens | access_token, refresh_token, expiry, email (single row, id=1) |
| `linkedin_connection` | LinkedIn OAuth tokens | access_token, refresh_token, expiry, member_urn (single row, id=1) |

**Dedup:** `financials` has a partial unique index on `(source, ext_id)` so
re-syncing Stripe never duplicates charges.

---

## The database layer (`app/lib/db.ts`)

Dual-mode and lazy:

- **Neon URL** (`*.neon.tech`) → uses `@neondatabase/serverless` (HTTP driver,
  ideal for serverless/Vercel).
- **Any other Postgres** (e.g. `localhost`) → uses `pg` Pool, wrapped in an
  adapter so it supports the same tagged-template `sql\`…\`` *and* `sql.query()`
  API as the Neon driver.
- The connection is created **lazily** (on first query, not at import) so builds
  don't fail when `DATABASE_URL` is absent, and a `Proxy` resolves the right
  client at request time.

This is why the exact same code runs against local Postgres in dev and Neon in prod.

---

## Resilience: `app/lib/handler.ts`

`safe(fn, emptyValue)` wraps route handlers so:
- DB/runtime errors return clean JSON (`{error}`) instead of an empty 500 body
  (which would make the client's `response.json()` throw and hang the page).
- When `DATABASE_URL` is missing, GET routes return `emptyValue` (e.g. `[]`) so
  the UI shows an empty state instead of crashing.

`workspaceOf(req)` extracts `?workspace=` → `private` | `government` | `client`.

---

## Integrations (where each lives)

| Lib | Integration |
|---|---|
| `app/lib/stripe.ts` | Stripe client (null if no key) |
| `app/lib/google.ts` | Google OAuth client + token refresh (GA4) |
| `app/lib/ga4.ts` | GA4 Data API report builder (sessions, channels, GEO/SEO lens) |
| `app/lib/sheets.ts` | Google Sheets read + column mapping (lead import) |
| `app/lib/linkedin.ts` | LinkedIn OAuth + `publishPost()` |
| `app/lib/postwriter.ts` | Claude post drafting + template fallback + topic list |
| `app/lib/draft.ts` | Deterministic follow-up email writer (matches Olyad's voice) |

---

## Background / cadence

- **Daily auto-draft:** `vercel.json` defines a cron hitting `/api/posts/daily`
  at 13:00 UTC. It generates one post draft per day on a rotating topic
  (idempotent — skips if a post already exists for the day).
- **Follow-up sending:** `scripts/send-outbox.mjs` (run via `npm run send-outbox`)
  reads queued `email_outbox` rows, sends each through `gws`, marks them sent, and
  logs a touchpoint on the lead. Runs locally/cron, not on Vercel.

---

## Deploy

GitHub `main` → Vercel auto-deploy. Neon is the shared DB for local and prod, so
OAuth tokens (GA4, LinkedIn) saved from anywhere work everywhere.
