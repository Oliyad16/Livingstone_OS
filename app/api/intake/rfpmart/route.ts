import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../../lib/db'
import { safeEqual } from '../../../lib/auth'
import { classifyOpportunity, type RawEmail } from '../../../lib/intake'

// Government-opportunity intake from RFPMart (and similar) emails.
//
// POST: the local fetch script (scripts/fetch-rfpmart.mjs) reads RFPMart mail via
// the gws CLI and posts each email here. We first-pass classify (RFI vs RFP) +
// extract fields, then insert a pending `opportunities` row. Idempotent on
// source_email_id (the dedupe index) so re-fetching never duplicates.
//
// GET: lists intake-sourced opportunities for the triage UI + the verification step.
//
// Auth: like /api/posts/daily, this route is hit by a non-session client (the local
// script / a cron), so it authenticates with CRON_SECRET instead of the session
// cookie. When CRON_SECRET is unset the check is skipped (local/dev convenience).
// proxy.ts exempts /api/intake/* from the session gate for the same reason.

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  return !!token && safeEqual(token, secret)
}

const SELECT = `
  SELECT id, title, sol_no AS "solNo", agency, naics, vehicle, set_aside AS "setAside",
         value, due_date::text AS "dueDate", stage, source, url, notes, extra,
         opp_type AS "oppType", verified, verify_notes AS "verifyNotes",
         source_email_id AS "sourceEmailId", intake_at AS "intakeAt",
         created_at AS "createdAt"
  FROM opportunities
`

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const status = req.nextUrl.searchParams.get('status') // pending | verified | rejected | all
    const ws = 'government'
    // Only intake-sourced rows (have a source_email_id), optionally by verified state.
    const rows = status && status !== 'all'
      ? await sql.query(
          `${SELECT} WHERE workspace = $1 AND source_email_id IS NOT NULL AND verified = $2
           ORDER BY due_date ASC NULLS LAST, created_at DESC`,
          [ws, status]
        )
      : await sql.query(
          `${SELECT} WHERE workspace = $1 AND source_email_id IS NOT NULL
           ORDER BY due_date ASC NULLS LAST, created_at DESC`,
          [ws]
        )
    return NextResponse.json((rows as { value: unknown }[]).map(r => ({ ...r, value: Number(r.value) })))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // No DB yet → empty list so the UI renders its empty state.
    if (message.includes('DATABASE_URL is not set')) return NextResponse.json([])
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const email = (await req.json()) as RawEmail
    if (!email?.sourceEmailId || !email?.subject) {
      return NextResponse.json({ error: 'sourceEmailId and subject are required' }, { status: 400 })
    }

    // Dedupe: skip if this email was already ingested.
    const dupe = (await sql`
      SELECT id FROM opportunities WHERE source_email_id = ${email.sourceEmailId} LIMIT 1
    `) as { id: string }[]
    if (dupe.length) {
      return NextResponse.json({ ok: true, created: false, id: dupe[0].id, reason: 'already ingested' })
    }

    const p = await classifyOpportunity(email)
    const id = Date.now().toString()
    const extra = {
      from: email.from || '',
      receivedAt: email.receivedAt || '',
      links: email.links || [],
      keyDates: p.keyDates || {},
      keyPeople: p.keyPeople || [],
    }
    await sql`
      INSERT INTO opportunities
        (id, title, sol_no, agency, naics, value, due_date, stage, source, url, notes,
         extra, workspace, opp_type, verified, source_email_id, summary)
      VALUES
        (${id}, ${p.title}, ${p.solNo}, ${p.agency}, ${p.naics}, ${p.value},
         ${p.dueDate || null}, 'identified', 'rfpmart', ${p.url}, ${p.notes},
         ${JSON.stringify(extra)}::jsonb, 'government', ${p.oppType}, 'pending', ${email.sourceEmailId}, ${p.summary || ''})
    `
    return NextResponse.json({ ok: true, created: true, id, oppType: p.oppType, title: p.title }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
