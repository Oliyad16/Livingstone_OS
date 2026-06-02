import { NextRequest, NextResponse } from 'next/server'

const NO_DB = 'DATABASE_URL is not set'

/**
 * Wraps a route handler so DB/runtime errors return clean JSON instead of an
 * empty 500 body (which makes the client's response.json() throw and hang).
 * When the DB simply isn't configured yet, returns the provided `emptyValue`
 * with 200 so the UI renders an empty state instead of crashing.
 * The wrapped fn receives the NextRequest so it can read query params.
 */
export function safe<T>(fn: (req: NextRequest) => Promise<NextResponse<T>>, emptyValue?: unknown) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      return await fn(req)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes(NO_DB) && emptyValue !== undefined) {
        return NextResponse.json(emptyValue)
      }
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
}

/** Read ?workspace= from a request, defaulting to 'private'. */
export function workspaceOf(req: NextRequest): string {
  const w = req.nextUrl.searchParams.get('workspace')
  return w === 'government' ? 'government' : 'private'
}
