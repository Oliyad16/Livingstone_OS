import { NextResponse } from 'next/server'
import { sql } from '../../../lib/db'
import { safe, workspaceOf } from '../../../lib/handler'

const STALE_DAYS = 3

type Row = {
  id: string; name: string; company: string; email: string; phone: string
  source: string; status: string; service: string; notes: string
  touchpoints: { type: string; notes: string; date: string }[]
  createdAt: string; lastContactedAt: string | null
  lastActivity: string; daysSince: number
}

export const GET = safe(async (req) => {
  const ws = workspaceOf(req)
  // "Last activity" = most recent touchpoint date, else created_at.
  // Stale = active (not closed/lost) and no activity for STALE_DAYS+ days.
  const rows = (await sql.query(
    `
    SELECT id, name, company, email, phone, source, status, service, notes, touchpoints,
           created_at AS "createdAt",
           last_contacted_at AS "lastContactedAt",
           COALESCE(last_contacted_at, created_at) AS "lastActivity",
           FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(last_contacted_at, created_at))) / 86400)::int AS "daysSince"
    FROM leads
    WHERE status NOT IN ('closed', 'lost')
      AND workspace = $2
      AND COALESCE(last_contacted_at, created_at) <= now() - ($1 || ' days')::interval
    ORDER BY COALESCE(last_contacted_at, created_at) ASC
    `,
    [STALE_DAYS, ws]
  )) as Row[]

  return NextResponse.json({ staleDays: STALE_DAYS, count: rows.length, leads: rows })
}, { staleDays: STALE_DAYS, count: 0, leads: [] })
