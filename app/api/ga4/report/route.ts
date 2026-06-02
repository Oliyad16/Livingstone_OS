import { NextRequest, NextResponse } from 'next/server'
import { fetchGa4Report } from '../../../lib/ga4'
import { sql } from '../../../lib/db'

// Days → date strings, computed server-side so client tz doesn't skew it.
function ranges(days: number) {
  const dayMs = 86_400_000
  const today = new Date()
  const end = new Date(today.getTime() - dayMs) // GA4 data lags ~1 day
  const start = new Date(end.getTime() - (days - 1) * dayMs)
  const priorEnd = new Date(start.getTime() - dayMs)
  const priorStart = new Date(priorEnd.getTime() - (days - 1) * dayMs)
  const iso = (d: Date) => d.toISOString().split('T')[0]
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
