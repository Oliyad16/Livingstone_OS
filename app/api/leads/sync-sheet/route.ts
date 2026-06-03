import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../../lib/db'
import { readSheet, mapRows, type ColumnMapping } from '../../../lib/sheets'
import { normalizeWorkspace } from '../../../lib/handler'

/**
 * POST { spreadsheetId, tab, mapping }
 * Pulls rows from the sheet, upserts into leads (dedupe by lower(email)).
 * Rows without an email are inserted as new (can't dedupe them safely).
 */
export async function POST(req: NextRequest) {
  const { spreadsheetId, tab, mapping, workspace } = (await req.json()) as {
    spreadsheetId: string; tab: string; mapping: ColumnMapping; workspace?: string
  }
  if (!spreadsheetId || !tab) {
    return NextResponse.json({ error: 'spreadsheetId and tab required' }, { status: 400 })
  }
  const ws = normalizeWorkspace(workspace)

  let rows: string[][]
  try {
    rows = await readSheet(spreadsheetId, tab)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const leads = mapRows(rows, mapping || {})
  let inserted = 0, updated = 0, skipped = 0
  let seq = 0
  const newId = () => `${Date.now()}-${seq++}`

  // Resolve all existing emails (for this workspace) in ONE query instead of one
  // per row — avoids an N+1 on large imports. Map keyed by lower(email) → id.
  const emails = Array.from(
    new Set(leads.filter(l => l.email).map(l => l.email.toLowerCase()))
  )
  const existingById = new Map<string, string>()
  if (emails.length > 0) {
    const found = (await sql.query(
      `SELECT id, lower(email) AS email FROM leads WHERE workspace = $1 AND lower(email) = ANY($2)`,
      [ws, emails]
    )) as { id: string; email: string }[]
    for (const row of found) existingById.set(row.email, row.id)
  }

  for (const l of leads) {
    if (!l.name && !l.company) { skipped++; continue }

    if (l.email) {
      // Existence resolved from the batch map above (workspace-scoped), so a
      // same-email lead in another workspace is never clobbered.
      const existingId = existingById.get(l.email.toLowerCase())
      if (existingId) {
        await sql`
          UPDATE leads SET
            name = ${l.name}, company = ${l.company}, phone = ${l.phone},
            service = COALESCE(NULLIF(${l.service}, ''), service),
            notes   = COALESCE(NULLIF(${l.notes}, ''), notes)
          WHERE id = ${existingId}
        `
        updated++
      } else {
        const id = newId()
        await sql`
          INSERT INTO leads (id, name, company, email, phone, source, status, service, notes, touchpoints, workspace)
          VALUES (${id}, ${l.name}, ${l.company}, ${l.email}, ${l.phone}, ${l.source}, ${l.status}, ${l.service}, ${l.notes}, '[]'::jsonb, ${ws})
        `
        // Record it so a duplicate email later in the SAME sheet updates this row
        // instead of inserting again (and hitting the unique index).
        existingById.set(l.email.toLowerCase(), id)
        inserted++
      }
    } else {
      await sql`
        INSERT INTO leads (id, name, company, email, phone, source, status, service, notes, touchpoints, workspace)
        VALUES (${newId()}, ${l.name}, ${l.company}, '', ${l.phone}, ${l.source}, ${l.status}, ${l.service}, ${l.notes}, '[]'::jsonb, ${ws})
      `
      inserted++
    }
  }

  return NextResponse.json({ ok: true, total: leads.length, inserted, updated, skipped })
}
