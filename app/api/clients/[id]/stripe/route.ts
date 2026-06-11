import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '../../../../lib/stripe'
import { sql } from '../../../../lib/db'
import { guard } from '../../../../lib/handler'

// READ-ONLY Stripe lookup for one client. Never creates charges, invoices, or
// customers — it only reads payment history so the dashboard can show what the
// client has actually paid.
//
// Match order:
//   1. clients.stripe_customer_id if set (explicit link)
//   2. Stripe customer search by the client's email (auto-match; the found id
//      is returned as `suggestedCustomerId` but NOT saved — linking is an
//      explicit PUT /api/clients so the owner stays in control).

type Ctx = { params: Promise<{ id: string }> }

export const GET = guard(async (_req: Request, ctx: Ctx) => {
  if (!stripe) {
    return NextResponse.json({ connected: false, error: 'STRIPE_SECRET_KEY is not set.' })
  }
  const { id } = await ctx.params
  const rows = (await sql.query(
    `SELECT email, stripe_customer_id AS "stripeCustomerId" FROM clients WHERE id = $1`, [id]
  )) as { email: string; stripeCustomerId: string | null }[]
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const client = rows[0]

  // Resolve the Stripe customer.
  let customer: Stripe.Customer | null = null
  let suggested = false
  if (client.stripeCustomerId) {
    try {
      const c = await stripe.customers.retrieve(client.stripeCustomerId)
      if (!c.deleted) customer = c as Stripe.Customer
    } catch { /* stale id — fall through to email match */ }
  }
  if (!customer && client.email) {
    const found = await stripe.customers.list({ email: client.email, limit: 1 })
    if (found.data[0]) { customer = found.data[0]; suggested = !client.stripeCustomerId }
  }
  if (!customer) {
    return NextResponse.json({ connected: true, matched: false })
  }

  // Pull payment history in parallel: subscriptions, invoices, raw charges.
  const [subs, invoices, charges] = await Promise.all([
    stripe.subscriptions.list({ customer: customer.id, status: 'all', limit: 5 }),
    stripe.invoices.list({ customer: customer.id, limit: 12 }),
    stripe.charges.list({ customer: customer.id, limit: 12 }),
  ])

  const activeSub = subs.data.find(s => s.status === 'active' || s.status === 'trialing')
  const firstItem = activeSub?.items.data[0]

  const paidTotal = charges.data
    .filter(c => c.status === 'succeeded' && !c.refunded)
    .reduce((s, c) => s + c.amount, 0) / 100

  const openBalance = invoices.data
    .filter(i => i.status === 'open')
    .reduce((s, i) => s + (i.amount_remaining || 0), 0) / 100

  return NextResponse.json({
    connected: true,
    matched: true,
    suggestedCustomerId: suggested ? customer.id : null,
    customer: { id: customer.id, email: customer.email, name: customer.name },
    subscription: activeSub ? {
      status: activeSub.status,
      amount: (firstItem?.price?.unit_amount || 0) / 100,
      interval: firstItem?.price?.recurring?.interval || 'month',
      currentPeriodEnd: firstItem?.current_period_end
        ? new Date(firstItem.current_period_end * 1000).toISOString() : null,
    } : null,
    totals: { paid: paidTotal, openBalance },
    invoices: invoices.data.map(i => ({
      id: i.id,
      number: i.number,
      status: i.status,
      amountDue: (i.amount_due || 0) / 100,
      amountPaid: (i.amount_paid || 0) / 100,
      date: new Date(i.created * 1000).toISOString().split('T')[0],
      url: i.hosted_invoice_url || null,
    })),
    charges: charges.data.map(c => ({
      id: c.id,
      amount: c.amount / 100,
      status: c.refunded ? 'refunded' : c.status,
      description: c.description || '',
      date: new Date(c.created * 1000).toISOString().split('T')[0],
    })),
  })
})
