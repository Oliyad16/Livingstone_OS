import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { oauthClient, GA4_SCOPES, GA4_STATE_COOKIE as STATE_COOKIE } from '../../../lib/google'

export async function GET() {
  // Random one-time state, echoed back by Google and verified in the callback
  // (CSRF protection — prevents an attacker-initiated code from being saved).
  const state = randomBytes(16).toString('hex')

  const url = oauthClient().generateAuthUrl({
    access_type: 'offline',     // get a refresh_token
    prompt: 'consent',          // ensure refresh_token is returned
    scope: GA4_SCOPES,
    state,
  })

  const res = NextResponse.redirect(url)
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 minutes — just long enough to complete the consent screen
  })
  return res
}
