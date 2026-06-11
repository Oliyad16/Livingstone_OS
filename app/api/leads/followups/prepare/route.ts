import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../../../lib/db'
import { buildDraft, type DraftLead } from '../../../../lib/draft'
import { safeEqual } from '../../../../lib/auth'

const STALE_DAYS = 3

// Lead follow-up engine, step 1: AUTO-DRAFT.
// For every stale lead (active, no contact in STALE_DAYS+, has an email),
// write a follow-up draft into email_outbox with status 'draft' — the human
// approval gate. Nothing sends until the owner approves it to 'queued' on the
// Follow-ups page; the local send-outbox script only ever sends 'queued'.
//
// Idempotent: a lead with an existing 'draft' or 'queued' outbox row is
// skipped, so running this hourly/daily never double-drafts.
//
// Auth mirrors /api/posts/daily: exempt from the session gate in proxy.ts,
// authenticates with `Authorization: Bearer <CRON_SECRET>` (Vercel Cron / local
// cron). When CRON_SECRET is unset the check is skipped (local/dev).
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (!token || !safeEqual(token, secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const ws = req.nextUrl.searchParams.get('workspace') === 'government' ? 'government' : 'private'

  type LeadRow = DraftLead & { id: string; email: string }
  const stale = (await sql.query(
    `
    SELECT id, name, company, email, service, source, status, touchpoints
    FROM leads
    WHERE status NOT IN ('closed', 'lost')
      AND workspace = $2
      AND email <> ''
      AND COALESCE(last_contacted_at, created_at) <= now() - ($1 || ' days')::interval
      AND id NOT IN (
        SELECT lead_id FROM email_outbox
        WHERE lead_id IS NOT NULL AND status IN ('draft', 'queued')
      )
    ORDER BY COALESCE(last_contacted_at, created_at) ASC
    `,
    [STALE_DAYS, ws]
  )) as LeadRow[]

  let prepared = 0
  for (const lead of stale) {
    const { subject, body } = buildDraft(lead)
    await sql`
      INSERT INTO email_outbox (id, lead_id, to_email, subject, body, status)
      VALUES (${`${Date.now()}-${prepared}`}, ${lead.id}, ${lead.email}, ${subject}, ${body}, 'draft')
    `
    prepared++
  }

  return NextResponse.json({ ok: true, staleDays: STALE_DAYS, prepared, workspace: ws })
}
