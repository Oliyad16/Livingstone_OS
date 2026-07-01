import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../../../lib/db'
import { safeEqual, isValidSession, SESSION_COOKIE } from '../../../../lib/auth'
import { enrichFromText } from '../../../../lib/enrich'

// Enrichment sub-agent endpoint. Reads what we know about an opportunity (its
// stored fields + notes + any solicitation-doc text passed in), asks Claude for a
// summary, key dates, key people (with emails), and a budget estimate, then writes
// the result back onto the opportunity. The deal-room "Enrich with AI" button calls
// this; the local sync-drive --enrich also calls it (passing extracted doc text).
//
// Auth: proxy.ts exempts this route, so it self-guards here. Accept EITHER a valid
// session cookie (the browser button) OR a CRON_SECRET bearer (the local script).
// If DASHBOARD_PASSWORD is unset the gate is open (local/dev). Next 16: await params.

function authorized(req: NextRequest): boolean {
  const password = process.env.DASHBOARD_PASSWORD
  if (!password) return true // gate disabled on a fresh/local install
  if (isValidSession(req.cookies.get(SESSION_COOKIE)?.value, password)) return true
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (token && safeEqual(token, secret)) return true
  }
  return false
}

interface OppRow {
  id: string; title: string; agency: string; sol_no: string; naics: string
  vehicle: string; set_aside: string; value: string | number; due_date: string | null
  url: string; notes: string; summary: string; opp_type: string; extra: Record<string, unknown>
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const docText: string = typeof body.docText === 'string' ? body.docText : ''

    const rows = (await sql`
      SELECT id, title, agency, sol_no, naics, vehicle, set_aside, value, due_date::text AS due_date,
             url, notes, summary, opp_type, extra
      FROM opportunities WHERE id = ${id}
    `) as OppRow[]
    if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const o = rows[0]

    // Build the text the agent reasons over: the doc if provided, else the known
    // fields + notes (still useful for summary/budget even without the full PDF).
    const context = [
      `Title: ${o.title}`,
      `Agency: ${o.agency}`,
      o.sol_no && `Solicitation #: ${o.sol_no}`,
      o.naics && `NAICS: ${o.naics}`,
      o.set_aside && `Set-aside: ${o.set_aside}`,
      o.due_date && `Response due: ${o.due_date}`,
      o.opp_type && `Type: ${o.opp_type}`,
      o.value && Number(o.value) > 0 && `Known value: $${Number(o.value).toLocaleString()}`,
    ].filter(Boolean).join('\n')
    const text = docText || o.notes || o.summary || o.title

    const e = await enrichFromText(text, context)

    // Merge into extra (preserve existing keys), record budget basis/range.
    const extra = {
      ...(o.extra || {}),
      keyDates: { ...((o.extra?.keyDates as object) || {}), ...e.keyDates },
      keyPeople: e.keyPeople.length ? e.keyPeople : (o.extra?.keyPeople || []),
      budgetBasis: e.budget.basis,
      budgetLow: e.budget.low,
      budgetHigh: e.budget.high,
      budgetRationale: e.budget.rationale,
      // Merge submission requirements: keep any field the user has already filled
      // in by hand, fill the rest from what the agent read out of the RFP.
      submission: { ...((o.extra?.submission as object) || {}), ...e.submission },
      fit: e.fit || o.extra?.fit || '',
    }
    // Only overwrite the value when the agent produced a real number; keep a
    // disclosed value if we already had one and the agent only estimated.
    const newValue = e.budget.amount > 0 ? e.budget.amount : Number(o.value) || 0
    const newSummary = e.summary || o.summary || ''

    await sql`
      UPDATE opportunities
      SET summary = ${newSummary},
          value   = ${newValue},
          extra   = ${JSON.stringify(extra)}::jsonb,
          intake_at = now()
      WHERE id = ${id}
    `

    return NextResponse.json({
      ok: true, id,
      summary: newSummary,
      value: newValue,
      budgetBasis: e.budget.basis,
      keyPeople: extra.keyPeople,
      keyDates: extra.keyDates,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
