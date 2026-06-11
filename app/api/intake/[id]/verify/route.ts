import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../../../lib/db'
import { safeEqual } from '../../../../lib/auth'

// Write-back for the verification + research step. The authoritative research
// (SAM.gov cross-check, web search of agency+title, link/sender validation,
// future-due-date check) happens in-session (Claude + web); this endpoint persists
// the verdict + enriched fields onto the intake opportunity row.
//
// PUT body (all optional except verified):
//   verified: 'verified' | 'rejected'
//   oppType, agency, naics, setAside, vehicle, value, dueDate, url, verifyNotes, stage
//
// Auth: CRON_SECRET bearer (non-session client), matching the other intake routes.
// Note: params is a Promise in Next 16 — it must be awaited.

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  return !!token && safeEqual(token, secret)
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { id } = await ctx.params
    const b = await req.json()

    const existing = (await sql`SELECT id, extra FROM opportunities WHERE id = ${id}`) as { id: string; extra: unknown }[]
    if (existing.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const verified = b.verified === 'verified' || b.verified === 'rejected' ? b.verified : 'verified'

    // COALESCE on the SQL side: only overwrite a field when the caller supplied it.
    await sql`
      UPDATE opportunities SET
        verified     = ${verified},
        verify_notes = COALESCE(${b.verifyNotes ?? null}, verify_notes),
        opp_type     = COALESCE(${b.oppType ?? null}, opp_type),
        agency       = COALESCE(${b.agency ?? null}, agency),
        naics        = COALESCE(${b.naics ?? null}, naics),
        set_aside    = COALESCE(${b.setAside ?? null}, set_aside),
        vehicle      = COALESCE(${b.vehicle ?? null}, vehicle),
        value        = COALESCE(${b.value ?? null}, value),
        due_date     = COALESCE(${b.dueDate ?? null}, due_date),
        url          = COALESCE(${b.url ?? null}, url),
        stage        = COALESCE(${b.stage ?? null}, stage),
        intake_at    = now()
      WHERE id = ${id}
    `

    const rows = (await sql`
      SELECT id, title, sol_no AS "solNo", agency, naics, vehicle, set_aside AS "setAside",
             value, due_date::text AS "dueDate", stage, source, url, notes,
             opp_type AS "oppType", verified, verify_notes AS "verifyNotes",
             source_email_id AS "sourceEmailId", intake_at AS "intakeAt"
      FROM opportunities WHERE id = ${id}
    `) as { value: unknown }[]
    const row = rows[0] ? { ...rows[0], value: Number(rows[0].value) } : null
    return NextResponse.json(row)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
