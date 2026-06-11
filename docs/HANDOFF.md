# Livingstone Command Center — Handoff

_Last updated: June 11, 2026_

The single operating surface for the Livingstone Foundation's two business
sides — **Livingstone Solutions** (software/web dev + government contracts) and
**Livingstone Marketing** (GEO/SEO retainers) — built to run the company with
AI agents and minimal human intervention. The operator approves outbound;
everything else automates.

**Q2 2026 priorities this system serves**
1. **P1** — Close 4 GEO retainer clients by June 30 (packages $1.4k–$5.9k/mo)
2. **P2** — Become the GEO/AI-visibility authority (LinkedIn + content)
3. **P3** — Personal brand content (TikTok/YouTube → LinkedIn)

---

## 1. Stack & layout

| Layer | What |
|---|---|
| App | Next.js 16 (Turbopack) + React 19 + Tailwind 4, light-and-gold Livingstone theme (`app/globals.css` token remap) |
| DB | Neon Postgres (serverless driver; schema auto-migrates via `POST /api/init` → `app/lib/schema.ts`) |
| Integrations | Stripe (live, read + charge sync), GA4 (OAuth), LinkedIn (OAuth publish), Gmail/Drive via local `gws` CLI |
| Repo | `github.com/Oliyad16/Livingstone_OS`, branch `command-center` |
| Hosting | Vercel (livingstone-os.vercel.app) + local dev on this Mac |

**Workspaces:** every record is scoped `private` (commercial) / `government`
(gov capture) / `client` (unified cockpit view).

**Pages:** Overview, Leads, Follow-ups, Clients (+ per-client detail),
Opportunities (+ deal rooms), Financials, Authority (LinkedIn posts),
Analytics (GA4), Ads.

---

## 2. Access & security

- **Login:** username + password (`DASHBOARD_USER` / `DASHBOARD_PASSWORD` env
  vars — values live in `.env.local` locally and in Vercel env settings, never
  in this repo). Session = signed httpOnly cookie, 30 days.
- **Brute-force protection:** every login attempt is logged to the
  `login_attempts` table with IP, device (user agent), and geolocated place
  (city/region/country via ipapi.co). **3 failed attempts from one IP within
  15 minutes → that IP is locked out for 15 minutes and a security-alert email
  is queued to `ALERT_EMAIL`** with who/where/when. One alert per lockout.
- Alert delivery rides the outbox pipeline (section 4) — it sends when the
  Mac's `send-outbox` cron runs. Full audit history: `login_attempts` table.
- Cron-hit endpoints (`/api/posts/daily`, `/api/leads/followups/prepare`,
  intake/drive routes) bypass the session gate and self-authenticate with
  `Authorization: Bearer <CRON_SECRET>`.

---

## 3. Clients & payment plans (built June 11)

Client records carry the full deal shape:

- **Deal types:** monthly retainer, one-time project, or hybrid
  (**setup fee + monthly** — the standard GEO structure)
- **Contract terms:** billing day (1–28), contract length in months
  (0 = month-to-month), contract end/renewal date
- **Installment schedules** (`client_installments` table): milestone plans
  like "50% deposit / 25% design / 25% launch", each with amount, due date,
  paid/pending status. Overdue is computed live (due date passed + unpaid).
- **Stripe link:** each client can be tied to their real Stripe customer
  (auto-matched by email, linked with one click). The client page then shows
  **lifetime paid, open balance, active subscription, last 12 invoices** —
  read-only, the system never moves money.

**Client detail page** (`/clients/<id>`): Edit button for every field,
payment-plan cards (deal structure / contract value / collected vs scheduled /
overdue-or-next-due), installment table with mark-paid, Stripe history, and
GA4 website performance (organic + AI-referral sessions — the GEO proof
clients pay for).

---

## 4. Lead follow-up engine (built June 11)

The #1 time sink, automated with a human approval gate:

```
Stale lead (active, 3+ days no contact, has email)
  │  7:30am weekdays — auto-draft in Oliyad's voice (warm opener by source,
  │  service line, calendar link, signature)        [prepare cron]
  ▼
Approval queue on /followups  ←— OWNER: Approve & send / Edit first / Reject
  │  every 30 min, 8am–6pm weekdays                 [send-outbox cron]
  ▼
Sent via Gmail (gws) → touchpoint auto-logged → lead exits the stale queue
```

