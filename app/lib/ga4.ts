import { getAccessToken } from './google'

const DATA_API = 'https://analyticsdata.googleapis.com/v1beta'

type RunReportRow = {
  dimensionValues?: { value: string }[]
  metricValues?: { value: string }[]
}
type RunReportResponse = { rows?: RunReportRow[] }

// AI / generative-engine referrers — the GEO proof signal.
const AI_SOURCES = ['chatgpt', 'openai', 'perplexity', 'gemini', 'claude', 'bing', 'copilot']

// Map a raw GA4 source string to a friendly social-platform name, or null.
function socialPlatform(source: string): string | null {
  const s = source.toLowerCase()
  if (s.includes('facebook') || s === 'fb' || s.includes('fb.com') || s.includes('m.facebook')) return 'Facebook'
  if (s.includes('instagram') || s === 'ig' || s.includes('l.instagram')) return 'Instagram'
  if (s.includes('linkedin') || s.includes('lnkd')) return 'LinkedIn'
  if (s.includes('tiktok')) return 'TikTok'
  if (s.includes('youtube') || s.includes('youtu.be')) return 'YouTube'
  if (s === 'x' || s.includes('twitter') || s === 't.co' || s.includes('x.com')) return 'X (Twitter)'
  if (s.includes('pinterest')) return 'Pinterest'
  if (s.includes('reddit')) return 'Reddit'
  if (s.includes('whatsapp')) return 'WhatsApp'
  if (s.includes('snapchat')) return 'Snapchat'
  if (s.includes('threads')) return 'Threads'
  return null
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// GA4 can return more than one row that collapses to the same label (e.g. a real
// "/" path plus a blank path that we fall back to "/"). Sum the metric across
// collisions so the data is correct and every label is unique downstream.
function sumByLabel<K extends string, V extends string>(
  rows: { label: string; value: number }[],
  labelKey: K,
  valueKey: V,
): (Record<K, string> & Record<V, number>)[] {
  const merged = new Map<string, number>()
  for (const r of rows) merged.set(r.label, (merged.get(r.label) || 0) + r.value)
  return [...merged.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ [labelKey]: label, [valueKey]: value }) as Record<K, string> & Record<V, number>)
}

