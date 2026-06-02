import { NextResponse } from 'next/server'
import { stripe } from '../../../lib/stripe'
import { sql } from '../../../lib/db'

export async function POST() {
  if (!stripe) {
    return NextResponse.json(
      { error: 'STRIPE_SECRET_KEY is not set. Add it to .env.local.' },
      { status: 400 }
    )
  }

  let synced = 0
  let hasMore = true
  let startingAfter: string | undefined

  while (hasMore) {
    const page = await stripe.charges.list({ limit: 100, starting_after: startingAfter })

    for (const charge of page.data) {
      if (charge.status !== 'succeeded' || charge.refunded) continue

      const amount = charge.amount / 100
      const date = new Date(charge.created * 1000).toISOString().split('T')[0]
      const label =
        charge.description ||
        charge.billing_details?.name ||
        charge.receipt_email ||
        'Stripe payment'

      await sql`
        INSERT INTO financials (id, kind, amount, label, date, source, ext_id)
        VALUES (${charge.id}, 'revenue', ${amount}, ${label}, ${date}, 'stripe', ${charge.id})
        ON CONFLICT (source, ext_id) WHERE ext_id IS NOT NULL
        DO UPDATE SET amount = EXCLUDED.amount, label = EXCLUDED.label, date = EXCLUDED.date
      `
      synced++
    }

    hasMore = page.has_more
    startingAfter = page.data[page.data.length - 1]?.id
  }

  return NextResponse.json({ ok: true, synced })
}