- Auto-drafting: `POST /api/leads/followups/prepare` (idempotent — one open
  draft per lead, never double-drafts). Runs from Vercel Cron (8:30a ET
  weekdays) once deployed, and/or local cron.
- **Safety invariant:** the sender only ever sends `status='queued'` rows, and
  only the owner's Approve button creates those. No approval → no email.
- "Draft all stale leads" button on /followups for on-demand runs.
- Setup (one-time, on the Mac): `bash scripts/setup-automation.sh`
  (requires `gws auth login` done once).

---

## 5. Other modules (pre-existing, operational)

- **Gov intake:** RFPMart emails → `scripts/fetch-rfpmart.mjs` → classify
  RFI/RFP → verify → triage UI; deal rooms with real Drive folders
  (`scripts/sync-drive.mjs`, `--enrich` for AI extraction of budget/dates/people).
- **Authority:** daily LinkedIn post draft (1pm UTC cron, rotating GEO topics)
  → approve on /authority → publish via LinkedIn OAuth.
- **Financials:** Stripe charge sync (`/api/financials/sync-stripe`) + manual
  entries; revenue/expense/net.
- **Analytics:** GA4 realtime, audience, peak times, AI-referral tracking.
- **Scheduled research:** `gov-cbe-daily-research` agent (7am) feeds verified
  gov opportunities (DC CBE / Treasury / VA / USPTO lanes).

---

## 6. Data state

Cleaned June 11 (real records only):

- **Clients:** Duro Design (Alex, $3,500 one-time project; $1,300 collected
  June 4, $2,200 balance pending)
- **Financials:** $1,000 Stripe (Dec 2025), $500 Stripe Mercy Borbor (Mar
  2026), $1,300 manual Duro Design (Jun 2026)
- **Opportunities:** 10 verified gov records (5 research-agent: USPTO, VA.gov,
  Treasury/IRS, DC Lottery, DC.gov Drupal; 5 manual RFPs with June 22–30 due
  dates incl. Hampton Roads $150k)
- **Leads:** empty — fills via UI, Sheet import, or intake
- Deleted: 8 seeded `@ex.com` demo leads, demo client, TEST opportunity,
  3 clone template posts (cleanup script: `.tmp-cleanup.mjs`, gitignored)

---

## 7. Runbook

```bash
npm run dev                        # local dashboard (localhost:3000)
npm run build                      # verify before pushing
curl -X POST localhost:3000/api/init   # apply schema after pulling changes
npm run send-outbox                # send approved emails now (gws)
npm run fetch-rfpmart              # pull RFP/RFI emails into intake
npm run sync-drive                 # sync gov deal-room Drive folders
bash scripts/setup-automation.sh   # install local crons (drafts + sending)
```

Deploy: push to `command-center` → Vercel auto-builds. After schema changes,
hit `POST /api/init` once on production.

### Env vars (set in `.env.local` + Vercel; see `.env.example`)

`DATABASE_URL` · `DASHBOARD_USER` · `DASHBOARD_PASSWORD` · `ALERT_EMAIL` ·
`CRON_SECRET` · `STRIPE_SECRET_KEY` · `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` ·
`LINKEDIN_CLIENT_ID/SECRET/REDIRECT_URI` · `ANTHROPIC_API_KEY` (optional —
AI drafting otherwise runs through scheduled Claude agents on the owner's
subscription; deterministic voice templates need no key)

Production redirect URIs must use the live domain and be registered in the
Google / LinkedIn developer consoles.

---

## 8. Operating model & roadmap

Per `AIS-OS/AGENT-ORG.md`: **approve-outbound now → full autonomy with a
daily brief later.** Anything that leaves the building (client emails,
LinkedIn posts, proposals) queues for one-click approval; internal work
(sync, classification, drafting, reporting) runs unattended.

Next builds, in order:
1. **Authority/LinkedIn engine v2** (P2) — 3 weekly post types
   (spotlight/dispatch/paper), Claude-agent drafting in voice, scheduled publish
2. **Money engine** — margin dashboard (MRR vs costs), overdue-installment
   chasing into the approval queue, Stripe subscription health
3. **Gov intake on schedule** — fetch-rfpmart + sync-drive crons, due-date
   alerts for the June 22–30 wave
4. **Daily Briefing** (the AGENT-ORG keystone) — one morning email: pipeline,
   approvals waiting, money, deadlines, decisions needed
