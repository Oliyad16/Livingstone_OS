import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../../lib/db'
import { buildDraft, type DraftLead } from '../../../lib/draft'
import { guard } from '../../../lib/handler'

export const POST = guard(async (req: NextRequest) => {
  const { leadId } = await req.json()
  const rows = (await sql.query(
    `SELECT name, company, email, service, source, status, touchpoints
     FROM leads WHERE id = $1`,
    [leadId]
  )) as (DraftLead & { email?: string })[]
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const lead = rows[0]
  const draft = buildDraft(lead)
  return NextResponse.json({ ...draft, email: lead.email || '' })
})
