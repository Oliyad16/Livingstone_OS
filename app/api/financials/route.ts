import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../lib/db'
import { safe, workspaceOf } from '../../lib/handler'

type Row = { id: string; amount: string; label: string; date: string; source: string }

export const GET = safe(async (req) => {
  // Every workspace shows only its own financials. Stripe income is tagged
  // 'private' (private-side clients pay through Stripe), so it appears under
  // Private only — not duplicated into the Client or Government views.
  const ws = workspaceOf(req)
  const revenueRows = (await sql`
    SELECT id, amount, label, date::text AS date, source
    FROM financials WHERE kind = 'revenue' AND workspace = ${ws} ORDER BY date DESC
  `) as Row[]
  const expenseRows = (await sql`
    SELECT id, amount, label, date::text AS date, source
    FROM financials WHERE kind = 'expense' AND workspace = ${ws} ORDER BY date DESC
  `) as Row[]

  return NextResponse.json({
    revenue: revenueRows.map(r => ({ ...r, amount: Number(r.amount) })),
    expenses: expenseRows.map(r => ({ ...r, amount: Number(r.amount) })),
  })
}, { revenue: [], expenses: [] })

export async function POST(req: NextRequest) {
  const body = await req.json()
  const ws = body.workspace === 'government' ? 'government' : 'private'
  const id = Date.now().toString()
  const kind = body.kind === 'expense' ? 'expense' : 'revenue'
  const date = body.date || new Date().toISOString().split('T')[0]

  await sql`
    INSERT INTO financials (id, kind, amount, label, date, source, workspace)
    VALUES (${id}, ${kind}, ${body.amount}, ${body.label || ''}, ${date}, 'manual', ${ws})
  `
  return NextResponse.json(
    { id, kind, amount: Number(body.amount), label: body.label || '', date },
    { status: 201 }
  )
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  await sql`DELETE FROM financials WHERE id = ${id}`
  return NextResponse.json({ ok: true })
}
