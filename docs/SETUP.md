# Setup

Everything you need to run the command center locally and configure each
integration. The app works with only `DATABASE_URL` set — every other
integration degrades gracefully until you add its keys.

---

## Environment variables

All secrets live in `.env.local` (local) and Vercel's Environment Variables
(production). `.env.local` is gitignored — never commit it.

| Variable | Required | Used by | Where to get it |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | All data | Neon dashboard → Connect, or local `postgresql://…` |
| `STRIPE_SECRET_KEY` | For revenue | Financials | Stripe → API keys → **restricted** key (read-only) |
| `GOOGLE_CLIENT_ID` | For GA4 | Analytics | Google Cloud → OAuth client (**Web**) |
| `GOOGLE_CLIENT_SECRET` | For GA4 | Analytics | same client |
| `GOOGLE_REDIRECT_URI` | For GA4 | Analytics | `http://localhost:3000/api/ga4/callback` (local) / Vercel URL + `/api/ga4/callback` |
| `ANTHROPIC_API_KEY` | Optional | Authority drafts | console.anthropic.com (falls back to template if unset) |
| `LINKEDIN_CLIENT_ID` | For posting | Authority | developer.linkedin.com app |
| `LINKEDIN_CLIENT_SECRET` | For posting | Authority | same app |
| `LINKEDIN_REDIRECT_URI` | For posting | Authority | `https://livingstone-os.vercel.app/api/linkedin/callback` |

> **Gmail + Sheets** do **not** use env vars — they go through the `gws` CLI,
> authenticated separately (see below).

---

## 1. Database (Neon)

The DB layer auto-detects the driver: Neon's serverless driver for
`*.neon.tech` URLs, standard `pg` for any other Postgres (e.g. local).

**Local Postgres:**
```bash
createdb livingstone_demo
# .env.local:
DATABASE_URL=postgresql://<you>@localhost:5432/livingstone_demo
```

**Neon (production):**
1. neon.tech → create project → copy the **pooled** connection string.
2. Put it in `.env.local` and in Vercel env vars.

**Initialize the schema** (idempotent — safe to re-run):
```bash
curl -X POST http://localhost:3000/api/init
```

---

## 2. Stripe (revenue)

1. https://dashboard.stripe.com/apikeys → **Create restricted key**
   - Permissions: **Charges → Read**, **Balance transactions → Read**, everything else **None**.
   - This produces an `rk_live_…` key — it can only *read* revenue, never move money.
2. `STRIPE_SECRET_KEY=rk_live_…` in `.env.local` (and Vercel).
3. In the app: **Financials → Sync Stripe**. Synced charges are tagged `private`
   and marked `auto` (can't be deleted by hand).

> ⚠️ Never use a standard `sk_live_` key here. It has full account access.

---

## 3. Google Analytics (GA4)

GA4 runs in the web app, so it needs a **Web** OAuth client.

1. **Enable APIs** in your Google Cloud project:
   - Google Analytics Admin API
   - Google Analytics Data API
2. **OAuth consent screen** → Audience → add your Google account as a **Test user**
   (skipping this causes "Access blocked").
3. **Create OAuth client ID → Web application**. Add **Authorized redirect URIs**:
   - `http://localhost:3000/api/ga4/callback`
   - `https://livingstone-os.vercel.app/api/ga4/callback`
4. Put `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` in
   `.env.local` (and Vercel — use the Vercel callback URL there).
5. In the app: **Analytics → Connect Google Analytics** → sign in → approve.
   The OAuth token is stored in the `ga4_connection` DB table, so once connected
   it works on **both** local and Vercel (they share the same Neon DB).

---

## 4. Gmail + Sheets (`gws` CLI)

`gws` is a local CLI ("Google Workspace CLI"). It cannot run on Vercel — the
follow-up sender runs on your machine (or a cron box).

1. Install: `npm install -g @googleworkspace/cli`
2. **Enable APIs**: Gmail API, Google Sheets API (and Drive API) in your project.
3. Create an OAuth client of type **Desktop app**, download the JSON, save it to:
   `~/.config/gws/client_secret.json`
4. Authenticate (interactive — opens a browser):
   ```bash
   gws auth login --services gmail,drive,sheets
   ```
   Press Enter on the scope picker, sign in, approve. Credentials are saved
   encrypted under `~/.config/gws/`.
5. Verify (read-only):
   ```bash
   gws gmail users messages list --params '{"userId":"me","maxResults":1}'
   ```

> Desktop clients need **no redirect URIs** — that avoids the `redirect_uri_mismatch`
> issues a Web client hits with `gws`.

---

## 5. LinkedIn (auto-posting)

The most gated integration — LinkedIn must approve your app.

1. developer.linkedin.com → **Create app** (tied to a Company Page).
2. Add products: **Sign In with LinkedIn (OpenID Connect)** + **Share on LinkedIn**
   (the latter needs LinkedIn's review — can take days, may be denied).
3. Auth tab → add redirect URL: `https://livingstone-os.vercel.app/api/linkedin/callback`
4. Copy Client ID + Secret → set `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` /
   `LINKEDIN_REDIRECT_URI` in Vercel env vars.
5. In the app: **Authority → Connect LinkedIn** → sign in → approve.

Until "Share on LinkedIn" is approved, Connect/Publish will fail — that's
LinkedIn's gate, not a bug.

---

## 6. Anthropic (optional — post drafts)

Without it, the Authority page generates posts from a built-in template. With it,
Claude writes each post in your voice.

1. console.anthropic.com → API Keys.
2. `ANTHROPIC_API_KEY=sk-ant-…` in `.env.local` (and Vercel).

---

## Deploy (Vercel)

1. Push to GitHub (`main`). Vercel auto-deploys on every push.
2. In Vercel → Project → Settings → Environment Variables, set every variable
   you use in production (at minimum `DATABASE_URL`, `STRIPE_SECRET_KEY`, and the
   Google + LinkedIn vars if those are live).
3. Redeploy after changing env vars (they only load on a fresh deploy).
