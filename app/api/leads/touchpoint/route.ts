import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../../lib/db'
import { guard } from '../../../lib/handler'

const SELECT = `
  SELECT id, name, company, email, phone, source, status, service, notes,
         touchpoints,
         created_at AS "createdAt",
         last_contacted_at AS "lastContactedAt"
  FROM leads
`

export const POST = guard(async (req: NextRequest) => {
  const { leadId, type, notes } = await req.json()
  const date = new Date().toISOString()
  const touchpoint = { type, notes: notes || '', date }

  const updated = await sql`
    UPDATE leads
    SET touchpoints = COALESCE(touchpoints, '[]'::jsonb) || ${JSON.stringify(touchpoint)}::jsonb,
        last_contacted_at = ${date}
    WHERE id = ${leadId}
    RETURNING id
  `
  if (updated.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const rows = await sql.query(`${SELECT} WHERE id = $1`, [leadId])
  return NextResponse.json(rows[0])
})
