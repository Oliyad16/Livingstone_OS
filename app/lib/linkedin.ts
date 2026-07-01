import { sql } from './db'

// LinkedIn versions the REST API by month (YYYYMM) and rejects versions that
// have aged out (HTTP 426 NONEXISTENT_VERSION). Keep this current; override via
// LINKEDIN_VERSION env if it needs bumping without a deploy.
const LINKEDIN_VERSION = process.env.LINKEDIN_VERSION?.trim() || '202506'

// LinkedIn OAuth + posting.
// Two mutually exclusive modes (LinkedIn requires the Community Management
// API product to be the ONLY product on its app, so org + member posting
// can't share one app):
// - Personal (LINKEDIN_ORG_ID unset): app with "Sign In (OpenID)" + "Share on
//   LinkedIn" products; openid/profile give the member URN, w_member_social
//   posts to the personal feed.
// - Company page (LINKEDIN_ORG_ID set): a DEDICATED app with only the
//   Community Management API product; we request just w_organization_social.
//   OpenID scopes aren't available on that app, so no member URN is stored.
export function linkedinScopes(): string[] {
  // Company-page mode needs BOTH write (post) and read (analytics) org scopes.
  // r_organization_social is required by organizationalEntityShareStatistics —
  // without it the analytics calls return 403 ACCESS_DENIED even when connected.
  // Reconnect at /api/linkedin/auth after the Community Management API product is
  // approved so the token carries the read scope.
  return orgUrn()
    ? ['w_organization_social', 'r_organization_social', 'rw_organization_admin']
    : ['openid', 'profile', 'email', 'w_member_social']
}

// Company page to post as. Accepts a bare numeric id ("12345678") or a full
// URN ("urn:li:organization:12345678"). Unset → posts go to the member feed.
export function orgUrn(): string | null {
  const id = process.env.LINKEDIN_ORG_ID?.trim()
  if (!id) return null
  return id.startsWith('urn:') ? id : `urn:li:organization:${id}`
}

const AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization'
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'

// One-time OAuth state cookie (CSRF protection for the LinkedIn connect flow).
export const LINKEDIN_STATE_COOKIE = 'li_oauth_state'

function env() {
  const { LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REDIRECT_URI } = process.env
  if (!LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET || !LINKEDIN_REDIRECT_URI) {
    throw new Error(
      'LinkedIn env vars missing. Set LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REDIRECT_URI.'
    )
  }
  return { LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REDIRECT_URI }
}

export function authUrl(state: string): string {
  const { LINKEDIN_CLIENT_ID, LINKEDIN_REDIRECT_URI } = env()
  const u = new URL(AUTH_URL)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', LINKEDIN_CLIENT_ID)
  u.searchParams.set('redirect_uri', LINKEDIN_REDIRECT_URI)
  u.searchParams.set('scope', linkedinScopes().join(' '))
  u.searchParams.set('state', state)
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
    // Log a truncated body only — error responses can echo request details.
    console.error(`LinkedIn token exchange error (${res.status}):`, (await res.text()).slice(0, 200))
    throw new Error('LinkedIn sign-in failed. Reconnect at /api/linkedin/auth.')
  }
  const tok = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string; id_token?: string }

  // Member URN comes from the userinfo endpoint (OpenID). On a dedicated
  // Community Management API app (company-page mode) openid isn't granted, so
  // this fails and we store no member URN — org mode doesn't need one.
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
  // The author URN: company page in org mode, otherwise the connected member.
  // Org mode works without a member URN (CMA-only apps can't provide one).
  const urn = orgUrn() ?? conn?.member_urn ?? null
  if (!conn?.access_token || !urn) {
    throw new Error('LinkedIn not connected. Visit /api/linkedin/auth to connect.')
  }
  const fresh = conn.expiry && new Date(conn.expiry).getTime() > Date.now() + 60_000
  if (fresh) return { token: conn.access_token, urn }

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
        return { token: tok.access_token, urn }
      }
    }
  }
  // Token expired and no usable refresh — surface a clear reconnect message.
  throw new Error('LinkedIn token expired. Reconnect at /api/linkedin/auth.')
}

/**
 * Publish a text post to LinkedIn. Posts as the company page when
 * LINKEDIN_ORG_ID is set (requires w_organization_social — reconnect after
 * setting the env var so the token carries the scope), otherwise as the
 * connected member. Returns the post id.
 */
export async function publishPost(text: string): Promise<string> {
  // getAccessToken resolves the author: company page in org mode, else member.
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
    // Log a truncated body only — error responses can echo request details.
    console.error(`LinkedIn publish error (${res.status}):`, (await res.text()).slice(0, 200))
    if (orgUrn() && (res.status === 401 || res.status === 403)) {
      throw new Error(
        'LinkedIn publish as company page failed (permission). Make sure the app has the Community Management API product, you are an admin of the page, and reconnect at /api/linkedin/auth so the token includes w_organization_social.'
      )
    }
    throw new Error('LinkedIn publish failed. The post was not shared.')
  }
  const json = (await res.json()) as { id?: string }
  return json.id || 'posted'
}

