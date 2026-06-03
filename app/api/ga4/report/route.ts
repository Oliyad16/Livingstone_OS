import { NextRequest, NextResponse } from 'next/server'
import { fetchGa4Report } from '../../../lib/ga4'
import { sql } from '../../../lib/db'

// Days → date strings. Anchor on UTC midnight so the arithmetic and the
// .toISOString() formatting agree regardless of the server's local timezone
// (mixing local-tz Date math with UTC ISO output caused an off-by-one day).
function ranges(days: number) {
  const dayMs = 86_400_000
  const now = new Date()
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const end = todayUTC - dayMs // GA4 data lags ~1 day
  const start = end - (days - 1) * dayMs
  const priorEnd = start - dayMs
  const priorStart = priorEnd - (days - 1) * dayMs
  const iso = (ms: number) => new Date(ms).toISOString().split('T')[0]
  return { start: iso(start), end: iso(end), priorStart: iso(priorStart), priorEnd: iso(priorEnd) }
}

export async function POST(req: NextRequest) {
  const { propertyId, propertyName, days = 28, save = false } = await req.json()
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 })

  const r = ranges(Number(days))
  const report = await fetchGa4Report(propertyId, r.start, r.end, r.priorStart, r.priorEnd)

  if (save) {
    const id = `${propertyId}-${Date.now()}`
    await sql`
      INSERT INTO ga4_snapshots (id, property_id, property_name, range_start, range_end, metrics)
      VALUES (${id}, ${propertyId}, ${propertyName || ''}, ${r.start}, ${r.end}, ${JSON.stringify(report)}::jsonb)
    `
  }

  return NextResponse.json(report)
}
