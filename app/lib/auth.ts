// Single-user access gate. This is an internal command center for one operator,
// so auth is a shared passphrase (DASHBOARD_PASSWORD) exchanged for a signed,
// httpOnly session cookie — not a multi-user identity system. The cookie value
// is an HMAC of a fixed marker keyed by DASHBOARD_PASSWORD, so it can be verified
// in the Edge proxy without a DB lookup and without storing the raw password.

import { createHmac, timingSafeEqual } from 'crypto'

export const SESSION_COOKIE = 'lv_session'
const MARKER = 'livingstone-os'

/** The expected cookie value for the configured password. */
export function sessionToken(password: string): string {
  return createHmac('sha256', password).update(MARKER).digest('hex')
}

/** Constant-time compare of a presented cookie value against the expected token. */
export function isValidSession(cookieValue: string | undefined, password: string): boolean {
  if (!cookieValue) return false
  const expected = sessionToken(password)
  if (cookieValue.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(cookieValue), Buffer.from(expected))
  } catch {
    return false
  }
}

/** Constant-time compare for the password itself (login + cron secret checks). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}
