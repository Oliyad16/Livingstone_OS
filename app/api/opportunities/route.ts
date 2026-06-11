import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../lib/db'
import { safe, workspaceOf, normalizeWorkspace, coerceNums } from '../../lib/handler'

const SELECT = `
  SELECT id, title, sol_no AS "solNo", agency, naics, vehicle, set_aside AS "setAside",
         value, due_date::text AS "dueDate", stage, source, url, notes, extra,
         opp_type AS "oppType", verified, verify_notes AS "verifyNotes",
         source_email_id AS "sourceEmailId", intake_at AS "intakeAt",
         summary, drive_folder_id AS "driveFolderId", drive_folder_url AS "driveFolderUrl",
         created_at AS "createdAt"
  FROM opportunities
`

type Row = { value: string | number; [k: string]: unknown }
const coerce = (rows: Row[]) => coerceNums(rows, ['value'])

export const GET = safe(async (req) => {
  const ws = workspaceOf(req)
  // Order: soonest due date first (nulls last), then newest.
  const rows = (await sql.query(
    `${SELECT} WHERE workspace = $1 ORDER BY due_date ASC NULLS LAST, created_at DESC`,
    [ws]
  )) as Row[]
  return NextResponse.json(coerce(rows))
}, [])

export async function POST(req: NextRequest) {
  const b = await req.json()
  // Opportunities are a government-capture artifact, so they default to the
  // 'government' workspace when none is supplied (govDefault=true).
  const ws = normalizeWorkspace(b.workspace, true)
  const id = Date.now().toString()
  await sql`
    INSERT INTO opportunities (id, title, sol_no, agency, naics, vehicle, set_aside, value, due_date, stage, source, url, notes, extra, workspace, opp_type, verified, source_email_id, summary)
    VALUES (${id}, ${b.title}, ${b.solNo || ''}, ${b.agency || ''}, ${b.naics || ''}, ${b.vehicle || ''},
            ${b.setAside || ''}, ${b.value || 0}, ${b.dueDate || null}, ${b.stage || 'identified'},
            ${b.source || 'manual'}, ${b.url || ''}, ${b.notes || ''}, ${JSON.stringify(b.extra || {})}::jsonb, ${ws},
            ${b.oppType || 'unknown'}, ${b.verified || 'pending'}, ${b.sourceEmailId || null}, ${b.summary || ''})
  `
  const rows = (await sql.query(`${SELECT} WHERE id = $1`, [id])) as Row[]
  return NextResponse.json(coerce(rows)[0], { status: 201 })
}

export async function PUT(req: NextRequest) {
  const b = await req.json()
  const existing = (await sql.query(`${SELECT} WHERE id = $1`, [b.id])) as Row[]
  if (existing.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const cur = existing[0] as Record<string, unknown>

  await sql`
    UPDATE opportunities SET
      title     = ${b.title    ?? cur.title},
      sol_no    = ${b.solNo    ?? cur.solNo},
      agency    = ${b.agency   ?? cur.agency},
      naics     = ${b.naics    ?? cur.naics},
      vehicle   = ${b.vehicle  ?? cur.vehicle},
      set_aside = ${b.setAside ?? cur.setAside},
      value     = ${b.value    ?? cur.value},
      due_date  = ${b.dueDate  ?? cur.dueDate},
      stage     = ${b.stage    ?? cur.stage},
      source    = ${b.source   ?? cur.source},
      url       = ${b.url      ?? cur.url},
      notes     = ${b.notes    ?? cur.notes},
      opp_type  = ${b.oppType  ?? cur.oppType},
      verified  = ${b.verified ?? cur.verified},
      verify_notes = ${b.verifyNotes ?? cur.verifyNotes},
      summary   = ${b.summary  ?? cur.summary},
      drive_folder_id  = ${b.driveFolderId  ?? cur.driveFolderId},
      drive_folder_url = ${b.driveFolderUrl ?? cur.driveFolderUrl},
      extra     = ${b.extra !== undefined ? JSON.stringify(b.extra) : JSON.stringify(cur.extra ?? {})}::jsonb
    WHERE id = ${b.id}
  `
  const rows = (await sql.query(`${SELECT} WHERE id = $1`, [b.id])) as Row[]
  return NextResponse.json(coerce(rows)[0])
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  // Also drop the cached Drive document rows for this opp (no FK cascade).
  await sql`DELETE FROM opp_documents WHERE opp_id = ${id}`
  await sql`DELETE FROM opportunities WHERE id = ${id}`
  return NextResponse.json({ ok: true })
}
