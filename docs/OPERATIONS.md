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

**Post to LinkedIn (GEO authority) — Mon/Wed/Fri**
1. The `linkedin-authority-drafts` Claude agent drafts the day's post at 8am
   (Mon ranking / Wed news / Fri education — see `docs/CONTENT-STRATEGY.md`).
   Fallback: Vercel cron → `/api/posts/daily` (17:00 UTC) if the agent didn't run.
2. Open **Authority** → edit the draft → **Approve**.
3. **Publish to LinkedIn** (if connected) or **Copy** and post manually.
   The header badge shows whether publishing targets the **company page**
   (`LINKEDIN_ORG_ID` set + reconnected) or the personal profile.

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

## Government opportunity intake (RFPMart → RFI/RFP triage)

Pulls RFPMart contract emails, classifies each **RFI vs RFP**, and queues them in
the Government workspace's **Intake** tab for verification. Like the sender above,
the fetch step uses the local `gws` CLI, so it runs on your machine, not Vercel.

**One-time:** make sure `gws` is authenticated — `gws auth login` (its token expires;
a `401 invalid_grant` means re-auth). After deploying schema changes, run
`POST /api/init` once to add the intake columns.

**The loop:**

```bash
npm run fetch-rfpmart                 # read RFPMart mail, classify, queue as pending
node scripts/fetch-rfpmart.mjs --dry-run   # preview parsed items, ingest nothing
node scripts/fetch-rfpmart.mjs --days 60   # widen the lookback window (default 45d)
node scripts/fetch-rfpmart.mjs --digest    # after ingest, email yourself the digest
```

1. **Fetch** queues each email as a `pending` opportunity (deduped on the Gmail
   message id, so it's safe to re-run).
2. **Verify** in **Government → Intake**: each item shows RFI vs RFP in two columns
   with different actions —
   - **RFP** → *Verify real* / *Reject*, then *Send to pipeline* (promotes it into
     the main Opportunities table at `qualified` for a bid/no-bid).
   - **RFI** → *Worth shaping* / *Skip* (parks it on watch to influence the future RFP).
3. **Notify** (optional): `--digest` (or `POST /api/intake/digest`) enqueues an
   `email_outbox` row to `OWNER_EMAIL`; `npm run send-outbox` then emails it to you.

> **Deeper research:** the in-app classify is a fast first pass. Authoritative
> verification (SAM.gov cross-check, web search, link/sender validation, future
> due-date check) is done with Claude + web and written back via
> `PUT /api/intake/<id>/verify`. Env: `OWNER_EMAIL` for the digest; `CRON_SECRET`
> (if set) must be passed by the script — it reads it from `.env.local`.

---

## Opportunity deal rooms (Drive folders per contract)

Each government opportunity is a **deal room**: click its name on the Opportunities
page to open a detail page with the summary, key facts, key dates, key people, and a
**Google Drive folder** holding the documents. Drive folders are created/listed by
the local `gws` CLI, so this step runs on your machine, not Vercel.

**One-time:** `gws auth login` with Drive scope (a `401 invalid_grant` means re-auth).
Optionally set `DRIVE_ROOT_FOLDER_ID` in `.env.local` to nest everything under an
existing Drive folder. Run `POST /api/init` once to add the deal-room columns.

```bash
npm run sync-drive                      # create folders + cache files for all gov opps
node scripts/sync-drive.mjs --id 123    # one opportunity only
node scripts/sync-drive.mjs --dry-run   # show the folder tree it would build, write nothing
```

It builds `Government Contracts / <year> / <contract>` with three subfolders —
**Solicitation Docs**, **Our Responses**, **Research & Intel** — lists their files,
and caches that list in `opp_documents` so the deal-room page renders instantly. The
page shows an **Open in Drive** button and the file list per subfolder. Re-run after
dropping new documents in Drive or writing a response. Folder ids are cached locally
in `.drive-cache.json` so re-runs don't re-search Drive.

> Summary, key dates, and key people are **agent-drafted on intake** and fully
> **editable inline** on the deal-room page (edits save on blur). The Drive sync only
> touches the document list + folder link.

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
