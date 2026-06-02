'use client'
import { useEffect, useState } from 'react'

interface Property { id: string; name: string; account: string }
interface Delta { current: number; prior: number; deltaPct: number | null }
interface Report {
  range: { start: string; end: string }
  priorRange: { start: string; end: string }
  totals: Record<string, Delta>
  byChannel: { channel: string; sessions: number; conversions: number }[]
  topPages: { path: string; views: number }[]
  geo: {
    organicSessions: Delta
    aiSessions: Delta
    aiBreakdown: { source: string; sessions: number }[]
  }
}

const RANGES = [
  { days: 7, label: '7d' },
  { days: 28, label: '28d' },
  { days: 90, label: '90d' },
]

function DeltaBadge({ d }: { d: number | null }) {
  if (d === null) return <span className="text-xs text-sky-400">new</span>
  const up = d >= 0
  return (
    <span className={`text-xs font-medium ${up ? 'text-green-400' : 'text-red-400'}`}>
      {up ? '↑' : '↓'} {Math.abs(d)}%
    </span>
  )
}

function fmt(n: number) {
  return n >= 1000 ? n.toLocaleString() : String(Math.round(n))
}

function Metric({ label, d, suffix = '' }: { label: string; d: Delta; suffix?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-bold text-white">{fmt(d.current)}{suffix}</p>
        <DeltaBadge d={d.deltaPct} />
      </div>
      <p className="text-xs text-gray-600 mt-1">prev {fmt(d.prior)}{suffix}</p>
    </div>
  )
}

export default function Analytics() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [email, setEmail] = useState('')
  const [properties, setProperties] = useState<Property[]>([])
  const [propId, setPropId] = useState('')
  const [days, setDays] = useState(28)
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/ga4/properties').then(r => r.json()).then(j => {
      setConnected(j.connected)
      setEmail(j.email || '')
      setProperties(j.properties || [])
      if (j.properties?.length) setPropId(j.properties[0].id)
      if (j.error) setError(j.error)
    }).catch(() => setConnected(false))
  }, [])

  async function run(save = false) {
    if (!propId) return
    setLoading(true); setError(''); setSaved(false)
    const prop = properties.find(p => p.id === propId)
    const res = await fetch('/api/ga4/report', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId: propId, propertyName: prop?.name, days, save }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error || 'Report failed.'); setLoading(false); return }
    setReport(json); setLoading(false); if (save) setSaved(true)
  }

  // Auto-run when property or range changes.
  useEffect(() => { if (propId) run(false) /* eslint-disable-next-line */ }, [propId, days])

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

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">Analytics</h2>
          <p className="text-gray-400 text-sm">GA4 performance · GEO/SEO proof {email && <span className="text-gray-600">· {email}</span>}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={propId} onChange={e => setPropId(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white max-w-xs focus:outline-none focus:border-blue-700">
            {properties.map(p => <option key={p.id} value={p.id}>{p.account} — {p.name}</option>)}
          </select>
          <div className="flex bg-gray-800 rounded-lg p-0.5">
            {RANGES.map(r => (
              <button key={r.days} onClick={() => setDays(r.days)} className={`px-3 py-1.5 rounded-md text-sm ${days === r.days ? 'bg-blue-800 text-white' : 'text-gray-400'}`}>{r.label}</button>
            ))}
          </div>
          <button onClick={() => run(true)} disabled={loading} className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm">
            {saved ? 'Saved ✓' : 'Save snapshot'}
          </button>
        </div>
      </div>

      {error && <p className="text-amber-500 text-xs mb-4">{error}</p>}
      {loading && <p className="text-gray-500 text-sm">Pulling GA4…</p>}

      {report && !loading && (
        <>
          <p className="text-xs text-gray-600 mb-6">
            {report.range.start} → {report.range.end} vs {report.priorRange.start} → {report.priorRange.end}
          </p>

          {/* GEO/SEO proof — pinned at top */}
          <h3 className="text-sm font-semibold text-sky-400 mb-3 uppercase tracking-wider">GEO / SEO Proof</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
            <Metric label="Organic Sessions" d={report.geo.organicSessions} />
            <Metric label="AI-Referral Sessions" d={report.geo.aiSessions} />
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-xs text-gray-500 mb-2">AI Sources</p>
              {report.geo.aiBreakdown.length === 0 ? (
                <p className="text-gray-600 text-sm">None detected yet.</p>
              ) : (
                <div className="space-y-1">
                  {report.geo.aiBreakdown.slice(0, 5).map(a => (
                    <div key={a.source} className="flex justify-between text-sm">
                      <span className="text-gray-300 capitalize">{a.source}</span>
                      <span className="text-gray-500">{a.sessions}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Full traffic */}
          <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">Traffic</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Metric label="Sessions" d={report.totals.sessions} />
            <Metric label="Total Users" d={report.totals.totalUsers} />
            <Metric label="New Users" d={report.totals.newUsers} />
            <Metric label="Conversions" d={report.totals.conversions} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">By Channel</h3>
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                    <tr><th className="text-left p-3">Channel</th><th className="text-right p-3">Sessions</th><th className="text-right p-3">Conv.</th></tr>
                  </thead>
                  <tbody>
                    {report.byChannel.map(c => (
                      <tr key={c.channel} className="border-b border-gray-800 last:border-0">
                        <td className="p-3">{c.channel}</td>
                        <td className="p-3 text-right text-gray-300">{fmt(c.sessions)}</td>
                        <td className="p-3 text-right text-gray-500">{fmt(c.conversions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">Top Pages</h3>
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                    <tr><th className="text-left p-3">Path</th><th className="text-right p-3">Views</th></tr>
                  </thead>
                  <tbody>
                    {report.topPages.map(p => (
                      <tr key={p.path} className="border-b border-gray-800 last:border-0">
                        <td className="p-3 truncate max-w-[260px]">{p.path}</td>
                        <td className="p-3 text-right text-gray-300">{fmt(p.views)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
