import { NextResponse } from 'next/server'
import { sql } from '../../../lib/db'
import { guard, coerceNums } from '../../../lib/handler'

const SELECT = `
  SELECT id, name, company, email, phone, service, type, status, notes,
         monthly_value AS "monthlyValue",
         project_value AS "projectValue",
         start_date    AS "startDate",
         ga4_property_id AS "ga4PropertyId",
         created_at    AS "createdAt"
  FROM clients
`

type Row = { monthlyValue: string | number; projectValue: string | number; [k: string]: unknown }

export const GET = guard(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const rows = (await sql.query(`${SELECT} WHERE id = $1`, [id])) as Row[]
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(coerceNums(rows, ['monthlyValue', 'projectValue'])[0])
})
