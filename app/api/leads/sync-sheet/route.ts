import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../../lib/db'
import { readSheet, mapRows, type ColumnMapping } from '../../../lib/sheets'

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
  const ws = workspace === 'government' ? 'government' : 'private'

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

  for (const l of leads) {
    if (!l.name && !l.company) { skipped++; continue }

    if (l.email) {
      // Does a lead with this email already exist?
      const existing = (await sql`SELECT id FROM leads WHERE lower(email) = lower(${l.email}) LIMIT 1`) as { id: string }[]
      if (existing.length > 0) {
        await sql`
          UPDATE leads SET
            name = ${l.name}, company = ${l.company}, phone = ${l.phone},
            service = COALESCE(NULLIF(${l.service}, ''), service),
            notes   = COALESCE(NULLIF(${l.notes}, ''), notes)
          WHERE id = ${existing[0].id}
        `
        updated++
      } else {
        await sql`
          INSERT INTO leads (id, name, company, email, phone, source, status, service, notes, touchpoints, workspace)
          VALUES (${newId()}, ${l.name}, ${l.company}, ${l.email}, ${l.phone}, ${l.source}, ${l.status}, ${l.service}, ${l.notes}, '[]'::jsonb, ${ws})
        `
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
