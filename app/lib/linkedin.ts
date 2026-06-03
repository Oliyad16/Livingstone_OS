import { sql } from './db'

// LinkedIn OAuth + posting.
// Scopes: openid/profile to get the member URN, w_member_social to post.
export const LINKEDIN_SCOPES = ['openid', 'profile', 'email', 'w_member_social']

const AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization'
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'

function env() {
  const { LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REDIRECT_URI } = process.env
  if (!LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET || !LINKEDIN_REDIRECT_URI) {
    throw new Error(
      'LinkedIn env vars missing. Set LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REDIRECT_URI.'
    )
  }
  return { LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REDIRECT_URI }
}

export function authUrl(): string {
  const { LINKEDIN_CLIENT_ID, LINKEDIN_REDIRECT_URI } = env()
  const u = new URL(AUTH_URL)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', LINKEDIN_CLIENT_ID)
  u.searchParams.set('redirect_uri', LINKEDIN_REDIRECT_URI)
  u.searchParams.set('scope', LINKEDIN_SCOPES.join(' '))
  return u.toString()
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

export async function exchangeCode(code: string) {
  const { LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REDIRECT_URI } = env()
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: LINKEDIN_CLIENT_ID,
    client_secret: LINKEDIN_CLIENT_SECRET,
    redirect_uri: LINKEDIN_REDIRECT_URI,
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    console.error(`LinkedIn token exchange error (${res.status}):`, await res.text())
    throw new Error('LinkedIn sign-in failed. Reconnect at /api/linkedin/auth.')
  }
  const tok = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string; id_token?: string }

  // Member URN comes from the userinfo endpoint (OpenID).
  const ui = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  })
  const info = ui.ok ? ((await ui.json()) as { sub?: string; name?: string }) : {}
  const memberUrn = info.sub ? `urn:li:person:${info.sub}` : null

  const expiry = new Date(Date.now() + tok.expires_in * 1000).toISOString()
  await sql`
    INSERT INTO linkedin_connection (id, access_token, refresh_token, expiry, member_urn, name)
    VALUES (1, ${tok.access_token}, ${tok.refresh_token ?? null}, ${expiry}, ${memberUrn}, ${info.name ?? null})
    ON CONFLICT (id) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, linkedin_connection.refresh_token),
      expiry = EXCLUDED.expiry,
      member_urn = COALESCE(EXCLUDED.member_urn, linkedin_connection.member_urn),
      name = COALESCE(EXCLUDED.name, linkedin_connection.name)
  `
  return { memberUrn, name: info.name }
}

async function getAccessToken(): Promise<{ token: string; urn: string }> {
  const conn = await getConnection()
  if (!conn?.access_token || !conn.member_urn) {
    throw new Error('LinkedIn not connected. Visit /api/linkedin/auth to connect.')
  }
  const fresh = conn.expiry && new Date(conn.expiry).getTime() > Date.now() + 60_000
  if (fresh) return { token: conn.access_token, urn: conn.member_urn }

  // Refresh if we have a refresh token (LinkedIn refresh tokens require approval; many apps only get long-lived access tokens).
  if (conn.refresh_token) {
    const { LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET } = env()
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: conn.refresh_token,
      client_id: LINKEDIN_CLIENT_ID,
      client_secret: LINKEDIN_CLIENT_SECRET,
    })
    const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
    if (res.ok) {
      const tok = (await res.json()) as { access_token?: string; expires_in?: number; refresh_token?: string }
      // Only persist a refresh that actually returned the fields we need — a
      // partial response would otherwise store a null token or a NaN expiry.
      if (tok.access_token && typeof tok.expires_in === 'number') {
        const expiry = new Date(Date.now() + tok.expires_in * 1000).toISOString()
        await sql`UPDATE linkedin_connection SET access_token = ${tok.access_token}, expiry = ${expiry}, refresh_token = COALESCE(${tok.refresh_token ?? null}, refresh_token) WHERE id = 1`
        return { token: tok.access_token, urn: conn.member_urn }
      }
    }
  }
  // Token expired and no usable refresh — surface a clear reconnect message.
  throw new Error('LinkedIn token expired. Reconnect at /api/linkedin/auth.')
}

/** Publish a text post to the connected member's LinkedIn feed. Returns the post id. */
export async function publishPost(text: string): Promise<string> {
  const { token, urn } = await getAccessToken()
  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: urn,
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
    console.error(`LinkedIn publish error (${res.status}):`, await res.text())
    throw new Error('LinkedIn publish failed. The post was not shared.')
  }
  const json = (await res.json()) as { id?: string }
  return json.id || 'posted'
}
