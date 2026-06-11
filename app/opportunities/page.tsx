'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useWorkspace } from '../components/WorkspaceContext'

interface Opp {
  id: string; title: string; solNo: string; agency: string; naics: string
  vehicle: string; setAside: string; value: number; dueDate: string | null
  stage: string; source: string; url: string; notes: string
  summary?: string; driveFolderUrl?: string | null
}

const STAGES = ['identified', 'qualified', 'bid', 'submitted', 'won', 'lost']
const SOURCES = ['sam.gov', 'state', 'email', 'partner', 'manual']
const blank = {
  title: '', solNo: '', agency: '', naics: '', vehicle: '', setAside: '',
  value: 0, dueDate: '', stage: 'identified', source: 'sam.gov', url: '', notes: '',
}

// Days until due, with urgency color.
function dueInfo(dateStr: string | null) {
  if (!dateStr) return { text: '—', cls: 'text-gray-600' }
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (days < 0) return { text: 'past due', cls: 'text-red-400' }
  if (days <= 7) return { text: `${days}d left`, cls: 'text-red-400' }
  if (days <= 21) return { text: `${days}d left`, cls: 'text-amber-400' }
  return { text: `${days}d left`, cls: 'text-gray-400' }
}

const stageColor: Record<string, string> = {
  identified: 'bg-gray-700 text-gray-300', qualified: 'bg-blue-900 text-blue-300',
  bid: 'bg-blue-900 text-sky-300', submitted: 'bg-purple-900 text-purple-300',
  won: 'bg-green-900 text-green-300', lost: 'bg-red-950 text-red-400',
}

export default function Opportunities() {
  const { workspace } = useWorkspace()
  const [opps, setOpps] = useState<Opp[]>([])
  const [form, setForm] = useState(blank)
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState('all')

  async function load() {
    const res = await fetch(`/api/opportunities?workspace=${workspace}`)
    setOpps(await res.json())
  }
  useEffect(() => { load() }, [workspace])

  async function add() {
    await fetch('/api/opportunities', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, workspace }),
    })
    setForm(blank); setAdding(false); load()
  }

  async function moveStage(o: Opp, stage: string) {
    await fetch('/api/opportunities', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: o.id, stage }),
    })
    load()
  }

  // Capture KPIs
  const openOpps = opps.filter(o => !['won', 'lost'].includes(o.stage))
  const pipelineValue = openOpps.reduce((s, o) => s + Number(o.value), 0)
  const dueSoon = openOpps.filter(o => o.dueDate && (new Date(o.dueDate).getTime() - Date.now()) / 86400000 <= 7).length
  const decided = opps.filter(o => ['won', 'lost'].includes(o.stage))
  const winRate = decided.length ? Math.round((opps.filter(o => o.stage === 'won').length / decided.length) * 100) : 0

  const shown = filter === 'all' ? opps : opps.filter(o => o.stage === filter)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Opportunities</h2>
          <p className="text-gray-400 text-sm">Government capture pipeline · {opps.length} total</p>
        </div>
        <button onClick={() => setAdding(true)} className="bg-blue-800 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">+ Add Opportunity</button>
      </div>

      {/* Capture KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4"><p className="text-xs text-gray-500 mb-1">Open Pipeline</p><p className="text-xl font-bold">${pipelineValue.toLocaleString()}</p></div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4"><p className="text-xs text-gray-500 mb-1">Open Opps</p><p className="text-xl font-bold">{openOpps.length}</p></div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4"><p className="text-xs text-gray-500 mb-1">Due ≤ 7 days</p><p className={`text-xl font-bold ${dueSoon ? 'text-red-400' : ''}`}>{dueSoon}</p></div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4"><p className="text-xs text-gray-500 mb-1">Win Rate</p><p className="text-xl font-bold">{decided.length ? `${winRate}%` : '—'}</p></div>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        {['all', ...STAGES].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${filter === s ? 'bg-blue-800 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>{s}</button>
        ))}
      </div>

      {adding && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-5">
          <h3 className="font-semibold mb-4">New Opportunity</h3>
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="col-span-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-700" />
            <input placeholder="Solicitation #" value={form.solNo} onChange={e => setForm({ ...form, solNo: e.target.value })} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-700" />
            <input placeholder="Agency" value={form.agency} onChange={e => setForm({ ...form, agency: e.target.value })} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-700" />
            <input placeholder="NAICS" value={form.naics} onChange={e => setForm({ ...form, naics: e.target.value })} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-700" />
            <input placeholder="Vehicle (MAS, OASIS+...)" value={form.vehicle} onChange={e => setForm({ ...form, vehicle: e.target.value })} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-700" />
            <input placeholder="Set-aside (8(a), SDVOSB...)" value={form.setAside} onChange={e => setForm({ ...form, setAside: e.target.value })} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-700" />
            <input type="number" placeholder="Value ($)" value={form.value || ''} onChange={e => setForm({ ...form, value: Number(e.target.value) })} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-700" />
            <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-700" />
            <select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-700">{SOURCES.map(s => <option key={s}>{s}</option>)}</select>
            <select value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-700">{STAGES.map(s => <option key={s}>{s}</option>)}</select>
            <textarea placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="col-span-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-700 resize-none h-16" />
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={add} disabled={!form.title} className="bg-blue-800 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">Save</button>
            <button onClick={() => { setAdding(false); setForm(blank) }} className="bg-gray-800 text-gray-400 px-4 py-2 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {shown.length === 0 ? (
          <p className="text-gray-500 p-6 text-sm">No opportunities in this stage.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left p-3">Title / Agency</th>
                <th className="text-left p-3">Vehicle</th>
                <th className="text-left p-3">Set-aside</th>
                <th className="text-right p-3">Value</th>
                <th className="text-left p-3">Due</th>
                <th className="text-left p-3">Stage</th>
                <th className="text-left p-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(o => {
                const due = dueInfo(o.dueDate)
                return (
                  <tr key={o.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40">
                    <td className="p-3">
                      <Link href={`/opportunities/${o.id}`} className="font-medium text-white hover:text-gold inline-flex items-center gap-1.5">
                        <span className="text-gray-500">{o.driveFolderUrl ? '📁' : '📄'}</span>
                        {o.title}
                      </Link>
                      <p className="text-xs text-gray-500">{o.agency}{o.solNo && ` · ${o.solNo}`}</p>
                    </td>
                    <td className="p-3 text-gray-400">{o.vehicle || '—'}</td>
                    <td className="p-3 text-gray-400">{o.setAside || '—'}</td>
                    <td className="p-3 text-right text-gray-300">{o.value ? `$${Number(o.value).toLocaleString()}` : '—'}</td>
                    <td className="p-3"><span className={due.cls}>{due.text}</span></td>
                    <td className="p-3">
                      <select value={o.stage} onChange={e => moveStage(o, e.target.value)} className={`rounded-full text-xs px-2 py-0.5 capitalize border-0 focus:outline-none ${stageColor[o.stage] || 'bg-gray-700 text-gray-300'}`}>
                        {STAGES.map(s => <option key={s} value={s} className="bg-gray-800 text-white">{s}</option>)}
                      </select>
                    </td>
                    <td className="p-3 text-gray-500 text-xs">{o.source}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
