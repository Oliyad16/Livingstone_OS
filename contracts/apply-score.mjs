#!/usr/bin/env node
// Apply a fit-score to one opportunity's `extra` JSONB. Idempotent merge.
// Usage: node apply-score.mjs '<json>'  where json = {id, score, breakdown:{...}, rationale, recommendation}
import { readFileSync } from 'node:fs'
import pg from 'pg'

const envLocal = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const DBURL = (envLocal.match(/^DATABASE_URL=(.*)$/m) || [])[1]?.trim()
if (!DBURL) { console.error('no DATABASE_URL'); process.exit(1) }

const payload = JSON.parse(process.argv[2])
const { id, score, breakdown, rationale, recommendation } = payload
if (!id || typeof score !== 'number') { console.error('need id + numeric score'); process.exit(1) }

const scored = {
  score,                       // 1..10 overall fit (weighted)
  breakdown,                   // {capabilityFit, eligibility, winLikelihood, valueEffortComplexity} each 0..10
  rationale,                   // 1-3 sentence why
  recommendation,              // 'pursue' | 'maybe' | 'pass'
  scoredAt: new Date().toISOString(),
}

const pool = new pg.Pool({ connectionString: DBURL })
await pool.query(
  `UPDATE opportunities
     SET extra = coalesce(extra,'{}'::jsonb) || $2::jsonb
   WHERE id = $1`,
  [id, JSON.stringify({ scoring: scored, score })]
)
console.log(`scored ${id}: ${score}/10 (${recommendation})`)
await pool.end()
