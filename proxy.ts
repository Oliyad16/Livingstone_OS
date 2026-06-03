import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE, isValidSession } from './app/lib/auth'

// Single-user access gate for the whole command center. Everything is blocked
// until the operator logs in (cookie set by /api/login), with two exceptions:
//  - the login page + login/logout API routes (so you can get in)
//  - the daily-post cron route, which authenticates with CRON_SECRET instead
//
// If DASHBOARD_PASSWORD isn't configured, the gate is disabled (fail-open) so a
// fresh/local install still works — set the password to actually lock it down.

const PUBLIC_PATHS = ['/login', '/api/login', '/api/logout']

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const password = process.env.DASHBOARD_PASSWORD

  // Not configured → don't lock anyone out of a fresh install.
  if (!password) return NextResponse.next()

  // The cron route guards itself with CRON_SECRET (checked in the handler).
  if (pathname === '/api/posts/daily') return NextResponse.next()

  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  if (isValidSession(req.cookies.get(SESSION_COOKIE)?.value, password)) {
    return NextResponse.next()
  }

  // API calls get a clean 401; page navigations get redirected to /login.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  return NextResponse.redirect(url)
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
