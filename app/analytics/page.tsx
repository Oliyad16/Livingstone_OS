'use client'
import { useEffect, useRef, useState } from 'react'
import { ChartFrame } from '../components/charts/ChartFrame'
import { DonutChart, ChartLegend, BarSeries, HourBars } from '../components/charts/Charts'
import { SERIES_COLORS } from '../components/charts/theme'

interface Property { id: string; name: string; account: string }
interface Delta { current: number; prior: number; deltaPct: number | null }
interface Report {
  range: { start: string; end: string }
  priorRange: { start: string; end: string }
  totals: Record<string, Delta>
  byChannel: { channel: string; sessions: number; conversions: number }[]
  topPages: { path: string; views: number }[]
  entryPages: { path: string; sessions: number; bounceRate: number; avgDuration: number }[]
  exitPages: { path: string; exits: number; views: number; exitRate: number }[]
  events: { name: string; count: number; prior: number; deltaPct: number | null }[]
  audience: {
    newUsers: Delta
    returningUsers: Delta
    bySource: { source: string; sessions: number; prior: number; deltaPct: number | null }[]
  }
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
interface Realtime {
  activeUsers: number
  byMinute: { minutesAgo: number; users: number }[]
  topPages: { path: string; users: number }[]
  byDevice: { device: string; users: number }[]
}

const RANGES = [
  { days: 1, label: 'Today', today: true },
  { days: 1, label: '24h', today: false },
  { days: 7, label: '7d', today: false },
  { days: 28, label: '28d', today: false },
  { days: 90, label: '90d', today: false },
]

function DeltaBadge({ d, invert = false }: { d: number | null; invert?: boolean }) {
  if (d === null) return <span className="text-xs text-sky-400">new</span>
  const up = d >= 0
  const good = invert ? !up : up
  return (
    <span className={`text-xs font-medium ${good ? 'text-green-400' : 'text-red-400'}`}>
      {up ? '↑' : '↓'} {Math.abs(d)}%
    </span>
  )
}

function fmt(n: number) { return n >= 1000 ? n.toLocaleString() : String(Math.round(n)) }
function dur(s: number) { const m = Math.floor(s / 60); const sec = Math.round(s % 60); return m ? `${m}m ${sec}s` : `${sec}s` }
function hourLabel(h: number | null) {
  if (h === null) return '—'
  if (h === 0) return '12 AM'; if (h === 12) return '12 PM'
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

function Metric({ label, d, suffix = '', invert = false, help }: { label: string; d: Delta; suffix?: string; invert?: boolean; help?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 break-inside-avoid">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-bold text-white">{fmt(d.current)}{suffix}</p>
        <DeltaBadge d={d.deltaPct} invert={invert} />
      </div>
      <p className="text-xs text-gray-600 mt-1">prev {fmt(d.prior)}{suffix}</p>
      {help && <p className="text-[11px] text-gray-500 italic mt-2 leading-snug">{help}</p>}
    </div>
  )
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3 mt-2">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">{children}</h3>
      {hint && <p className="text-xs text-gray-600 mt-1 leading-snug max-w-2xl">{hint}</p>}
    </div>
  )
}

// A plain-English "headline" callout — the one-sentence takeaway for a section.
function Takeaway({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 items-start rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 mb-4 break-inside-avoid">
      <span className="text-gold mt-0.5 shrink-0">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" /></svg>
      </span>
      <p className="text-sm text-gray-300 leading-snug">{children}</p>
    </div>
  )
}

/* ---------------- Realtime panel ---------------- */
function RealtimePanel({ propId }: { propId: string }) {
  const [rt, setRt] = useState<Realtime | null>(null)
  const [err, setErr] = useState('')
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!propId) return
    let alive = true
    const pull = async () => {
      try {
        const res = await fetch(`/api/ga4/realtime?propertyId=${propId}`)
        const j = await res.json()
        if (!alive) return
        if (!res.ok) { setErr(j.error || 'Realtime unavailable'); return }
        setErr(''); setRt(j)
      } catch { if (alive) setErr('Realtime unavailable') }
    }
    pull(); timer.current = setInterval(pull, 20000)
    return () => { alive = false; if (timer.current) clearInterval(timer.current) }
  }, [propId])

  const max = Math.max(1, ...(rt?.byMinute.map(m => m.users) || [1]))
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6 break-inside-avoid">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-60 animate-ping print:hidden" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
          </span>
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Live · Active Now</h3>
        </div>
        <span className="text-xs text-gray-600 print:hidden">refreshes every 20s</span>
      </div>
      <p className="text-[11px] text-gray-500 italic mb-4">People on your website in the last 30 minutes, right now.</p>
      {err ? <p className="text-amber-500 text-xs">{err}</p>
      : !rt ? <p className="text-gray-500 text-sm">Connecting…</p>
      : (
        <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-6">
          <div>
            <p className="text-5xl font-bold text-white leading-none" style={{ fontFamily: 'var(--font-serif)' }}>{rt.activeUsers}</p>
            <p className="text-xs text-gray-500 mt-1">active visitors</p>
            <div className="mt-4 space-y-1.5">
              {rt.byDevice.map(d => (
                <div key={d.device} className="flex justify-between text-xs"><span className="text-gray-400 capitalize">{d.device}</span><span className="text-gray-300">{d.users}</span></div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] text-gray-500 mb-2">Visitors per minute</p>
            <div className="flex items-end gap-0.5 h-16 mb-4">
              {Array.from({ length: 30 }).map((_, i) => {
                const m = rt.byMinute.find(x => x.minutesAgo === 29 - i); const v = m?.users || 0
                return <div key={i} className="flex-1 rounded-sm bg-gray-800 relative" style={{ height: '100%' }}><div className="absolute bottom-0 left-0 right-0 rounded-sm" style={{ height: `${(v / max) * 100}%`, background: 'linear-gradient(180deg,#c9a961,#9a7723)' }} /></div>
              })}
            </div>
            <p className="text-[11px] text-gray-500 mb-2">Pages being viewed right now</p>
            <div className="space-y-1">
              {rt.topPages.slice(0, 5).map(p => <div key={p.path} className="flex justify-between text-xs"><span className="text-gray-300 truncate max-w-[280px]">{p.path}</span><span className="text-gray-500 shrink-0 ml-2">{p.users}</span></div>)}
              {rt.topPages.length === 0 && <p className="text-gray-600 text-xs">Nobody on the site this minute.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Analytics() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [email, setEmail] = useState('')
  const [properties, setProperties] = useState<Property[]>([])
  const [propId, setPropId] = useState('')
  const [rangeIdx, setRangeIdx] = useState(3)
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/ga4/properties').then(r => r.json()).then(j => {
      setConnected(j.connected); setEmail(j.email || ''); setProperties(j.properties || [])
      if (j.properties?.length) setPropId(j.properties[0].id)
      if (j.error) setError(j.error)
    }).catch(() => setConnected(false))
  }, [])

  async function run(save = false) {
    if (!propId) return
    const range = RANGES[rangeIdx]
    setLoading(true); setError(''); setSaved(false)
    const prop = properties.find(p => p.id === propId)
    const res = await fetch('/api/ga4/report', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId: propId, propertyName: prop?.name, days: range.days, today: range.today, save }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error || 'Report failed.'); setLoading(false); return }
    setReport(json); setLoading(false); if (save) setSaved(true)
  }
  useEffect(() => { if (propId) run(false) /* eslint-disable-next-line */ }, [propId, rangeIdx])

  const propName = properties.find(p => p.id === propId)?.name || ''

  if (connected === null) return <p className="text-gray-500 text-sm">Loading…</p>
  if (!connected) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-1">Analytics</h2>
        <p className="text-gray-400 text-sm mb-6">Connect your Google account to read GA4 across all properties you have access to.</p>
        <a href="/api/ga4/auth" className="inline-block bg-blue-800 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium">Connect Google Analytics</a>
        {error && <p className="text-amber-500 text-xs mt-4">{error}</p>}
      </div>
    )
  }

  const i = report?.insights
  const totalUsers = report?.totals.totalUsers.current || 0
  const newShare = totalUsers ? Math.round((report!.audience.newUsers.current / totalUsers) * 100) : 0

  return (
    <div className="max-w-7xl mx-auto" id="report-root">
      {/* Print-only branded header */}
      <div className="hidden print:flex items-center justify-between mb-6 pb-4 border-b border-gray-800">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gold font-semibold">Living Stone Solutions</p>
          <h1 className="text-xl font-bold text-white">Website Analytics Report</h1>
        </div>
        <div className="text-right text-xs text-gray-500">
          <p>{propName}</p>
          {report && <p>{report.range.start} → {report.range.end}</p>}
        </div>
      </div>

      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap print:hidden">
        <div>
          <h2 className="text-2xl font-bold">Analytics</h2>
          <div className="gold-divider my-2.5" />
          <p className="text-gray-500 text-sm">Who visits, where they come from, what they do {email && <span className="text-gray-600">· {email}</span>}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={propId} onChange={e => setPropId(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white max-w-xs focus:outline-none focus:border-blue-700">
            {properties.map(p => <option key={p.id} value={p.id}>{p.account} — {p.name}</option>)}
          </select>
          <div className="flex bg-gray-800 rounded-lg p-0.5">
            {RANGES.map((r, idx) => <button key={r.label} onClick={() => setRangeIdx(idx)} className={`px-3 py-1.5 rounded-md text-sm ${rangeIdx === idx ? 'bg-blue-800 text-white' : 'text-gray-400'}`}>{r.label}</button>)}
          </div>
          <button onClick={() => run(true)} disabled={loading} className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm">{saved ? 'Saved ✓' : 'Save snapshot'}</button>
          <button onClick={() => window.print()} disabled={!report} className="bg-blue-800 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" /></svg>
            Download PDF
          </button>
        </div>
      </div>

      <RealtimePanel propId={propId} />

      {error && <p className="text-amber-500 text-xs mb-4">{error}</p>}
      {loading && <p className="text-gray-500 text-sm">Pulling GA4…</p>}

      {report && i && !loading && (
        <>
          <p className="text-xs text-gray-600 mb-6">
            Showing {report.range.start} → {report.range.end}, compared with the previous period ({report.priorRange.start} → {report.priorRange.end}).
          </p>

          {/* Headline numbers */}
          <SectionTitle hint="The big picture: how many people came, and how that compares with the period before.">Overview</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Metric label="Visitors" d={report.totals.totalUsers} help="Unique people who came to the site." />
            <Metric label="Visits (Sessions)" d={report.totals.sessions} help="Total trips to the site (one person can visit more than once)." />
            <Metric label="New Visitors" d={report.totals.newUsers} help="People here for the first time." />
            <Metric label="Conversions" d={report.totals.conversions} help="Key actions completed (sign-ups, purchases, etc.)." />
          </div>
          <Takeaway>
            {newShare >= 60
              ? <>Most of your audience is brand new ({newShare}% first-time visitors). You&apos;re reaching fresh people — now focus on getting them to come back.</>
              : <>{newShare}% of visitors were new and {100 - newShare}% returning. A healthy mix means people are discovering you and coming back.</>}
          </Takeaway>

          {/* WHERE TRAFFIC COMES FROM */}
          <SectionTitle hint="Every visit comes from somewhere — a search engine, a social post, a direct link, or an ad. This shows which sources bring people in.">Where Your Traffic Comes From</SectionTitle>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4">
            <ChartFrame title="By Channel" explainer="The type of source — Organic Search, Direct, Social, Referral, Paid, etc." height={250} empty={i.channels.length === 0}>
              <div className="grid grid-cols-[1.1fr_1fr] gap-3 h-full items-center">
                <DonutChart data={i.channels.map(c => ({ name: c.channel, value: c.sessions }))} centerValue={fmt(report.totals.sessions.current)} centerLabel="visits" />
                <ChartLegend data={i.channels.map(c => ({ name: c.channel, value: c.sessions }))} />
              </div>
            </ChartFrame>
            <ChartFrame title="Social Platforms" explainer="Which social networks send people to your site. Great for knowing where your posting pays off." height={250} empty={i.social.length === 0} emptyHint="No social traffic detected in this period.">
              <BarSeries data={i.social.map(s => ({ name: s.platform, value: s.sessions }))} xKey="name" barKey="value" horizontal colorByIndex format={fmt} />
            </ChartFrame>
          </div>
          {i.social.length > 0 && (
            <Takeaway><strong className="text-white">{i.social[0].platform}</strong> is your top social source ({i.social[0].sessions} visits). {i.social.length > 1 ? `Followed by ${i.social[1].platform}. ` : ''}Double down where the visits already come from.</Takeaway>
          )}

          {/* AUDIENCE — who & where & when */}
          <SectionTitle hint="A closer look at the people themselves: what devices they use, where in the world they are, and when they tend to show up.">Your Audience</SectionTitle>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <ChartFrame title="Devices" explainer="Phone, computer, or tablet." height={230} empty={i.devices.length === 0}>
              <div className="grid grid-rows-[1fr_auto] gap-2 h-full">
                <DonutChart data={i.devices.map(d => ({ name: d.device, value: d.users }))} />
                <ChartLegend data={i.devices.map(d => ({ name: d.device, value: d.users }))} />
              </div>
            </ChartFrame>
            <ChartFrame title="Browsers" explainer="The apps people use to open your site." height={230} empty={i.browsers.length === 0}>
              <BarSeries data={i.browsers.map(b => ({ name: b.browser, value: b.users }))} xKey="name" barKey="value" horizontal colorByIndex format={fmt} />
            </ChartFrame>
            <ChartFrame title="Operating Systems" explainer="iOS, Android, Windows, Mac, etc." height={230} empty={i.os.length === 0}>
              <BarSeries data={i.os.map(o => ({ name: o.os, value: o.users }))} xKey="name" barKey="value" horizontal colorByIndex format={fmt} />
            </ChartFrame>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4">
            <div>
              <ChartFrame title="Top Locations" explainer="Where in the world your visitors are. Useful for targeting and timing." height={260} empty={i.countries.length === 0}>
                <BarSeries data={i.countries.slice(0, 7).map(c => ({ name: c.country, value: c.users }))} xKey="name" barKey="value" horizontal colorByIndex format={fmt} />
              </ChartFrame>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 break-inside-avoid">
              <h3 className="text-base font-semibold text-white leading-tight mb-1">Top Cities</h3>
              <p className="text-[11px] text-gray-500 italic mb-3">The specific places most of your people are in.</p>
              <div className="space-y-2">
                {i.cities.slice(0, 8).map((c, idx) => {
                  const maxC = Math.max(1, ...i.cities.map(x => x.users))
                  return (
                    <div key={c.city}>
                      <div className="flex justify-between text-xs mb-1"><span className="text-gray-300">{c.city}</span><span className="text-gray-500">{c.users}</span></div>
                      <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(c.users / maxC) * 100}%`, background: SERIES_COLORS[idx % SERIES_COLORS.length] }} /></div>
                    </div>
                  )
                })}
                {i.cities.length === 0 && <p className="text-gray-600 text-sm">No city data.</p>}
              </div>
            </div>
          </div>

          {/* PEAK TIMES */}
          <SectionTitle hint="When people actually show up. Post and run ads around these peaks for the most eyes.">Busiest Times</SectionTitle>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4">
            <ChartFrame title="By Hour of Day" explainer="Each bar is one hour. Taller = more visitors at that time." height={220} empty={i.byHour.length === 0}>
              <HourBars data={i.byHour} />
            </ChartFrame>
            <ChartFrame title="By Day of Week" height={220} empty={i.byDay.every(d => d.users === 0)}>
              <BarSeries data={i.byDay.map(d => ({ name: d.day.slice(0, 3), value: d.users }))} xKey="name" barKey="value" format={fmt} />
            </ChartFrame>
          </div>
          <Takeaway>Your busiest time is around <strong className="text-white">{hourLabel(i.peakHour)}</strong>, and <strong className="text-white">{i.peakDay}</strong> is your strongest day. Schedule posts and campaigns to land just before then.</Takeaway>

          {/* WHERE THEY LAND & STOP */}
          <SectionTitle hint="The first page people see, and the pages where they tend to leave. High bounce = people arrive but don't stay.">Landing &amp; Drop-off</SectionTitle>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden break-inside-avoid">
              <div className="p-4 pb-2"><h3 className="text-base font-semibold text-white">Entry Pages</h3><p className="text-[11px] text-gray-500 italic">Where visitors arrive. &quot;Bounce&quot; = left without doing anything.</p></div>
              <table className="w-full text-sm">
                <thead className="border-y border-gray-800 text-gray-500 text-[11px] uppercase"><tr><th className="text-left p-3">Landing page</th><th className="text-right p-3">Visits</th><th className="text-right p-3">Bounce</th><th className="text-right p-3">Avg time</th></tr></thead>
                <tbody>
                  {report.entryPages.slice(0, 8).map(p => (
                    <tr key={p.path} className="border-b border-gray-800 last:border-0">
                      <td className="p-3 truncate max-w-[180px]">{p.path}</td>
                      <td className="p-3 text-right text-gray-300">{fmt(p.sessions)}</td>
                      <td className={`p-3 text-right ${p.bounceRate >= 70 ? 'text-red-400' : p.bounceRate >= 50 ? 'text-amber-400' : 'text-gray-400'}`}>{p.bounceRate}%</td>
                      <td className="p-3 text-right text-gray-500">{dur(p.avgDuration)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden break-inside-avoid">
              <div className="p-4 pb-2"><h3 className="text-base font-semibold text-white">Drop-off Pages</h3><p className="text-[11px] text-gray-500 italic">Pages losing the most people. Fix these first.</p></div>
              <table className="w-full text-sm">
                <thead className="border-y border-gray-800 text-gray-500 text-[11px] uppercase"><tr><th className="text-left p-3">Page</th><th className="text-right p-3">People lost</th><th className="text-right p-3">Bounce</th></tr></thead>
                <tbody>
                  {report.exitPages.slice(0, 8).map(p => (
                    <tr key={p.path} className="border-b border-gray-800 last:border-0">
                      <td className="p-3 truncate max-w-[220px]">{p.path}</td>
                      <td className="p-3 text-right text-gray-300">{fmt(p.exits)}</td>
                      <td className={`p-3 text-right ${p.exitRate >= 70 ? 'text-red-400' : p.exitRate >= 40 ? 'text-amber-400' : 'text-gray-400'}`}>{p.exitRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* EVENTS */}
          <SectionTitle hint="Actions people take on the site — clicks, scrolls, form starts, video plays, and so on.">What Visitors Do (Events)</SectionTitle>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden mb-6 break-inside-avoid">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-800 text-gray-500 text-[11px] uppercase"><tr><th className="text-left p-3">Action</th><th className="text-right p-3">Times</th><th className="text-right p-3">vs prev</th><th className="text-right p-3">Change</th></tr></thead>
              <tbody>
                {report.events.map(e => (
                  <tr key={e.name} className="border-b border-gray-800 last:border-0">
                    <td className="p-3 font-medium">{e.name}</td>
                    <td className="p-3 text-right text-gray-300">{fmt(e.count)}</td>
                    <td className="p-3 text-right text-gray-600">{fmt(e.prior)}</td>
                    <td className="p-3 text-right"><DeltaBadge d={e.deltaPct} /></td>
                  </tr>
                ))}
                {report.events.length === 0 && <tr><td colSpan={4} className="p-4 text-gray-600 text-sm">No events recorded.</td></tr>}
              </tbody>
            </table>
          </div>

          {/* GEO/SEO PROOF */}
          <SectionTitle hint="Proof the GEO work is landing: visits from Google's organic search and from AI engines like ChatGPT and Perplexity.">AI &amp; Search Visibility</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <Metric label="Organic Search Visits" d={report.geo.organicSessions} help="People who found you through unpaid Google search." />
            <Metric label="AI-Referral Visits" d={report.geo.aiSessions} help="People who arrived from an AI tool's answer." />
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 break-inside-avoid">
              <p className="text-xs text-gray-500 mb-2">AI Sources</p>
              {report.geo.aiBreakdown.length === 0 ? <p className="text-gray-600 text-sm">None detected yet.</p>
              : <div className="space-y-1">{report.geo.aiBreakdown.slice(0, 5).map(a => <div key={a.source} className="flex justify-between text-sm"><span className="text-gray-300 capitalize">{a.source}</span><span className="text-gray-500">{a.sessions}</span></div>)}</div>}
            </div>
          </div>

          {/* Glossary — print + screen */}
          <details className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-4 print:open break-inside-avoid">
            <summary className="text-sm font-semibold text-white cursor-pointer">Plain-English glossary</summary>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 mt-4 text-sm">
              {[
                ['Visitor (User)', 'One unique person who came to the site.'],
                ['Visit (Session)', 'One trip to the site. The same person can have several.'],
                ['Bounce', 'A visit where the person left without interacting — they didn\'t find what they wanted.'],
                ['Conversion', 'A goal action you care about: a sign-up, purchase, or form submit.'],
                ['Organic search', 'Free traffic from Google/Bing search results (not ads).'],
                ['AI-referral', 'Visits sent from an AI tool like ChatGPT, Perplexity, or Gemini.'],
                ['Channel', 'The broad category of where a visit came from.'],
                ['Drop-off', 'Where people tend to leave the site.'],
              ].map(([t, d]) => (
                <div key={t}><dt className="text-gray-300 font-medium">{t}</dt><dd className="text-gray-500">{d}</dd></div>
              ))}
            </dl>
          </details>

          <p className="hidden print:block text-[10px] text-gray-500 text-center mt-6 pt-4 border-t border-gray-800">
            Prepared by Living Stone Solutions · {report.range.start} → {report.range.end} · Data from Google Analytics 4
          </p>
        </>
      )}
    </div>
  )
}
