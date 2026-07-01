import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import pg from 'pg'

// Minimal SQL client: callable as a tagged template, plus `.query()`.
// Mirrors app/lib/db.ts so the MCP talks to the same Neon database the
// dashboard uses (single shared linkedin_connection + posts tables).
type SqlClient = NeonQueryFunction<false, false>

let _sql: SqlClient | null = null

function isNeonUrl(url: string): boolean {
  return /neon\.tech/.test(url) || /\.neon\./.test(url)
}

function pgAdapter(pool: pg.Pool): SqlClient {
  const tagged = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = ''
    strings.forEach((s, i) => {
      text += s
      if (i < values.length) text += `$${i + 1}`
    })
    const res = await pool.query(text, values)
    return res.rows
  }
  ;(tagged as unknown as { query: (t: string, p?: unknown[]) => Promise<unknown[]> }).query = async (
    text: string,
    params?: unknown[]
  ) => (await pool.query(text, params)).rows
  return tagged as unknown as SqlClient
}

function getSql(): SqlClient {
  if (_sql) return _sql
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL is not set. Pass the dashboard\'s Neon connection string via env.')
  }
  _sql = isNeonUrl(url) ? neon(url) : pgAdapter(new pg.Pool({ connectionString: url }))
  return _sql
}

export const sql = new Proxy((() => {}) as unknown as SqlClient, {
  apply(_t, _this, args: unknown[]) {
    return (getSql() as (...a: unknown[]) => unknown)(...args)
  },
  get(_t, prop: string) {
    const fn = getSql() as unknown as Record<string, unknown>
    const value = fn[prop]
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(fn) : value
  },
})
