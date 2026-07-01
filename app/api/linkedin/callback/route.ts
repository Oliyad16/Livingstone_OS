import { NextRequest, NextResponse } from 'next/server'
import { exchangeCode, LINKEDIN_STATE_COOKIE } from '../../../lib/linkedin'

function bail(req: NextRequest, reason: string) {
  const res = NextResponse.redirect(new URL(`/authority?linkedin_error=${encodeURIComponent(reason)}`, req.url))
  res.cookies.delete(LINKEDIN_STATE_COOKIE)
  return res
}

export async function GET(req: NextRequest) {
  const error = req.nextUrl.searchParams.get('error')
  if (error) return bail(req, error)

  const code = req.nextUrl.searchParams.get('code')
  if (!code) return bail(req, 'missing_code')

  // CSRF check: the state LinkedIn echoes back must match the one-time value we
  // set when the flow started. No match → this callback wasn't initiated here.
  const state = req.nextUrl.searchParams.get('state')
  const expected = req.cookies.get(LINKEDIN_STATE_COOKIE)?.value
  if (!state || !expected || state !== expected) return bail(req, 'state_mismatch')

  try {
    await exchangeCode(code)
  } catch {
    return bail(req, 'token_exchange_failed')
  }

  const res = NextResponse.redirect(new URL('/authority?linkedin=connected', req.url))
  res.cookies.delete(LINKEDIN_STATE_COOKIE)
  return res
}