async function runReport(propertyId: string, body: unknown): Promise<RunReportResponse> {
  const token = await getAccessToken()
  const res = await fetch(`${DATA_API}/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    console.error(`GA4 Data API error (${res.status}):`, await res.text())
    throw new Error('Failed to load GA4 report data.')
  }
  return res.json()
}

async function runRealtimeReport(propertyId: string, body: unknown): Promise<RunReportResponse> {
  const token = await getAccessToken()
  const res = await fetch(`${DATA_API}/properties/${propertyId}:runRealtimeReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    console.error(`GA4 Realtime API error (${res.status}):`, await res.text())
    throw new Error('Failed to load GA4 realtime data.')
  }
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

type Delta = { current: number; prior: number; deltaPct: number | null }

export interface Ga4Report {
  propertyId: string
  range: { start: string; end: string }
  priorRange: { start: string; end: string }
  totals: Record<string, Delta>
  byChannel: { channel: string; sessions: number; conversions: number }[]
  topPages: { path: string; views: number }[]
  // Where visitors ARRIVE: entry pages with engagement quality.
  entryPages: { path: string; sessions: number; bounceRate: number; avgDuration: number }[]
  // Where visitors LEAVE: exit pages (highest drop-off first).
  exitPages: { path: string; exits: number; views: number; exitRate: number }[]
  // What visitors DO: events fired, current vs prior.
  events: { name: string; count: number; prior: number; deltaPct: number | null }[]
  // Where we GAIN / LOSE people.
  audience: {
    newUsers: Delta
    returningUsers: Delta
    bySource: { source: string; sessions: number; prior: number; deltaPct: number | null }[]
  }
  // Who + where + when (the "Audience" deep-dive).
  insights: {
    social: { platform: string; sessions: number }[]
    channels: { channel: string; sessions: number }[]
    devices: { device: string; users: number }[]
    browsers: { browser: string; users: number }[]
    os: { os: string; users: number }[]
    countries: { country: string; users: number }[]
    cities: { city: string; users: number }[]
    byHour: { hour: number; users: number }[]
    byDay: { day: string; users: number }[]
    peakHour: number | null
    peakDay: string | null
  }
  geo: {
    organicSessions: Delta
    aiSessions: Delta
    aiBreakdown: { source: string; sessions: number }[]
  }
}

export interface Ga4Realtime {
  activeUsers: number
  byMinute: { minutesAgo: number; users: number }[]
  topPages: { path: string; users: number }[]
  byDevice: { device: string; users: number }[]
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
  const topPages = sumByLabel(
    (pagesRes.rows || []).map(r => ({
      label: r.dimensionValues?.[0]?.value || '/',
      value: num(r.metricValues?.[0]?.value),
    })),
    'path',
    'views',
  )

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

  // 5. Entry pages (where visitors arrive) with bounce + engagement quality.
  const entryRes = await runReport(propertyId, {
    dateRanges: [{ startDate: start, endDate: end }],
    dimensions: [{ name: 'landingPagePlusQueryString' }],
    metrics: [{ name: 'sessions' }, { name: 'bounceRate' }, { name: 'averageSessionDuration' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 10,
  })
  const entryPages = (entryRes.rows || []).map(r => ({
    path: r.dimensionValues?.[0]?.value || '/',
    sessions: num(r.metricValues?.[0]?.value),
    bounceRate: Math.round(num(r.metricValues?.[1]?.value) * 1000) / 10,
    avgDuration: Math.round(num(r.metricValues?.[2]?.value)),
  }))

  // 6. Drop-off pages (where visitors lose interest). GA4 has no `exits` metric
  // (that was a Universal Analytics concept), so we surface high-traffic pages
  // ranked by bounce rate — the GA4-native signal for "where they stop". We pull
  // by views, then sort by bounce so the worst-performing high-traffic pages rise.
  const exitRes = await runReport(propertyId, {
    dateRanges: [{ startDate: start, endDate: end }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'bounceRate' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 15,
  })
  const exitPages = (exitRes.rows || [])
    .map(r => {
      const views = num(r.metricValues?.[0]?.value)
      const bounce = Math.round(num(r.metricValues?.[1]?.value) * 1000) / 10
      // "exits" proxy: views weighted by bounce — pages where the most people stop.
      return {
        path: r.dimensionValues?.[0]?.value || '/',
        views,
        exits: Math.round(views * (bounce / 100)),
        exitRate: bounce,
      }
    })
    .sort((a, b) => b.exits - a.exits)
    .slice(0, 10)

  // 7. Events (what visitors do), current + prior.
  const eventsRes = await runReport(propertyId, {
    dateRanges: [
      { startDate: start, endDate: end },
      { startDate: priorStart, endDate: priorEnd },
    ],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 25,
  })
  const evCur = new Map<string, number>()
  const evPrior = new Map<string, number>()
  for (const r of eventsRes.rows || []) {
    const name = r.dimensionValues?.[0]?.value || '(unknown)'
    const which = r.dimensionValues?.[1]?.value
    const count = num(r.metricValues?.[0]?.value)
    if (which === 'date_range_1') evPrior.set(name, (evPrior.get(name) || 0) + count)
    else evCur.set(name, (evCur.get(name) || 0) + count)
  }
  const events = [...evCur.entries()]
    .map(([name, count]) => {
      const prior = evPrior.get(name) || 0
      return { name, count, prior, deltaPct: pctDelta(count, prior) }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)

  // 8. New vs returning users (current + prior) — gain/loss of audience.
  const nvrRes = await runReport(propertyId, {
    dateRanges: [
      { startDate: start, endDate: end },
      { startDate: priorStart, endDate: priorEnd },
    ],
    dimensions: [{ name: 'newVsReturning' }],
    metrics: [{ name: 'totalUsers' }],
  })
  let newCur = 0, newPrior = 0, retCur = 0, retPrior = 0
  for (const r of nvrRes.rows || []) {
    const kind = (r.dimensionValues?.[0]?.value || '').toLowerCase()
    const which = r.dimensionValues?.[1]?.value
    const users = num(r.metricValues?.[0]?.value)
    const isCur = which !== 'date_range_1'
    if (kind === 'new') { if (isCur) newCur += users; else newPrior += users }
    else if (kind === 'returning') { if (isCur) retCur += users; else retPrior += users }
  }

  // 9. Sessions by source/medium, current + prior — where we gain/lose traffic.
  const srcDeltaRes = await runReport(propertyId, {
    dateRanges: [
      { startDate: start, endDate: end },
      { startDate: priorStart, endDate: priorEnd },
    ],
    dimensions: [{ name: 'sessionSourceMedium' }],
    metrics: [{ name: 'sessions' }],
  })
  const srcCur = new Map<string, number>()
  const srcPrior = new Map<string, number>()
  for (const r of srcDeltaRes.rows || []) {
    const src = r.dimensionValues?.[0]?.value || '(direct)'
    const which = r.dimensionValues?.[1]?.value
    const sessions = num(r.metricValues?.[0]?.value)
    if (which === 'date_range_1') srcPrior.set(src, (srcPrior.get(src) || 0) + sessions)
    else srcCur.set(src, (srcCur.get(src) || 0) + sessions)
  }
  const allSrc = new Set([...srcCur.keys(), ...srcPrior.keys()])
  const bySource = [...allSrc]
    .map(source => {
      const c = srcCur.get(source) || 0
      const p = srcPrior.get(source) || 0
      return { source, sessions: c, prior: p, deltaPct: pctDelta(c, p) }
    })
    .filter(s => s.sessions > 0 || s.prior > 0)
    .sort((a, b) => Math.abs(b.sessions - b.prior) - Math.abs(a.sessions - a.prior))
    .slice(0, 10)

  // 10. Social platforms + channel mix (where traffic comes from).
  const socialRes = await runReport(propertyId, {
    dateRanges: [{ startDate: start, endDate: end }],
    dimensions: [{ name: 'sessionSource' }],
    metrics: [{ name: 'sessions' }],
    limit: 100,
  })
  const socialMap = new Map<string, number>()
  for (const r of socialRes.rows || []) {
    const plat = socialPlatform(r.dimensionValues?.[0]?.value || '')
    if (plat) socialMap.set(plat, (socialMap.get(plat) || 0) + num(r.metricValues?.[0]?.value))
  }
  const social = [...socialMap.entries()].map(([platform, sessions]) => ({ platform, sessions })).sort((a, b) => b.sessions - a.sessions)
  const channels = byChannel.map(c => ({ channel: c.channel, sessions: c.sessions }))

  // 11. Devices.
  const deviceRes = await runReport(propertyId, {
    dateRanges: [{ startDate: start, endDate: end }],
    dimensions: [{ name: 'deviceCategory' }],
    metrics: [{ name: 'totalUsers' }],
    orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
  })
  const devices = (deviceRes.rows || []).map(r => ({ device: r.dimensionValues?.[0]?.value || '(unknown)', users: num(r.metricValues?.[0]?.value) }))

  // 12. Browsers.
  const browserRes = await runReport(propertyId, {
    dateRanges: [{ startDate: start, endDate: end }],
    dimensions: [{ name: 'browser' }],
    metrics: [{ name: 'totalUsers' }],
    orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
    limit: 6,
  })
  const browsers = (browserRes.rows || []).map(r => ({ browser: r.dimensionValues?.[0]?.value || '(unknown)', users: num(r.metricValues?.[0]?.value) }))

  // 13. Operating systems.
  const osRes = await runReport(propertyId, {
    dateRanges: [{ startDate: start, endDate: end }],
    dimensions: [{ name: 'operatingSystem' }],
    metrics: [{ name: 'totalUsers' }],
    orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
    limit: 6,
  })
  const os = (osRes.rows || []).map(r => ({ os: r.dimensionValues?.[0]?.value || '(unknown)', users: num(r.metricValues?.[0]?.value) }))

  // 14. Locations — country + city.
  const countryRes = await runReport(propertyId, {
    dateRanges: [{ startDate: start, endDate: end }],
    dimensions: [{ name: 'country' }],
    metrics: [{ name: 'totalUsers' }],
    orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
    limit: 8,
  })
  const countries = (countryRes.rows || []).map(r => ({ country: r.dimensionValues?.[0]?.value || '(unknown)', users: num(r.metricValues?.[0]?.value) }))

  const cityRes = await runReport(propertyId, {
    dateRanges: [{ startDate: start, endDate: end }],
    dimensions: [{ name: 'city' }],
    metrics: [{ name: 'totalUsers' }],
    orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
    limit: 8,
  })
  const cities = (cityRes.rows || []).map(r => ({ city: r.dimensionValues?.[0]?.value || '(unknown)', users: num(r.metricValues?.[0]?.value) })).filter(c => c.city !== '(not set)')

  // 15. Peak times — by hour of day and by day of week.
  const hourRes = await runReport(propertyId, {
    dateRanges: [{ startDate: start, endDate: end }],
    dimensions: [{ name: 'hour' }],
    metrics: [{ name: 'activeUsers' }],
  })
  const byHour = (hourRes.rows || []).map(r => ({ hour: Number(r.dimensionValues?.[0]?.value ?? 0), users: num(r.metricValues?.[0]?.value) })).sort((a, b) => a.hour - b.hour)
  const peakHour = byHour.length ? byHour.reduce((m, x) => (x.users > m.users ? x : m), byHour[0]).hour : null

  const dowRes = await runReport(propertyId, {
    dateRanges: [{ startDate: start, endDate: end }],
    dimensions: [{ name: 'dayOfWeek' }],
    metrics: [{ name: 'activeUsers' }],
  })
  const dayMap = new Map<number, number>()
  for (const r of dowRes.rows || []) dayMap.set(Number(r.dimensionValues?.[0]?.value ?? 0), num(r.metricValues?.[0]?.value))
  const byDay = DAY_NAMES.map((day, i) => ({ day, users: dayMap.get(i) || 0 }))
  const peakDay = byDay.length ? byDay.reduce((m, x) => (x.users > m.users ? x : m), byDay[0]).day : null

  return {
    propertyId,
    range: { start, end },
    priorRange: { start: priorStart, end: priorEnd },
    totals,
    byChannel,
    topPages,
    entryPages,
    exitPages,
    events,
    audience: {
      newUsers: { current: newCur, prior: newPrior, deltaPct: pctDelta(newCur, newPrior) },
      returningUsers: { current: retCur, prior: retPrior, deltaPct: pctDelta(retCur, retPrior) },
      bySource,
    },
    insights: {
      social, channels, devices, browsers, os, countries, cities, byHour, byDay, peakHour, peakDay,
    },
    geo: {
      organicSessions: { current: organicCur, prior: organicPrior, deltaPct: pctDelta(organicCur, organicPrior) },
      aiSessions: { current: aiCur, prior: aiPrior, deltaPct: pctDelta(aiCur, aiPrior) },
      aiBreakdown,
    },
  }
}

/** Live "right now" snapshot from GA4's Realtime API (last 30 minutes). */
export async function fetchGa4Realtime(propertyId: string): Promise<Ga4Realtime> {
  // Active users total + per-minute (last 30 min) in one call.
  const minuteRes = await runRealtimeReport(propertyId, {
    dimensions: [{ name: 'minutesAgo' }],
    metrics: [{ name: 'activeUsers' }],
  })
  const byMinute: { minutesAgo: number; users: number }[] = []
  let activeUsers = 0
  for (const r of minuteRes.rows || []) {
    const m = Number(r.dimensionValues?.[0]?.value ?? -1)
    const u = num(r.metricValues?.[0]?.value)
    if (m >= 0) byMinute.push({ minutesAgo: m, users: u })
    activeUsers += u
  }
  byMinute.sort((a, b) => b.minutesAgo - a.minutesAgo)

  const pagesRes = await runRealtimeReport(propertyId, {
    dimensions: [{ name: 'unifiedScreenName' }],
    metrics: [{ name: 'activeUsers' }],
    orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
    limit: 8,
  })
  const topPages = sumByLabel(
    (pagesRes.rows || []).map(r => ({
      label: r.dimensionValues?.[0]?.value || '(not set)',
      value: num(r.metricValues?.[0]?.value),
    })),
    'path',
    'users',
  )

  const deviceRes = await runRealtimeReport(propertyId, {
    dimensions: [{ name: 'deviceCategory' }],
    metrics: [{ name: 'activeUsers' }],
  })
  const byDevice = (deviceRes.rows || []).map(r => ({
    device: r.dimensionValues?.[0]?.value || '(unknown)',
    users: num(r.metricValues?.[0]?.value),
  }))

  return { activeUsers, byMinute, topPages, byDevice }
}
