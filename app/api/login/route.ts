import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, sessionToken, safeEqual } from '../../lib/auth'
import { sql } from '../../lib/db'

// Username + password gate with brute-force protection.
//
//  - Credentials: DASHBOARD_USER (default 'Oliyad') + DASHBOARD_PASSWORD.
//  - Every attempt is logged to login_attempts (ip, user agent, geo-located
//    place) — the security audit trail.
//  - 3 failed attempts from one IP inside 15 minutes → that IP is locked out
//    for 15 minutes AND an intruder-alert email (who/where/when) is queued to
//    ALERT_EMAIL via email_outbox. One alert per lockout, not per retry.
//    Delivery rides the existing outbox sender (send-outbox cron via gws).

const MAX_ATTEMPTS = 3
const WINDOW_MIN = 15
const ALERT_TO = () => process.env.ALERT_EMAIL || 'oliyad@thelivingstonefoundation.com'

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'unknown'
}

const PRIVATE_IP = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fe80)/

async function locate(ip: string): Promise<string> {
  if (!ip || ip === 'unknown' || PRIVATE_IP.test(ip)) return 'local network'
  try {
    const r = await fetch(`https://ipapi.co/${ip}/json/`, {
      signal: AbortSignal.timeout(3000),
      headers: { 'User-Agent': 'livingstone-os-security' },
    })
    const j = await r.json()
    if (j && j.city) return [j.city, j.region, j.country_name].filter(Boolean).join(', ')
  } catch { /* geo lookup is best-effort */ }
  return 'unknown location'
}

// Failures from this IP inside the window. Tolerates a missing table (first
// boot before /api/init) by treating it as zero history.
async function recentFailures(ip: string): Promise<{ count: number; alreadyAlerted: boolean }> {
  try {
    const rows = (await sql.query(
      `SELECT count(*)::int AS c, bool_or(alerted) AS a
       FROM login_attempts
       WHERE ip = $1 AND success = false AND created_at > now() - interval '${WINDOW_MIN} minutes'`,
      [ip]
    )) as { c: number; a: boolean | null }[]
    return { count: rows[0]?.c ?? 0, alreadyAlerted: !!rows[0]?.a }
  } catch {
    return { count: 0, alreadyAlerted: false }
  }
}

async function logAttempt(fields: { username: string; ip: string; userAgent: string; location: string; success: boolean; alerted: boolean }) {
  try {
    await sql`
      INSERT INTO login_attempts (id, username, ip, user_agent, location, success, alerted)
      VALUES (${Date.now().toString()}, ${fields.username}, ${fields.ip}, ${fields.userAgent},
              ${fields.location}, ${fields.success}, ${fields.alerted})
    `
  } catch { /* audit log is best-effort; never block login on it */ }
}

async function queueAlert(args: { username: string; ip: string; userAgent: string; location: string; failCount: number }) {
  const when = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'full', timeStyle: 'short' })
  const subject = `Security alert — ${args.failCount} failed logins to the Command Center`
  const body = [
    `Someone failed to log in to the Livingstone Command Center ${args.failCount} times in the last ${WINDOW_MIN} minutes. Their IP is now locked out for ${WINDOW_MIN} minutes.`,
    ``,
    `Username tried: ${args.username || '(blank)'}`,
    `IP address:     ${args.ip}`,
    `Location:       ${args.location}`,
    `Device:         ${args.userAgent || 'unknown'}`,
    `Time:           ${when} (ET)`,
    ``,
    `If this was you, just wait ${WINDOW_MIN} minutes and try again.`,
    `If this was NOT you, consider rotating DASHBOARD_PASSWORD in Vercel and .env.local.`,
    ``,
    `Full history: login_attempts table in the database.`,
  ].join('\n')
  try {
    await sql`
      INSERT INTO email_outbox (id, lead_id, to_email, subject, body, status)
      VALUES (${`alert-${Date.now()}`}, NULL, ${ALERT_TO()}, ${subject}, ${body}, 'queued')
    `
  } catch { /* alerting is best-effort */ }
}

export async function POST(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD
  if (!password) {
    // Gate disabled — nothing to log into.
    return NextResponse.json({ ok: true, gateDisabled: true })
  }
  const expectedUser = process.env.DASHBOARD_USER || 'Oliyad'

  let username = ''
  let submitted = ''
  try {
    const body = await req.json()
    username = body?.username ?? ''
    submitted = body?.password ?? ''
  } catch { /* fall through with empty creds */ }

  const ip = clientIp(req)
  const userAgent = req.headers.get('user-agent') || ''

  // Lockout check BEFORE verifying credentials — a locked IP gets no oracle.
  const { count: priorFails, alreadyAlerted } = await recentFailures(ip)
  if (priorFails >= MAX_ATTEMPTS) {
    const location = await locate(ip)
    await logAttempt({ username, ip, userAgent, location, success: false, alerted: false })
    return NextResponse.json(
      { error: `Too many attempts. Locked out for ${WINDOW_MIN} minutes.` },
      { status: 429 }
    )
  }

  const ok = !!username && !!submitted && safeEqual(username, expectedUser) && safeEqual(submitted, password)

  if (!ok) {
    const failCount = priorFails + 1
    const shouldAlert = failCount >= MAX_ATTEMPTS && !alreadyAlerted
    const location = await locate(ip)
    await logAttempt({ username, ip, userAgent, location, success: false, alerted: shouldAlert })
    if (shouldAlert) await queueAlert({ username, ip, userAgent, location, failCount })
    const left = MAX_ATTEMPTS - failCount
    return NextResponse.json(
      {
        error: left > 0
          ? `Incorrect username or password. ${left} attempt${left === 1 ? '' : 's'} left.`
          : `Too many attempts. Locked out for ${WINDOW_MIN} minutes.`,
      },
      { status: left > 0 ? 401 : 429 }
    )
  }

  // Success: log it (location best-effort) and set the session cookie.
  const location = await locate(ip)
  await logAttempt({ username, ip, userAgent, location, success: true, alerted: false })

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
