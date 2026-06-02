# Integrations

Status and design of each external connection. Setup steps live in
[SETUP.md](SETUP.md); troubleshooting in [OPERATIONS.md](OPERATIONS.md).

| Integration | Status | Runs on | What it powers |
|---|---|---|---|
| **Neon Postgres** | ✅ Live | Vercel + local | System of record (all data) |
| **Stripe** | ✅ Live | Vercel + local | Real revenue → Financials |
| **GA4** | ✅ Live | Vercel + local | Client website analytics, Analytics tab |
| **Gmail + Sheets** (`gws`) | ✅ Live | **Local only** | Follow-up sending, lead import |
| **LinkedIn** | 🟡 Code ready | Vercel | Auto-post authority content |
| **Anthropic** | ⚪ Optional | Vercel + local | Claude-written post drafts |

---

## Stripe
Read-only revenue sync via a **restricted** key. `POST /api/financials/sync-stripe`
pulls succeeded, non-refunded charges, dedupes by charge id, tags them
`source=stripe` / `workspace=private`. Cannot move money by design.

## GA4 (Google Analytics)
OAuth (Web client) — connect once, read **every property your account can access**.
Tokens stored in `ga4_connection` (DB), so the connection works on both local and
Vercel (shared Neon). Per-client tracking: link a `ga4_property_id` to a client →
their website data renders on their detail page with organic + AI-referral deltas.

## Gmail + Sheets (`gws` CLI)
`gws` is a **local binary** with local OAuth creds — it **cannot run on Vercel**.
So this is deliberately split:
- The **dashboard** (Vercel) enqueues follow-up emails into `email_outbox`.
- A **local script** (`scripts/send-outbox.mjs`) sends them via `gws` and logs touchpoints.

This keeps the deployed app working while the CLI stays where it can run.

## LinkedIn
OAuth + `publishPost()` via the UGC Posts API. Fully built (connect, publish,
daily auto-draft cron). **Gated on LinkedIn approving the app's "Share on LinkedIn"
product** — until then, Connect/Publish will fail (provider gate, not a bug). The
`posts` schema already carries `status` + `scheduled_for` + `linkedin_id`, so no
migration is needed once approved.

## Anthropic
Optional. Powers the Authority post writer with prompt-cached, voice-matched
drafts. Without a key, posts fall back to a built-in template (marked as such in
the UI).
