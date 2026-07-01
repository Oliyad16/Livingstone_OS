import { sql } from './db.js'

// Standalone port of app/lib/linkedin.ts, trimmed to what the MCP needs:
// company-page (and member-fallback) publishing + token refresh against the
// SAME linkedin_connection row the dashboard's OAuth flow writes. The MCP never
// runs the OAuth handshake itself — connect once in the dashboard at
// /api/linkedin/auth, and this reuses the stored token.

const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'

// LinkedIn versions the REST API by month (YYYYMM) and rejects aged-out versions
// (426 NONEXISTENT_VERSION). Keep current; override via LINKEDIN_VERSION env.
// Mirror of app/lib/linkedin.ts.
const LINKEDIN_VERSION = process.env.LINKEDIN_VERSION?.trim() || '202506'

// Company page to post as. Bare id ("12345678") or full URN. Unset → member feed.
export function orgUrn(): string | null {
  const id = process.env.LINKEDIN_ORG_ID?.trim()
  if (!id) return null
  return id.startsWith('urn:') ? id : `urn:li:organization:${id}`
}

type Conn = {
  access_token: string | null
  refresh_token: string | null
  expiry: string | null
  member_urn: string | null
  name: string | null
}

export async function getConnection(): Promise<Conn | null> {
  const rows = (await sql`SELECT access_token, refresh_token, expiry, member_urn, name FROM linkedin_connection WHERE id = 1`) as Conn[]
  return rows[0] || null
}

function clientEnv() {
  const { LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET } = process.env
  if (!LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET) {
    throw new Error('LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET missing in env.')
  }
  return { LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET }
}

async function getAccessToken(): Promise<{ token: string; urn: string }> {
  const conn = await getConnection()
  const urn = orgUrn() ?? conn?.member_urn ?? null
  if (!conn?.access_token || !urn) {
    throw new Error(
      'LinkedIn not connected. Open the dashboard and connect at /api/linkedin/auth first.' +
        (orgUrn() ? '' : ' (LINKEDIN_ORG_ID is unset — currently in personal mode; set it for company-page posting and reconnect.)')
    )
  }
  const fresh = conn.expiry && new Date(conn.expiry).getTime() > Date.now() + 60_000
  if (fresh) return { token: conn.access_token, urn }

  if (conn.refresh_token) {
    const { LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET } = clientEnv()
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: conn.refresh_token,
      client_id: LINKEDIN_CLIENT_ID,
      client_secret: LINKEDIN_CLIENT_SECRET,
    })
    const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
    if (res.ok) {
      const tok = (await res.json()) as { access_token?: string; expires_in?: number; refresh_token?: string }
      if (tok.access_token && typeof tok.expires_in === 'number') {
        const expiry = new Date(Date.now() + tok.expires_in * 1000).toISOString()
        await sql`UPDATE linkedin_connection SET access_token = ${tok.access_token}, expiry = ${expiry}, refresh_token = COALESCE(${tok.refresh_token ?? null}, refresh_token) WHERE id = 1`
        return { token: tok.access_token, urn }
      }
    }
  }
  throw new Error('LinkedIn token expired and no usable refresh token. Reconnect at /api/linkedin/auth.')
}

// Publish a text post. Company page when LINKEDIN_ORG_ID is set, else the
// connected member. Returns the LinkedIn post id.
export async function publishPost(text: string): Promise<string> {
  const { token, urn: author } = await getAccessToken()
  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
  })
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200)
    if (orgUrn() && (res.status === 401 || res.status === 403)) {
      throw new Error(
        `Company-page publish failed (${res.status}). Ensure the app has the Community Management API product, you are a page admin, and reconnect so the token includes w_organization_social. Detail: ${detail}`
      )
    }
    throw new Error(`LinkedIn publish failed (${res.status}). Detail: ${detail}`)
  }
  const json = (await res.json()) as { id?: string }
  return json.id || 'posted'
}

// Company-page post analytics (admin-gated). Lifetime share stats for the org.
export async function orgShareStats(): Promise<unknown> {
  const org = orgUrn()
  if (!org) throw new Error('LINKEDIN_ORG_ID is unset — analytics are only available in company-page mode.')
  const { token } = await getAccessToken()
  const u = new URL('https://api.linkedin.com/rest/organizationalEntityShareStatistics')
  u.searchParams.set('q', 'organizationalEntity')
  u.searchParams.set('organizationalEntity', org)
  const res = await fetch(u, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': LINKEDIN_VERSION,
    },
  })
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200)
    throw new Error(
      `Analytics fetch failed (${res.status}). Requires r_organization_social / rw_organization_admin and page-admin rights. Detail: ${detail}`
    )
  }
  return res.json()
}
