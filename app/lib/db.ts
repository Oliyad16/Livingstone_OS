import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { Pool } from 'pg'

// Minimal shape our routes use: callable as a tagged template, plus `.query()`.
type SqlClient = NeonQueryFunction<false, false>

let _sql: SqlClient | null = null

function isNeonUrl(url: string): boolean {
  // Neon hosts end in neon.tech; anything else (localhost, RDS, etc.) → pg.
  return /neon\.tech/.test(url) || /\.neon\./.test(url)
}

/**
 * Wrap a node-postgres Pool so it can be called as a tagged template
 * (sql`SELECT ${x}`) — converting to $1,$2 placeholders — and also exposes
 * sql.query(text, params) returning rows directly, matching the Neon driver.
 */
function pgAdapter(pool: Pool): SqlClient {
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
    throw new Error(
      'DATABASE_URL is not set. Add your Neon connection string to .env.local (see .env.example).'
    )
  }
  _sql = isNeonUrl(url) ? neon(url) : pgAdapter(new Pool({ connectionString: url }))
  return _sql
}

// Lazy proxy: resolves the connection at request time, not import/build time.
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
