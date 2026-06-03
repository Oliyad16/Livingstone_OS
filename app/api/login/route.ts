import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, sessionToken, safeEqual } from '../../lib/auth'

// Exchange the shared passphrase for a signed, httpOnly session cookie.
export async function POST(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD
  if (!password) {
    // Gate disabled — nothing to log into.
    return NextResponse.json({ ok: true, gateDisabled: true })
  }

  let submitted = ''
  try {
    submitted = (await req.json())?.password ?? ''
  } catch {
    submitted = ''
  }

  if (!submitted || !safeEqual(submitted, password)) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, sessionToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
  return res
}
