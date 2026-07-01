import { NextRequest, NextResponse } from 'next/server'
import { initSchema } from '../../lib/schema'
import { SESSION_COOKIE, isValidSession, safeEqual } from '../../lib/auth'

// Schema migration endpoint. Idempotent, but still privileged: it must never be
// callable by the public internet. Accepts EITHER a valid operator session
// cookie (run it from the logged-in browser) OR a CRON_SECRET bearer token
// (the post-deploy curl in the runbook). Local dev (NODE_ENV !== 'production')
// stays open so the runbook's plain `curl -X POST localhost:3000/api/init` works.
export async function POST(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD
  const secret = process.env.CRON_SECRET
  const isProd = process.env.NODE_ENV === 'production'

  const sessionOk = !!password && isValidSession(req.cookies.get(SESSION_COOKIE)?.value, password)

  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const bearerOk = !!secret && !!token && safeEqual(token, secret)

  const devUngated = !isProd

  if (!sessionOk && !bearerOk && !devUngated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await initSchema()
  return NextResponse.json({ ok: true, message: 'Schema initialized.' })
}
