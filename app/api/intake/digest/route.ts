import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../../lib/db'
import { safeEqual } from '../../../lib/auth'

// Owner-notify digest. Summarizes the current intake state (new verified RFPs,
// RFIs, pending, rejected) and enqueues ONE email to OWNER_EMAIL via email_outbox.
// The local `npm run send-outbox` then sends it through Gmail (gws) — same path as
// follow-up emails. No schema change: email_outbox already allows a null lead_id.
//
// POST: build + enqueue the digest. Called after a verification run (by the script
// or manually). Auth: CRON_SECRET bearer like the other intake routes.

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  return !!token && safeEqual(token, secret)
}

interface OppRow {
  title: string; agency: string; oppType: string; verified: string
  dueDate: string | null; url: string; value: string | number
}

function line(o: OppRow): string {
  const due = o.dueDate ? ` · due ${o.dueDate}` : ''
  const val = Number(o.value) > 0 ? ` · $${Number(o.value).toLocaleString()}` : ''
  const ag = o.agency ? ` (${o.agency})` : ''
  const link = o.url ? `\n   ${o.url}` : ''
  return ` • ${o.title}${ag}${due}${val}${link}`
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const owner = process.env.OWNER_EMAIL
    if (!owner) {
      return NextResponse.json({ error: 'OWNER_EMAIL is not set' }, { status: 400 })
    }

    const rows = (await sql`
      SELECT title, agency, opp_type AS "oppType", verified,
             due_date::text AS "dueDate", url, value
      FROM opportunities
      WHERE workspace = 'government' AND source_email_id IS NOT NULL
      ORDER BY due_date ASC NULLS LAST, created_at DESC
    `) as OppRow[]

    const verifiedRfp = rows.filter(r => r.verified === 'verified' && r.oppType === 'RFP')
    const verifiedRfi = rows.filter(r => r.verified === 'verified' && r.oppType === 'RFI')
    const pending = rows.filter(r => r.verified === 'pending')
    const rejected = rows.filter(r => r.verified === 'rejected')

    const today = new Date().toISOString().split('T')[0]
    const subject = `Gov intake digest — ${verifiedRfp.length} RFP · ${verifiedRfi.length} RFI · ${pending.length} pending (${today})`

    const sections: string[] = []
    sections.push(`Government opportunity intake — ${today}\n`)
    if (verifiedRfp.length) sections.push(`VERIFIED RFPs (bid candidates) — ${verifiedRfp.length}\n${verifiedRfp.map(line).join('\n')}`)
    if (verifiedRfi.length) sections.push(`VERIFIED RFIs (shape/influence) — ${verifiedRfi.length}\n${verifiedRfi.map(line).join('\n')}`)
    if (pending.length) sections.push(`PENDING VERIFICATION — ${pending.length}\n${pending.map(line).join('\n')}`)
    if (rejected.length) sections.push(`REJECTED (not real / past due) — ${rejected.length}`)
    sections.push(`\nOpen the Intake tab in the Government workspace to triage.`)
    const body = sections.join('\n\n')

    const id = Date.now().toString()
    await sql`
      INSERT INTO email_outbox (id, lead_id, to_email, subject, body, status)
      VALUES (${id}, ${null}, ${owner}, ${subject}, ${body}, 'queued')
    `
    return NextResponse.json({
      ok: true,
      queued: true,
      to: owner,
      counts: { verifiedRfp: verifiedRfp.length, verifiedRfi: verifiedRfi.length, pending: pending.length, rejected: rejected.length },
    }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
