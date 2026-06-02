import { getAccessToken } from './google'

const DATA_API = 'https://analyticsdata.googleapis.com/v1beta'

type RunReportRow = {
  dimensionValues?: { value: string }[]
  metricValues?: { value: string }[]
}
type RunReportResponse = { rows?: RunReportRow[] }

// AI / generative-engine referrers — the GEO proof signal.
const AI_SOURCES = ['chatgpt', 'openai', 'perplexity', 'gemini', 'claude', 'bing', 'copilot']

async function runReport(propertyId: string, body: unknown): Promise<RunReportResponse> {
  const token = await getAccessToken()
  const res = await fetch(`${DATA_API}/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`GA4 Data API: ${await res.text()}`)
  return res.json()
}

const TOTALS_METRICS = [
  { name: 'sessions' },
  { name: 'totalUsers' },
  { name: 'newUsers' },
  { name: 'conversions' },
  { name: 'engagementRate' },
  { name: 'averageSessionDuration' },
]

function num(v?: string) {
  return v ? Number(v) : 0
}

function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null // null = "new / no prior baseline"
  return Math.round(((curr - prev) / prev) * 1000) / 10
}

export interface Ga4Report {
  propertyId: string
  range: { start: string; end: string }
  priorRange: { start: string; end: string }
  totals: Record<string, { current: number; prior: number; deltaPct: number | null }>
  byChannel: { channel: string; sessions: number; conversions: number }[]
  topPages: { path: string; views: number }[]
  geo: {
    organicSessions: { current: number; prior: number; deltaPct: number | null }
    aiSessions: { current: number; prior: number; deltaPct: number | null }
    aiBreakdown: { source: string; sessions: number }[]
  }
}

export async function fetchGa4Report(
  propertyId: string,
  start: string,
  end: string,
  priorStart: string,
  priorEnd: string
): Promise<Ga4Report> {
  // 1. Totals for current + prior range (two date ranges in one call).
  const totalsRes = await runReport(propertyId, {
    dateRanges: [
      { startDate: start, endDate: end },
      { startDate: priorStart, endDate: priorEnd },
    ],
    metrics: TOTALS_METRICS,
  })
  // With two date ranges GA4 returns a dateRange dimension; rows[0]=current, [1]=prior.
  const curRow = totalsRes.rows?.find(r => r.dimensionValues?.[0]?.value === 'date_range_0') || totalsRes.rows?.[0]
  const priorRow = totalsRes.rows?.find(r => r.dimensionValues?.[0]?.value === 'date_range_1') || totalsRes.rows?.[1]

  const totals: Ga4Report['totals'] = {}
  TOTALS_METRICS.forEach((m, i) => {
    const c = num(curRow?.metricValues?.[i]?.value)
    const p = num(priorRow?.metricValues?.[i]?.value)
    totals[m.name] = { current: c, prior: p, deltaPct: pctDelta(c, p) }
  })

  // 2. Sessions + conversions by default channel group.
  const channelRes = await runReport(propertyId, {
    dateRanges: [{ startDate: start, endDate: end }],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [{ name: 'sessions' }, { name: 'conversions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
  })
  const byChannel = (channelRes.rows || []).map(r => ({
    channel: r.dimensionValues?.[0]?.value || '(unknown)',
    sessions: num(r.metricValues?.[0]?.value),
    conversions: num(r.metricValues?.[1]?.value),
  }))

  // 3. Top pages.
  const pagesRes = await runReport(propertyId, {
    dateRanges: [{ startDate: start, endDate: end }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 10,
  })
  const topPages = (pagesRes.rows || []).map(r => ({
    path: r.dimensionValues?.[0]?.value || '/',
    views: num(r.metricValues?.[0]?.value),
  }))

  // 4. GEO lens — sessions by source, current + prior, to isolate organic + AI referrers.
  const sourceRes = await runReport(propertyId, {
    dateRanges: [
      { startDate: start, endDate: end },
      { startDate: priorStart, endDate: priorEnd },
    ],
    dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
    metrics: [{ name: 'sessions' }],
  })

  let organicCur = 0, organicPrior = 0, aiCur = 0, aiPrior = 0
  const aiMap = new Map<string, number>()
  for (const r of sourceRes.rows || []) {
    const which = r.dimensionValues?.[2]?.value // date_range dim is appended last
    const source = (r.dimensionValues?.[0]?.value || '').toLowerCase()
    const medium = (r.dimensionValues?.[1]?.value || '').toLowerCase()
    const sessions = num(r.metricValues?.[0]?.value)
    const isCurrent = which === 'date_range_0' || which === undefined
    const isOrganic = medium === 'organic'
    const isAi = AI_SOURCES.some(s => source.includes(s))

    if (isOrganic) {
      if (isCurrent) organicCur += sessions
      else organicPrior += sessions
    }
    if (isAi) {
      if (isCurrent) {
        aiCur += sessions
        aiMap.set(source, (aiMap.get(source) || 0) + sessions)
      } else {
        aiPrior += sessions
      }
    }
  }

  const aiBreakdown = [...aiMap.entries()]
    .map(([source, sessions]) => ({ source, sessions }))
    .sort((a, b) => b.sessions - a.sessions)

  return {
    propertyId,
    range: { start, end },
    priorRange: { start: priorStart, end: priorEnd },
    totals,
    byChannel,
    topPages,
    geo: {
      organicSessions: { current: organicCur, prior: organicPrior, deltaPct: pctDelta(organicCur, organicPrior) },
      aiSessions: { current: aiCur, prior: aiPrior, deltaPct: pctDelta(aiCur, aiPrior) },
      aiBreakdown,
    },
  }
}
