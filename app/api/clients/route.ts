import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../lib/db'
import { safe, workspaceOf, normalizeWorkspace, coerceNums } from '../../lib/handler'

const SELECT = `
  SELECT id, name, company, email, phone, service, type, status, notes,
         monthly_value AS "monthlyValue",
         project_value AS "projectValue",
         start_date    AS "startDate",
         ga4_property_id AS "ga4PropertyId",
         created_at    AS "createdAt"
  FROM clients
`

type ClientRow = { monthlyValue: string | number; projectValue: string | number; [k: string]: unknown }

// NUMERIC columns come back as strings from node-postgres; coerce at the
// boundary so the client always gets real numbers (prevents string-concat bugs).
const coerce = (rows: ClientRow[]) => coerceNums(rows, ['monthlyValue', 'projectValue'])

export const GET = safe(async (req) => {
  // 'client' workspace is the unified client cockpit: return clients from BOTH
  // business sides. Otherwise scope to the requested workspace.
  const raw = req.nextUrl.searchParams.get('workspace')
  let rows: ClientRow[]
  if (raw === 'client') {
    rows = (await sql.query(`${SELECT} ORDER BY created_at ASC`)) as ClientRow[]
  } else {
    const ws = workspaceOf(req)
    rows = (await sql.query(`${SELECT} WHERE workspace = $1 ORDER BY created_at ASC`, [ws])) as ClientRow[]
  }
  return NextResponse.json(coerce(rows))
}, [])

export async function POST(req: NextRequest) {
  const body = await req.json()
  const ws = normalizeWorkspace(body.workspace)
  const id = Date.now().toString()
  const startDate = body.startDate || new Date().toISOString().split('T')[0]
  await sql`
    INSERT INTO clients (id, name, company, email, phone, service, type,
                         monthly_value, project_value, status, start_date, notes, workspace)
    VALUES (${id}, ${body.name}, ${body.company || ''}, ${body.email || ''}, ${body.phone || ''},
            ${body.service || 'GEO'}, ${body.type || 'retainer'},
            ${body.monthlyValue || 0}, ${body.projectValue || 0},
            'active', ${startDate}, ${body.notes || ''}, ${ws})
  `
  const rows = (await sql.query(`${SELECT} WHERE id = $1`, [id])) as ClientRow[]
  return NextResponse.json(coerce(rows)[0], { status: 201 })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const existing = await sql.query(`${SELECT} WHERE id = $1`, [body.id])
  if (existing.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const cur = existing[0]

  await sql`
    UPDATE clients SET
      name          = ${body.name         ?? cur.name},
      company       = ${body.company      ?? cur.company},
      email         = ${body.email        ?? cur.email},
      phone         = ${body.phone        ?? cur.phone},
      service       = ${body.service      ?? cur.service},
      type          = ${body.type         ?? cur.type},
      monthly_value = ${body.monthlyValue ?? cur.monthlyValue},
      project_value = ${body.projectValue ?? cur.projectValue},
      status        = ${body.status       ?? cur.status},
      notes         = ${body.notes        ?? cur.notes},
      ga4_property_id = ${body.ga4PropertyId !== undefined ? body.ga4PropertyId : cur.ga4PropertyId}
    WHERE id = ${body.id}
  `
  const rows = (await sql.query(`${SELECT} WHERE id = $1`, [body.id])) as ClientRow[]
  return NextResponse.json(coerce(rows)[0])
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  await sql`DELETE FROM clients WHERE id = ${id}`
  return NextResponse.json({ ok: true })
}
