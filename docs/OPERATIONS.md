# Operations

How to run the command center day to day.

---

## Daily

**Follow up with cold leads**
1. Open **Follow-ups** (Private workspace). Stale leads (3+ days no contact) are listed, most overdue first.
2. Click **Draft follow-up** → a voice-matched email appears, editable.
3. Either:
   - **Queue for Gmail** → adds to the outbox, then run `npm run send-outbox` locally to actually send (auto-logs the touchpoint), **or**
   - **Copy** / **Open in email** to send manually, then **Mark contacted**.

**Post to LinkedIn (GEO authority)**
1. A draft is auto-generated each morning (Vercel cron → `/api/posts/daily`). Open **Authority**.
2. Edit the draft → **Approve**.
3. **Publish to LinkedIn** (if connected) or **Copy** and post manually.

---

## Weekly

- **Sync Stripe** — Financials → **Sync Stripe** to pull the latest revenue (also runs fine anytime; deduped).
- **Save GA4 snapshots** — Analytics (or a client's page) → **Save snapshot** to capture this period's numbers, building the trend that becomes testimonial proof.
- **Review the pipeline** — Overview shows stage counts, MRR, follow-up alerts.

---

## Sending follow-up emails (the local sender)

`gws` is a local CLI, so this step runs on your machine, not Vercel:

```bash
npm run send-outbox            # send all queued emails
node scripts/send-outbox.mjs --dry-run   # preview, send nothing
```

It reads `email_outbox`, sends each via `gws gmail`, marks them `sent`, and logs a
touchpoint on the lead (clearing it from the Follow-ups queue).

> To automate: add a `launchd`/cron entry that runs `npm run send-outbox` on a
> schedule. Keep it local — `gws` won't run on Vercel.

---

## Importing leads from Google Sheets

1. Get the spreadsheet ID (from its URL).
2. `POST /api/leads/sheet-tabs { spreadsheetId }` to list tabs.
3. `POST /api/leads/sync-sheet { spreadsheetId, tab, mapping, workspace }` — `mapping`
   maps sheet columns to lead fields (name/email/company/etc.). Leads upsert by email.

Requires `gws` authenticated with Sheets scope.

---

## Linking a client's website (GA4)

1. **Client** workspace → **All Clients** → open a client.
2. **Website Performance** → pick their GA4 property from the dropdown.
3. Their live traffic (organic / AI-referral / sessions / conversions, period-over-period) renders on their page.

---

## Deploys

- Push to GitHub `main` → Vercel auto-deploys.
- After changing **env vars** in Vercel, trigger a **Redeploy** (vars load only on fresh deploys).
- After pointing at a fresh database, run `POST /api/init` once.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Redirected to `/login` / API returns `401` | The access gate is on (`DASHBOARD_PASSWORD` set). Log in at `/login`; the session cookie lasts 30 days. |
| Daily post stopped appearing | Cron now needs `CRON_SECRET`. Confirm it's set in Vercel (Cron sends the `Authorization` header automatically). The route is POST-only — a manual browser GET no longer triggers it. |
| Pages show empty / `connected:false` | `DATABASE_URL` missing or DB unreachable. Routes degrade gracefully; check the env var. |
| Stripe sync 500 | Bad/missing `STRIPE_SECRET_KEY`, or schema missing the `(source,ext_id)` index — re-run `/api/init`. |
| GA4 `redirect_uri_mismatch` | The redirect URI in the request isn't registered on the OAuth client. Add it **exactly** (no trailing slash). |
| GA4 `Access blocked` | Your account isn't a **Test user** on the consent screen. Add it. |
| GA4 `SERVICE_DISABLED` | Enable **Analytics Admin API** + **Analytics Data API** in the project, wait ~1 min. |
| `gws` "No OAuth client configured" | The client JSON is type `web`, not `installed`. Use a **Desktop app** client. |
| LinkedIn publish fails | "Share on LinkedIn" product not yet approved by LinkedIn, or token expired (reconnect). |
| Numbers concatenate (e.g. `$018002500`) | NUMERIC returned as string — already fixed by coercing at the API boundary; if it recurs, wrap in `Number()`. |
| Wrong workspace shows data | `workspaceOf` must return `client` for client requests (fixed) — confirm `?workspace=` is passed. |
