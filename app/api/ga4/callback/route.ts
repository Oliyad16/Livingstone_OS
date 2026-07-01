import { NextRequest, NextResponse } from 'next/server'
import type { Credentials } from 'google-auth-library'
import { oauthClient, saveConnection, GA4_STATE_COOKIE as STATE_COOKIE } from '../../../lib/google'

function bail(req: NextRequest, reason: string) {
  const res = NextResponse.redirect(new URL(`/analytics?error=${encodeURIComponent(reason)}`, req.url))
  res.cookies.delete(STATE_COOKIE)
  return res
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return bail(req, 'missing_code')

  // CSRF check: the state Google echoes back must match the one-time value we
  // set when the flow started. No match → this callback wasn't initiated here.
  const state = req.nextUrl.searchParams.get('state')
  const expected = req.cookies.get(STATE_COOKIE)?.value
  if (!state || !expected || state !== expected) return bail(req, 'state_mismatch')

  const client = oauthClient()
  let tokens: Credentials
  try {
    ;({ tokens } = await client.getToken(code))
  } catch {
    // Expired/invalid/reused code — send the operator back to retry cleanly.
    return bail(req, 'token_exchange_failed')
  }

  // Pull the account email from the id_token if present (best-effort).
  let email: string | null = null
  if (tokens.id_token) {
    try {
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token })
      email = ticket.getPayload()?.email ?? null
    } catch { /* email is cosmetic; never fail the connection over it */ }
  }

  await saveConnection({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
    email,
  })

  // Back to the analytics section.
  const res = NextResponse.redirect(new URL('/analytics?connected=1', req.url))
  res.cookies.delete(STATE_COOKIE)
  return res
}