export type OrgStats = {
  impressionCount: number
  uniqueImpressionsCount: number
  clickCount: number
  likeCount: number
  commentCount: number
  shareCount: number
  engagement: number
}

/**
 * Lifetime company-page share statistics. Company-page mode only; requires
 * page-admin scopes (r_organization_social / rw_organization_admin). Returns
 * null when org mode isn't configured or the token lacks the scope, so callers
 * can degrade to the stored-posts view instead of failing.
 */
export async function getOrgStats(): Promise<OrgStats | null> {
  const org = orgUrn()
  if (!org) return null
  let token: string
  try {
    ;({ token } = await getAccessToken())
  } catch {
    return null
  }
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
    console.error(`LinkedIn org stats error (${res.status}):`, (await res.text()).slice(0, 200))
    return null
  }
  const json = (await res.json()) as {
    elements?: { totalShareStatistics?: Record<string, number> }[]
  }
  const t = json.elements?.[0]?.totalShareStatistics
  if (!t) return null
  return {
    impressionCount: t.impressionCount ?? 0,
    uniqueImpressionsCount: t.uniqueImpressionsCount ?? 0,
    clickCount: t.clickCount ?? 0,
    likeCount: t.likeCount ?? 0,
    commentCount: t.commentCount ?? 0,
    shareCount: t.shareCount ?? 0,
    engagement: t.engagement ?? 0,
  }
}

export type PostStat = {
  urn: string
  impressionCount: number
  uniqueImpressionsCount: number
  clickCount: number
  likeCount: number
  commentCount: number
  shareCount: number
  engagement: number // LinkedIn's engagement RATE (0..1)
}

/**
 * Per-post (per-share) statistics for company-page posts. Same product/scope
 * requirement as getOrgStats. Takes the stored UGC URNs (urn:li:ugcPost:… or
 * urn:li:share:…) and returns a map urn → stats. Returns {} when org mode isn't
 * configured, the token lacks the scope, or the call fails — callers degrade to
 * the cached/empty view rather than erroring.
 *
 * The statistics endpoint pages by the `shares` OR `ugcPosts` facet depending on
 * URN type, and accepts at most ~20 per call, so we batch and merge.
 */
export async function getPostStats(urns: string[]): Promise<Record<string, PostStat>> {
  const org = orgUrn()
  if (!org || urns.length === 0) return {}
  let token: string
  try {
    ;({ token } = await getAccessToken())
  } catch {
    return {}
  }

  const out: Record<string, PostStat> = {}
  // Split by URN type — LinkedIn keys the facet on the entity type.
  const ugcPosts = urns.filter(u => u.includes(':ugcPost:'))
  const shares = urns.filter(u => u.includes(':share:'))

  async function pull(facet: 'ugcPosts' | 'shares', list: string[]) {
    for (let i = 0; i < list.length; i += 20) {
      const batch = list.slice(i, i + 20)
      const u = new URL('https://api.linkedin.com/rest/organizationalEntityShareStatistics')
      u.searchParams.set('q', 'organizationalEntity')
      u.searchParams.set('organizationalEntity', org!)
      batch.forEach((urn, idx) => u.searchParams.set(`${facet}[${idx}]`, urn))
      const res = await fetch(u, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'LinkedIn-Version': LINKEDIN_VERSION,
        },
      })
      if (!res.ok) {
        console.error(`LinkedIn per-post stats error (${res.status}):`, (await res.text()).slice(0, 200))
        continue
      }
      const json = (await res.json()) as {
        elements?: { share?: string; ugcPost?: string; totalShareStatistics?: Record<string, number> }[]
      }
      for (const el of json.elements ?? []) {
        const urn = el.ugcPost || el.share
        const t = el.totalShareStatistics
        if (!urn || !t) continue
        out[urn] = {
          urn,
          impressionCount: t.impressionCount ?? 0,
          uniqueImpressionsCount: t.uniqueImpressionsCount ?? 0,
          clickCount: t.clickCount ?? 0,
          likeCount: t.likeCount ?? 0,
          commentCount: t.commentCount ?? 0,
          shareCount: t.shareCount ?? 0,
          engagement: t.engagement ?? 0,
        }
      }
    }
  }

  try {
    await pull('ugcPosts', ugcPosts)
    await pull('shares', shares)
  } catch (e) {
    console.error('LinkedIn per-post stats fetch failed:', e instanceof Error ? e.message : e)
  }
  return out
}
