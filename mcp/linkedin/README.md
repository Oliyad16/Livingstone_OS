# Livingstone LinkedIn MCP

An MCP (Model Context Protocol) stdio server that wraps the dashboard's LinkedIn
publishing. It shares the **same Neon database** (`linkedin_connection` + `posts`
tables) and the **same `LINKEDIN_*` env vars** as the Next.js app, so it reuses
the account you connected at `/api/linkedin/auth` — it does **not** run its own
OAuth flow.

## Tools

| Tool | What it does |
|---|---|
| `linkedin_connection_status` | Connected? mode (company-page vs personal), token expiry, name. |
| `linkedin_publish_now` | Publish a text post immediately. |
| `linkedin_create_draft` | Save a draft into the `posts` table (status=draft). |
| `linkedin_list_drafts` | List draft/scheduled posts. |
| `linkedin_publish_draft` | Publish a stored draft by id, mark posted, store `linkedin_id`. |
| `linkedin_org_analytics` | Company-page lifetime share stats (admin-gated). |

## Build

```bash
cd mcp/linkedin
npm install
npm run build      # → dist/server.js
```

## Register with Claude Code

```bash
claude mcp add livingstone-linkedin \
  --env DATABASE_URL="<neon url>" \
  --env LINKEDIN_CLIENT_ID="<id>" \
  --env LINKEDIN_CLIENT_SECRET="<secret>" \
  --env LINKEDIN_ORG_ID="<org id, for company-page mode>" \
  -- node /absolute/path/to/mcp/linkedin/dist/server.js
```

Env values mirror the dashboard's `.env.local`. Restart Claude Code after
adding so the tools load.

## Posting mode

- **Personal** (`LINKEDIN_ORG_ID` unset): posts to the connected member's feed.
  Requires the `w_member_social` scope on the connected token.
- **Company page** (`LINKEDIN_ORG_ID` set to the org id or full URN): posts as
  the page. Requires a LinkedIn app with the **Community Management API**
  product, you must be a **page admin**, and you must **reconnect** at
  `/api/linkedin/auth` so the token carries `w_organization_social`. Only this
  mode unlocks `linkedin_org_analytics`.

> As of this writing the dashboard `.env.local` has no `LINKEDIN_ORG_ID`, so the
> connected token is in personal mode. Set the var and reconnect to post as the
> company page.

## Not supported (LinkedIn API limits)

Reading other members' profiles, your connections, or the feed requires
LinkedIn **Partner Program** approval (Marketing / Sales Navigator tiers) and is
not available to a standard app. Those tools are intentionally omitted rather
than shipped as endpoints that 401.
