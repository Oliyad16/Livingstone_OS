import { NextRequest, NextResponse } from 'next/server'
import { listTabs, readSheet } from '../../../lib/sheets'

// POST { spreadsheetId } → { tabs, headers } for the first tab, to drive the mapping UI.
export async function POST(req: NextRequest) {
  const { spreadsheetId, tab } = await req.json()
  if (!spreadsheetId) return NextResponse.json({ error: 'spreadsheetId required' }, { status: 400 })

  try {
    const tabs = await listTabs(spreadsheetId)
    const targetTab = tab || tabs[0]
    const rows = targetTab ? await readSheet(spreadsheetId, targetTab) : []
    const headers = rows[0] || []
    return NextResponse.json({ tabs, tab: targetTab, headers })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
