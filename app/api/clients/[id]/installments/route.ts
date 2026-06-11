import { NextResponse } from 'next/server'
import { sql } from '../../../../lib/db'
import { guard, coerceNums } from '../../../../lib/handler'

const SELECT = `
  SELECT id,
         client_id          AS "clientId",
         label, amount, status, notes,
         due_date           AS "dueDate",
         paid_at            AS "paidAt",
         stripe_invoice_id  AS "stripeInvoiceId",
         created_at         AS "createdAt"
  FROM client_installments
`

type Row = { amount: string | number; [k: string]: unknown }
const coerce = (rows: Row[]) => coerceNums(rows, ['amount'])

type Ctx = { params: Promise<{ id: string }> }

// List a client's payment schedule, soonest due first (no-date rows last).
export const GET = guard(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params
  const rows = (await sql.query(
    `${SELECT} WHERE client_id = $1 ORDER BY due_date ASC NULLS LAST, created_at ASC`,
    [id]
  )) as Row[]
  return NextResponse.json(coerce(rows))
})

// Add one installment, or — with {installments: [...]} — replace-none bulk add
// (used by the "generate schedule" helper in the UI).
export const POST = guard(async (req: Request, ctx: Ctx) => {
  const { id: clientId } = await ctx.params
  const body = await req.json()
  const items = Array.isArray(body.installments) ? body.installments : [body]

  const created: Row[] = []
  let seq = 0
  for (const item of items) {
    if (item.amount === undefined || item.amount === null || isNaN(Number(item.amount))) {
      return NextResponse.json({ error: 'amount is required' }, { status: 400 })
    }
    const id = `${Date.now()}-${seq++}`
    await sql`
      INSERT INTO client_installments (id, client_id, label, amount, due_date, status, notes)
      VALUES (${id}, ${clientId}, ${item.label || ''}, ${Number(item.amount)},
              ${item.dueDate || null}, ${item.status === 'paid' ? 'paid' : 'pending'},
              ${item.notes || ''})
    `
    const rows = (await sql.query(`${SELECT} WHERE id = $1`, [id])) as Row[]
    created.push(coerce(rows)[0])
  }
  return NextResponse.json(items.length === 1 ? created[0] : created, { status: 201 })
})

// Update an installment (edit fields, mark paid/unpaid). Marking paid stamps
// paid_at; un-marking clears it.
export const PUT = guard(async (req: Request, ctx: Ctx) => {
  const { id: clientId } = await ctx.params
  const body = await req.json()
  const existing = (await sql.query(
    `${SELECT} WHERE id = $1 AND client_id = $2`, [body.id, clientId]
  )) as Row[]
  if (existing.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const cur = existing[0]

  const status = body.status ?? cur.status
  const paidAt = status === 'paid'
    ? (cur.status === 'paid' ? cur.paidAt : new Date().toISOString())
    : null

  await sql`
    UPDATE client_installments SET
      label    = ${body.label  ?? cur.label},
      amount   = ${body.amount ?? cur.amount},
      due_date = ${body.dueDate !== undefined ? body.dueDate : cur.dueDate},
      status   = ${status},
      paid_at  = ${paidAt},
      notes    = ${body.notes ?? cur.notes}
    WHERE id = ${body.id}
  `
  const rows = (await sql.query(`${SELECT} WHERE id = $1`, [body.id])) as Row[]
  return NextResponse.json(coerce(rows)[0])
})

export const DELETE = guard(async (req: Request, ctx: Ctx) => {
  const { id: clientId } = await ctx.params
  const { id } = await req.json()
  await sql`DELETE FROM client_installments WHERE id = ${id} AND client_id = ${clientId}`
  return NextResponse.json({ ok: true })
})
