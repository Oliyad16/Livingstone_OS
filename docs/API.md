# API Reference

All routes live under `/api`. Most GET routes accept `?workspace=private|government|client`
and filter to it. Routes that read the DB return a clean `{error}` JSON on failure
(never an empty 500). Data-mutating routes expect JSON bodies.

---

All routes are behind the access gate when `DASHBOARD_PASSWORD` is set: requests
without a valid session cookie get `401` (API) or a redirect to `/login` (pages).
Exceptions: `/login`, `/api/login`, `/api/logout`, and `/api/posts/daily` (which
uses `CRON_SECRET` instead). See SECURITY.md.

---

## System

### `POST /api/init`
Creates/migrates all tables (idempotent). Run once after pointing at a fresh DB.
→ `{ ok: true, message: "Schema initialized." }`

---

## Auth

### `POST /api/login`
Exchange the shared passphrase for a session cookie. Body: `{ password }`
→ `{ ok: true }` + httpOnly `lv_session` cookie, or `401 { error }`.
When `DASHBOARD_PASSWORD` is unset → `{ ok: true, gateDisabled: true }`.

### `POST /api/logout`
Clears the session cookie. → `{ ok: true }`

---

## Leads

### `GET /api/leads?workspace=`
List leads for the workspace, oldest first. → `Lead[]`

### `POST /api/leads`
Create a lead. Body: `{ name, company?, email?, phone?, source?, status?, service?, notes?, workspace? }`
→ created `Lead`

### `PUT /api/leads`
Update a lead. Body: `{ id, ...fields }` → updated `Lead`

### `DELETE /api/leads`
Body: `{ id }` → `{ ok: true }`

### `POST /api/leads/touchpoint`
Append a touchpoint + set `last_contacted_at`. Body: `{ leadId, type, notes? }`
→ updated `Lead`

### `GET /api/leads/followups?workspace=`
Active leads (not closed/lost) with no contact in **3+ days**, most overdue first.
→ `{ staleDays, count, leads: Lead[] }` (each lead has `daysSince`)

### `POST /api/leads/draft`
Generate a voice-matched follow-up email for a lead. Body: `{ leadId }`
→ `{ subject, body, email }`

### `POST /api/leads/sheet-tabs`
List worksheet tabs in a Google Sheet (for import). Body: `{ spreadsheetId }`
→ `{ tabs: string[] }` (requires `gws`/Sheets access)

### `POST /api/leads/sync-sheet`
Import leads from a sheet tab, upsert by `lower(email)`.
Body: `{ spreadsheetId, tab, mapping, workspace? }` → `{ imported, updated }`

---

## Clients

### `GET /api/clients?workspace=`
List clients for the workspace. Numeric fields coerced to numbers. → `Client[]`

### `GET /api/clients/[id]`
Single client (with `ga4PropertyId`). → `Client` | `404`

### `POST /api/clients`
Create. Body: `{ name, company?, email?, phone?, service?, type?, monthlyValue?, projectValue?, startDate?, notes?, workspace? }`

### `PUT /api/clients`
Update, incl. linking a GA4 property: `{ id, ga4PropertyId? , ...fields }`

### `DELETE /api/clients`
Body: `{ id }` → `{ ok: true }`

---

## Financials

### `GET /api/financials?workspace=`
→ `{ revenue: Entry[], expenses: Entry[] }` (amounts as numbers; each entry has `source`)

### `POST /api/financials`
Manual entry. Body: `{ kind: 'revenue'|'expense', amount, label?, date?, workspace? }`

### `DELETE /api/financials`
Body: `{ id }` → `{ ok: true }`

### `POST /api/financials/sync-stripe`
Pull succeeded, non-refunded charges from Stripe into `financials` (tagged
`source='stripe'`, `workspace='private'`, deduped by charge id).
→ `{ ok: true, synced: <n> }`

---

## Analytics (GA4)

### `GET /api/ga4/auth`
Redirects to Google OAuth consent.

### `GET /api/ga4/callback?code=`
OAuth callback — exchanges code, stores token in `ga4_connection`, redirects to `/analytics`.

### `GET /api/ga4/properties`
→ `{ connected, email, properties: [{ id, name, account }] }` — every GA4 property
the connected account can access.

### `POST /api/ga4/report`
Run a report. Body: `{ propertyId, propertyName?, days=28, save=false }`
→ `{ range, priorRange, totals, byChannel, topPages, geo }` where `geo` isolates
organic + AI-referral sessions with period-over-period deltas. `save:true` stores
a snapshot in `ga4_snapshots`.

---

## Authority (posts)

### `GET /api/posts?workspace=`
List posts, newest first. → `Post[]`

### `POST /api/posts`
Generate a draft from a topic. Body: `{ topic, workspace? }` → created `Post`
(uses Claude if `ANTHROPIC_API_KEY` set, else a template; `source` reflects which)

### `PUT /api/posts`
Update body/status/scheduledFor. Body: `{ id, body?, status?, scheduledFor? }`

### `DELETE /api/posts`
Body: `{ id }`

### `GET /api/posts/suggestions`
→ `{ topics: string[] }` — rotating GEO topic ideas.

### `POST /api/posts/daily`
Idempotent: generate one draft today (private workspace) on a rotating topic if
none exists yet. Called by the Vercel cron. Requires `Authorization: Bearer
<CRON_SECRET>` when `CRON_SECRET` is set (otherwise the check is skipped).
→ `{ ok, created, topic? }` | `401`

### `POST /api/posts/publish`
Publish a post to LinkedIn, mark it posted. Body: `{ id }`
→ `{ ok, linkedinId }` | `{ error }` (if LinkedIn not connected/approved)

---

## LinkedIn

### `GET /api/linkedin/auth`
Redirect to LinkedIn OAuth.

### `GET /api/linkedin/callback?code=`
Exchange code, store token + member URN in `linkedin_connection`, redirect to `/authority`.

### `GET /api/linkedin/status`
→ `{ connected, name }`

---

## Outbox (follow-up email queue)

### `GET /api/outbox`
List queued/sent emails, newest first. → `OutboxRow[]`

### `POST /api/outbox`
Enqueue an email to send via the local `gws` sender.
Body: `{ leadId?, toEmail, subject, body }` → created row

> Sending happens out-of-band via `scripts/send-outbox.mjs` (`npm run send-outbox`).

---

## Opportunities (Government)

### `GET /api/opportunities?workspace=`
List, soonest due date first. Numeric `value` coerced. → `Opportunity[]`

### `POST /api/opportunities`
Body: `{ title, solNo?, agency?, naics?, vehicle?, setAside?, value?, dueDate?, stage?, source?, url?, notes?, extra?, workspace? }`

### `PUT /api/opportunities`
Update incl. stage moves. Body: `{ id, ...fields }`

### `DELETE /api/opportunities`
Body: `{ id }`
