# Security

How secrets are handled, and the current open items.

---

## How secrets are stored

- **Local:** `.env.local` only. It is gitignored and has never been committed —
  verified: no `sk_live`/`rk_live`/`GOCSPX`/DB-password patterns exist anywhere in
  the git history or tracked files. `.env.example` contains placeholders only.
- **Production:** Vercel Environment Variables (encrypted at rest).
- **GA4 / LinkedIn OAuth tokens:** stored in the database (`ga4_connection`,
  `linkedin_connection` tables), not in env. Refresh tokens let them renew automatically.
- **`gws` (Gmail/Sheets):** credentials stored **encrypted** under `~/.config/gws/`
  (AES-256-GCM, key in the OS keyring). Never in the repo.

**Rule:** secrets are never committed and never placed in URLs/query strings.

---

## Access control (the auth gate)

The whole app sits behind a single-operator access gate (`proxy.ts` + `app/lib/auth.ts`):

- Set **`DASHBOARD_PASSWORD`** → every page + API route requires logging in at
  `/login`. The passphrase is exchanged (`POST /api/login`) for a signed, httpOnly
  session cookie; the proxy verifies it on every request and returns `401` (API)
  or redirects to `/login` (pages) otherwise.
- **Fail-open by design:** with no `DASHBOARD_PASSWORD` set, the gate is disabled
  so fresh/local installs work. **Production must set it.**
- The cookie stores an HMAC (keyed by the password) of a fixed marker — not the
  password itself — so it can be verified without a DB lookup and reveals nothing
  if leaked.
- The daily-post cron route (`/api/posts/daily`) is exempt from the session gate
  (the cron has no session) and instead authenticates with **`CRON_SECRET`**
  (`Authorization: Bearer …`, sent automatically by Vercel Cron).
- Provider API error text (Stripe/GA4/Sheets/LinkedIn) is logged server-side and
  replaced with generic messages before reaching the client, so rate-limit /
  internal / OAuth details aren't disclosed.

---

## Stripe key — use the right type

The app uses a **restricted, read-only** key (`rk_live_…`) with only
**Charges: Read** + **Balance transactions: Read**. It physically cannot move
money or create charges. **Never** put a standard `sk_live_…` key in this app —
that key has full account access.

---

## ⚠️ Open security items

These require action in the provider dashboards (only the account owner can do them):

### 0. 🔴 Enable the access gate in production — DO THIS FIRST
The dashboard is internet-facing and **fail-open** until configured. In Vercel:
- Set **`DASHBOARD_PASSWORD`** (long random string) → redeploy → confirm `/login` appears.
- Set **`CRON_SECRET`** (long random string) so the daily cron is authenticated.
- Re-run **`POST /api/init`** once to migrate the lead-dedup index (log in first).

### 1. 🔴 Roll the exposed Stripe secret key — HIGH PRIORITY
A full-access standard secret key (`sk_live_…`) was pasted into a chat during
setup and should be considered compromised.
- Stripe → API keys → the **standard Secret key** → **Roll** (or Delete).
- This does **not** affect the app — it uses the separate restricted `rk_live_` key.

### 2. 🟡 Reset the Neon database password
The Neon connection string (with password) was shared in chat.
- Neon → Roles → `neondb_owner` → **Reset password**.
- Then update `DATABASE_URL` in `.env.local` **and** Vercel env vars → redeploy.
- Lower urgency than Stripe (DB-scoped, cannot move money).

### 3. 🟡 Rotate the Google OAuth client secret (optional)
The Google client secret (`GOCSPX-…`) was shared. Low risk (read-only Analytics
scope), but can be rotated in the Cloud Console if desired, then updated in
`.env.local` + Vercel.

### 4. Clean up extra Stripe / OAuth artifacts
- Stripe shows two client secrets at one point — delete the unused/old one.
- The Google project had stray redirect URIs (`trycloudflare`, `oauthplayground`)
  on the web client — harmless but worth removing for hygiene.

---

## Action boundaries (what the assistant will / won't do)

For safety, the assistant **will not**:
- Enter API keys/passwords into provider login forms, or authenticate accounts.
- Roll/rotate keys on Stripe, Neon, Google, or LinkedIn (provider-side account actions).
- Send email, publish posts, or move money without explicit per-action confirmation.

It **will**: wire keys you provide into `.env.local`, verify connections with
read-only tests, and keep secrets out of the repo. Key creation/rotation in
provider dashboards is always the owner's action.
