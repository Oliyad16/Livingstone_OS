import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { authUrl, LINKEDIN_STATE_COOKIE } from '../../../lib/linkedin'

export async function GET() {
  // Random one-time state, echoed back by LinkedIn and verified in the callback
  // (CSRF protection — prevents an attacker-initiated code from being saved).
  const state = randomBytes(16).toString('hex')

  const res = NextResponse.redirect(authUrl(state))
  res.cookies.set(LINKEDIN_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 minutes — just long enough to complete the consent screen
  })
  return res
}
