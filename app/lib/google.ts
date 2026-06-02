import { OAuth2Client } from 'google-auth-library'
import { sql } from './db'

// Read-only scopes. analytics.readonly (GA4 list + reports) and
// spreadsheets.readonly (Sheets ingestion) share one Google connection.
export const GA4_SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'openid',
  'email',
]

export function oauthClient(): OAuth2Client {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error(
      'Google OAuth env vars missing. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI in .env.local.'
    )
  }
  return new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)
}

type ConnRow = {
  access_token: string | null
  refresh_token: string | null
  expiry: string | null
  email: string | null
}

export async function getConnection(): Promise<ConnRow | null> {
  const rows = (await sql`SELECT access_token, refresh_token, expiry, email FROM ga4_connection WHERE id = 1`) as ConnRow[]
  return rows[0] || null
}

export async function saveConnection(tokens: {
  access_token?: string | null
  refresh_token?: string | null
  expiry_date?: number | null
  email?: string | null
}) {
  const expiry = tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null
  await sql`
    INSERT INTO ga4_connection (id, access_token, refresh_token, expiry, email)
    VALUES (1, ${tokens.access_token ?? null}, ${tokens.refresh_token ?? null}, ${expiry}, ${tokens.email ?? null})
    ON CONFLICT (id) DO UPDATE SET
      access_token  = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, ga4_connection.refresh_token),
      expiry        = EXCLUDED.expiry,
      email         = COALESCE(EXCLUDED.email, ga4_connection.email)
  `
}

/**
 * Returns a valid access token, refreshing via the stored refresh_token if the
 * current one is expired. Throws if the account isn't connected yet.
 */
export async function getAccessToken(): Promise<string> {
  const conn = await getConnection()
  if (!conn || !conn.refresh_token) {
    throw new Error('Google account not connected. Visit /api/ga4/auth to connect.')
  }

  const fresh = conn.expiry && new Date(conn.expiry).getTime() > Date.now() + 60_000
  if (fresh && conn.access_token) return conn.access_token

  const client = oauthClient()
  client.setCredentials({ refresh_token: conn.refresh_token })
  const { credentials } = await client.refreshAccessToken()
  await saveConnection({
    access_token: credentials.access_token,
    refresh_token: credentials.refresh_token,
    expiry_date: credentials.expiry_date,
  })
  if (!credentials.access_token) throw new Error('Failed to refresh Google access token.')
  return credentials.access_token
}
