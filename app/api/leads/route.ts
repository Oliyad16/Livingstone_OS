import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../lib/db'
import { safe, workspaceOf, normalizeWorkspace } from '../../lib/handler'

const SELECT = `
  SELECT id, name, company, email, phone, source, status, service, notes,
         touchpoints,
         created_at AS "createdAt",
         last_contacted_at AS "lastContactedAt"
  FROM leads
`

export const GET = safe(async (req) => {
  const ws = workspaceOf(req)
  const rows = await sql.query(`${SELECT} WHERE workspace = $1 ORDER BY created_at ASC`, [ws])
  return NextResponse.json(rows)
}, [])

export async function POST(req: NextRequest) {
  const body = await req.json()
  const ws = normalizeWorkspace(body.workspace)
  const id = Date.now().toString()
  await sql`
    INSERT INTO leads (id, name, company, email, phone, source, status, service, notes, touchpoints, workspace)
    VALUES (${id}, ${body.name}, ${body.company || ''}, ${body.email || ''}, ${body.phone || ''},
            ${body.source || 'other'}, ${body.status || 'new'}, ${body.service || ''},
            ${body.notes || ''}, '[]'::jsonb, ${ws})
  `
  const rows = await sql.query(`${SELECT} WHERE id = $1`, [id])
  return NextResponse.json(rows[0], { status: 201 })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const existing = await sql.query(`${SELECT} WHERE id = $1`, [body.id])
  if (existing.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const cur = existing[0]

  await sql`
    UPDATE leads SET
      name    = ${body.name    ?? cur.name},
      company = ${body.company ?? cur.company},
      email   = ${body.email   ?? cur.email},
      phone   = ${body.phone   ?? cur.phone},
      source  = ${body.source  ?? cur.source},
      status  = ${body.status  ?? cur.status},
      service = ${body.service ?? cur.service},
      notes   = ${body.notes   ?? cur.notes}
    WHERE id = ${body.id}
  `
  const rows = await sql.query(`${SELECT} WHERE id = $1`, [body.id])
  return NextResponse.json(rows[0])
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  await sql`DELETE FROM leads WHERE id = ${id}`
  return NextResponse.json({ ok: true })
}
