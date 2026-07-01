#!/usr/bin/env node
// One-off: re-insert accidentally-deleted opportunities from a captured snapshot.
// Reads /tmp/restore_rows.json (array of {id,title,agency,...,extra}). Skips any
// id that already exists (so it's safe to re-run). Restores as live (deleted_at NULL).
import { readFileSync } from 'node:fs'
import pg from 'pg'

const envLocal = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const DBURL = (envLocal.match(/^DATABASE_URL=(.*)$/m) || [])[1]?.trim()
const rows = JSON.parse(readFileSync('/tmp/restore_rows.json', 'utf8'))
const pool = new pg.Pool({ connectionString: DBURL })

let restored = 0, skipped = 0
for (const r of rows) {
  const exists = await pool.query(`SELECT 1 FROM opportunities WHERE id = $1`, [r.id])
  if (exists.rowCount > 0) { skipped++; continue }
  await pool.query(
    `INSERT INTO opportunities
       (id, title, sol_no, agency, naics, vehicle, set_aside, value, due_date,
        stage, source, url, notes, extra, workspace, opp_type, verified, summary,
        category, kind, deleted_at)
     VALUES ($1,$2,'',$3,$4,'',$5,$6,$7,'identified','rfpmart-digest','',$8,
             $9::jsonb,'government','RFP','verified',$10,'software','opportunity',NULL)`,
    [r.id, r.title, r.agency, r.naics, r.setAside, r.value, r.dueDate,
     r.notes, JSON.stringify(r.extra), r.summary]
  )
  restored++
  console.log(`restored ${r.id} [${r.extra.score}/10] ${r.title.slice(0, 50)}`)
}
console.log(`\nDone: ${restored} restored, ${skipped} already present.`)
await pool.end()
