# Livingstone Command Center

A single command center for the Livingstone Solution business — leads, clients,
financials, government capture, website analytics, and LinkedIn authority — built
on Next.js, Postgres (Neon), and live integrations with Stripe, Google Analytics
(GA4), Gmail/Sheets (via the `gws` CLI), and LinkedIn.

**Live:** https://livingstone-os.vercel.app
**Repo:** https://github.com/Oliyad16/Livingstone_OS

---

## What it does

The command center is organized into three **workspaces**, switched from the top bar:

| Workspace | For | Sections |
|---|---|---|
| **Private** | SMB / GEO / web-dev clients | Overview, Leads, Follow-ups, Clients, Analytics, Authority, Financials |
| **Government** | Federal/state capture (RFPs) | Overview, Opportunities, Clients, Analytics, Financials |
| **Client** | Client management cockpit | All Clients, Analytics, Client Financials |

Every record (leads, clients, financials, posts, opportunities) is tagged with a
`workspace` and views are scoped to the active one.

### Core features

- **Leads / CRM** — pipeline stages, touchpoints, sources. Import from Google Sheets.
- **Follow-ups** — auto-detects leads with no contact in 3+ days, drafts a follow-up
  in your voice, and (via the local sender) emails it through Gmail + logs the touchpoint.
- **Clients** — list → detail page per client, with that client's **live GA4 website
  data** (organic / AI-referral / sessions / conversions) for testimonial proof.
- **Analytics** — connect your Google account once, read GA4 across every property
  you have access to. Save snapshots to build trends over time.
- **Authority** — generate LinkedIn/GEO posts in your voice (Claude or template),
  approve, and publish to LinkedIn. A daily cron drafts one automatically.
- **Financials** — Stripe revenue syncs in automatically; manual expenses.
- **Opportunities** (Government) — solicitation tracking: agency, NAICS, vehicle,
  set-aside, due date, stage, win-rate KPIs.

---

## Quick start (local)

```bash
npm install
cp .env.example .env.local      # fill in DATABASE_URL at minimum
npm run dev                     # http://localhost:3000
```

On first run, initialize the database schema:

```bash
curl -X POST http://localhost:3000/api/init
```

See **[docs/SETUP.md](docs/SETUP.md)** for the full environment + integration setup.

---

## Tech stack

- **Next.js 16** (App Router, Turbopack) + React 19 + Tailwind 4
- **Postgres** — Neon (serverless driver) in production, local Postgres in dev.
  The DB layer (`app/lib/db.ts`) auto-detects which driver to use from the URL.
- **Stripe** SDK — read-only revenue sync
- **google-auth-library** — GA4 OAuth (web flow)
- **`gws` CLI** — Gmail + Sheets (runs locally, not on Vercel)
- **@anthropic-ai/sdk** — LinkedIn post drafting (optional)

---

## Documentation

| Doc | What's in it |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | Environment variables + step-by-step setup for every integration |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the system is built — data model, workspaces, DB layer, deploy |
| [docs/API.md](docs/API.md) | Every API route, what it does, request/response shapes |
| [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) | Stripe, GA4, Gmail/Sheets, LinkedIn — how each connects + troubleshooting |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Daily/weekly tasks: syncing, sending follow-ups, posting, deploys |
| [docs/SECURITY.md](docs/SECURITY.md) | Secrets handling, key rotation, the current open security items |

---

## Status

✅ **Live & connected:** Stripe · Neon · Vercel · GA4 · Gmail/Sheets
🟡 **Built, needs your account step:** LinkedIn (app approval), Anthropic (API key)
📋 **Open items:** see [docs/SECURITY.md](docs/SECURITY.md) for outstanding key rotations.
