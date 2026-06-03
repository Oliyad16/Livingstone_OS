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
  return w === 'government' || w === 'client' ? w : 'private'
}

/**
 * Wrap any async handler (regardless of its argument shape — `(req)`, `(req, ctx)`,
 * `()`, etc.) so a thrown DB/runtime error becomes a clean `{error}` 500 instead
 * of an empty body that makes the client's response.json() throw. Use this for
 * the single-entity / special-action routes whose signatures don't fit `safe()`.
 */
export function guard<A extends unknown[]>(
  fn: (...args: A) => Promise<NextResponse>
): (...args: A) => Promise<NextResponse> {
  return async (...args: A) => {
    try {
      return await fn(...args)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
}

/**
 * Normalize a workspace value from a request body to a known value. Default is
 * 'private' unless `govDefault` is set (opportunities are government-domain).
 * Centralizes the per-POST ternaries so they can't drift apart.
 */
export function normalizeWorkspace(
  input: unknown,
  govDefault = false
): 'private' | 'government' {
  if (input === 'government') return 'government'
  if (input === 'private') return 'private'
  return govDefault ? 'government' : 'private'
}

/** Coerce the named (NUMERIC-as-string) fields of each row to real numbers. */
export function coerceNums<T extends Record<string, unknown>>(
  rows: T[],
  fields: (keyof T)[]
): T[] {
  return rows.map(r => {
    const out = { ...r }
    for (const f of fields) out[f] = Number(out[f]) as T[keyof T]
    return out
  })
}
