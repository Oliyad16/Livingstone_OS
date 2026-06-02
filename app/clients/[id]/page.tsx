'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface Client {
  id: string; name: string; company: string; email: string; phone: string
  service: string; type: string; status: string; notes: string
  monthlyValue: number; projectValue: number; startDate: string; ga4PropertyId: string | null
}
interface Property { id: string; name: string; account: string }
interface Delta { current: number; prior: number; deltaPct: number | null }
interface Report {
  range: { start: string; end: string }
  totals: Record<string, Delta>
  byChannel: { channel: string; sessions: number; conversions: number }[]
  geo: { organicSessions: Delta; aiSessions: Delta; aiBreakdown: { source: string; sessions: number }[] }
}

function DeltaBadge({ d }: { d: number | null }) {
  if (d === null) return <span className="text-xs text-sky-400">new</span>
  const up = d >= 0
  return <span className={`text-xs font-medium ${up ? 'text-green-400' : 'text-red-400'}`}>{up ? '↑' : '↓'} {Math.abs(d)}%</span>
}
const fmt = (n: number) => (n >= 1000 ? n.toLocaleString() : String(Math.round(n)))

function Metric({ label, d }: { label: string; d: Delta }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className="text-xl font-bold">{fmt(d.current)}</p>
        <DeltaBadge d={d.deltaPct} />
      </div>
      <p className="text-xs text-gray-600 mt-0.5">prev {fmt(d.prior)}</p>
    </div>
  )
}

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>()
  const [client, setClient] = useState<Client | null>(null)
  const [properties, setProperties] = useState<Property[]>([])
  const [gaConnected, setGaConnected] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')
  const [savingLink, setSavingLink] = useState(false)
  const [notFound, setNotFound] = useState(false)

  async function loadClient() {
    const res = await fetch(`/api/clients/${id}`)
    if (res.ok) setClient(await res.json())
    else setNotFound(true)
  }
  useEffect(() => {
    loadClient()
    fetch('/api/ga4/properties').then(r => r.json()).then(j => {
      setGaConnected(!!j.connected); setProperties(j.properties || [])
    }).catch(() => {})
  }, [id])

  // When the client has a GA4 property, pull its report.
  useEffect(() => {
    if (!client?.ga4PropertyId) { setReport(null); return }
    setReportLoading(true); setReportError('')
    fetch('/api/ga4/report', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId: client.ga4PropertyId, days: 28 }),
    }).then(async r => {
      const j = await r.json()
      if (!r.ok) { setReportError(j.error || 'Could not load GA4 data.'); setReport(null) }
      else setReport(j)
    }).catch(() => setReportError('GA4 request failed.')).finally(() => setReportLoading(false))
  }, [client?.ga4PropertyId])

  async function linkProperty(propertyId: string) {
    if (!client) return
    setSavingLink(true)
    await fetch('/api/clients', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: client.id, ga4PropertyId: propertyId || null }),
    })
    setSavingLink(false)
    setClient({ ...client, ga4PropertyId: propertyId || null })
  }

  if (notFound) return (
    <div>
      <Link href="/clients" className="text-gray-500 hover:text-white text-sm">← Clients</Link>
      <p className="text-gray-400 text-sm mt-4">Client not found. It may have been deleted.</p>
    </div>
  )
  if (!client) return <p className="text-gray-500 text-sm">Loading…</p>

  return (
    <div>
      <Link href="/clients" className="text-gray-500 hover:text-white text-sm">← Clients</Link>

      <div className="flex items-start justify-between mt-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold">{client.name}</h2>
          <p className="text-gray-400 text-sm">{client.company}</p>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs capitalize ${client.status === 'active' ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-400'}`}>{client.status}</span>
      </div>

      {/* Profile */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4"><p className="text-xs text-gray-500 mb-1">Service</p><p className="font-semibold">{client.service || '—'}</p></div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4"><p className="text-xs text-gray-500 mb-1">Type</p><p className="font-semibold capitalize">{client.type}</p></div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4"><p className="text-xs text-gray-500 mb-1">{client.type === 'retainer' ? 'Monthly' : 'Project'}</p><p className="font-semibold">${(client.type === 'retainer' ? client.monthlyValue : client.projectValue).toLocaleString()}</p></div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4"><p className="text-xs text-gray-500 mb-1">Since</p><p className="font-semibold">{client.startDate ? new Date(client.startDate).toLocaleDateString() : '—'}</p></div>
      </div>

      {(client.email || client.phone || client.notes) && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-8 text-sm space-y-1">
          {client.email && <p className="text-gray-400">{client.email}</p>}
          {client.phone && <p className="text-gray-400">{client.phone}</p>}
          {client.notes && <p className="text-gray-400 mt-2">{client.notes}</p>}
        </div>
      )}

      {/* GA4 website performance */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">Website Performance</h3>
        {gaConnected ? (
          <select
            value={client.ga4PropertyId || ''}
            onChange={e => linkProperty(e.target.value)}
            disabled={savingLink}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white max-w-xs focus:outline-none focus:border-blue-700"
          >
            <option value="">— link a GA4 property —</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.account} — {p.name}</option>)}
          </select>
        ) : (
          <Link href="/analytics" className="text-xs text-sky-400 hover:text-sky-300">Connect Google Analytics →</Link>
        )}
      </div>

      {!client.ga4PropertyId ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-400 text-sm">{gaConnected ? 'Link a GA4 property above to see this client’s website data.' : 'Connect Google Analytics to show website performance.'}</p>
        </div>
      ) : reportLoading ? (
        <p className="text-gray-500 text-sm">Loading GA4…</p>
      ) : reportError ? (
        <p className="text-amber-500 text-sm">{reportError}</p>
      ) : report ? (
        <>
          <p className="text-xs text-gray-600 mb-3">Last 28 days vs prior 28 · GEO/SEO proof</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <Metric label="Organic Sessions" d={report.geo.organicSessions} />
            <Metric label="AI-Referral Sessions" d={report.geo.aiSessions} />
            <Metric label="Sessions" d={report.totals.sessions} />
            <Metric label="Conversions" d={report.totals.conversions} />
          </div>
        </>
      ) : null}
    </div>
  )
}
