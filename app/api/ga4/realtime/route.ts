import { NextRequest, NextResponse } from 'next/server'
import { fetchGa4Realtime } from '../../../lib/ga4'

// Live "active now" snapshot (GA4 Realtime API, last 30 minutes).
export async function GET(req: NextRequest) {
  const propertyId = req.nextUrl.searchParams.get('propertyId')
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 })
  try {
    const data = await fetchGa4Realtime(propertyId)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Realtime fetch failed' },
      { status: 502 },
    )
  }
}
