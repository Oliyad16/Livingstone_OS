'use client'
import { useEffect, useState } from 'react'
import SheetImport from '../components/SheetImport'
import { useWorkspace } from '../components/WorkspaceContext'

interface Touchpoint { type: string; notes: string; date: string }
interface Lead {
  id: string; name: string; company: string; email: string; phone: string
  source: string; status: string; service: string; notes: string
  touchpoints: Touchpoint[]; createdAt: string; lastContactedAt?: string
}

const STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'closed', 'lost']
const SOURCES = ['expo', 'referral', 'inbound', 'cold outreach', 'other']
const SERVICES = ['GEO', 'SEO', 'website', 'software', 'other']

const blank = { name: '', company: '', email: '', phone: '', source: 'expo', status: 'new', service: 'GEO', notes: '' }

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [form, setForm] = useState(blank)
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState<Lead | null>(null)
  const [tpNotes, setTpNotes] = useState('')
  const [tpType, setTpType] = useState('call')
  const [filter, setFilter] = useState('all')
  const { workspace } = useWorkspace()

  async function load() {
    const res = await fetch(`/api/leads?workspace=${workspace}`)
    setLeads(await res.json())
  }
  useEffect(() => { load() }, [workspace])

  async function addLead() {
    await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, workspace }) })
    setForm(blank); setAdding(false); load()
  }

  async function updateStatus(lead: Lead, status: string) {
    await fetch('/api/leads', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: lead.id, status }) })
    load(); if (selected?.id === lead.id) setSelected({ ...selected, status })
  }

  async function logTouchpoint(leadId: string) {
    const res = await fetch('/api/leads/touchpoint', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId, type: tpType, notes: tpNotes }) })
    const updated = await res.json()
    setSelected(updated); setTpNotes(''); load()
  }

  async function deleteLead(id: string) {
    await fetch('/api/leads', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setSelected(null); load()
  }

  const filtered = filter === 'all' ? leads : leads.filter(l => l.status === filter)

  return (
    <div className="flex gap-6 h-full">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Leads</h2>
            <p className="text-gray-400 text-sm">{leads.length} total</p>
          </div>
          <button onClick={() => setAdding(true)} className="bg-blue-800 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">+ Add Lead</button>
        </div>

        <SheetImport onImported={load} />

        <div className="flex gap-2 mb-5 flex-wrap">
          {['all', ...STATUSES].map(s => (
            <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${filter === s ? 'bg-blue-800 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>{s}</button>
          ))}
        </div>

        {adding && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-5">
            <h3 className="font-semibold mb-4">New Lead</h3>
            <div className="grid grid-cols-2 gap-3">
              {(['name', 'company', 'email', 'phone'] as const).map(f => (
                <input key={f} placeholder={f.charAt(0).toUpperCase() + f.slice(1)} value={form[f]} onChange={e => setForm({ ...form, [f]: e.target.value })} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-700" />
              ))}
              <select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-700">
                {SOURCES.map(s => <option key={s}>{s}</option>)}
              </select>
              <select value={form.service} onChange={e => setForm({ ...form, service: e.target.value })} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-700">
                {SERVICES.map(s => <option key={s}>{s}</option>)}
              </select>
              <textarea placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="col-span-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-700 resize-none h-20" />
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={addLead} className="bg-blue-800 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">Save</button>
              <button onClick={() => { setAdding(false); setForm(blank) }} className="bg-gray-800 text-gray-400 px-4 py-2 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        )}

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {filtered.length === 0 ? (
            <p className="text-gray-500 p-6 text-sm">No leads in this stage.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="text-left p-4">Name</th>
                  <th className="text-left p-4">Company</th>
                  <th className="text-left p-4">Service</th>
                  <th className="text-left p-4">Status</th>
                  <th className="text-left p-4">Calls/Emails</th>
                  <th className="text-left p-4">Source</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => (
                  <tr key={l.id} onClick={() => setSelected(l)} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50 cursor-pointer">
                    <td className="p-4 font-medium">{l.name}</td>
                    <td className="p-4 text-gray-400">{l.company}</td>
                    <td className="p-4 text-gray-400">{l.service}</td>
                    <td className="p-4"><span className="px-2 py-0.5 rounded-full text-xs bg-blue-900 text-sky-300 capitalize">{l.status}</span></td>
                    <td className="p-4 text-gray-400">{(l.touchpoints || []).length}</td>
                    <td className="p-4 text-gray-400 capitalize">{l.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selected && (
        <div className="w-80 shrink-0 bg-gray-900 border border-gray-800 rounded-xl p-5 overflow-auto">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="font-bold text-lg">{selected.name}</h3>
              <p className="text-gray-400 text-sm">{selected.company}</p>
            </div>
            <button onClick={() => setSelected(null)} className="text-gray-600 hover:text-white text-lg">x</button>
          </div>

          <div className="space-y-1 text-sm mb-5">
            {selected.email && <p className="text-gray-400">{selected.email}</p>}
            {selected.phone && <p className="text-gray-400">{selected.phone}</p>}
            <p className="text-gray-500 capitalize">Source: {selected.source} | Service: {selected.service}</p>
            {selected.notes && <p className="text-gray-400 mt-2">{selected.notes}</p>}
          </div>

          <div className="mb-5">
            <p className="text-xs text-gray-500 uppercase mb-2">Move Stage</p>
            <div className="flex flex-wrap gap-1">
              {STATUSES.map(s => (
                <button key={s} onClick={() => updateStatus(selected, s)} className={`px-2 py-1 rounded text-xs capitalize ${selected.status === s ? 'bg-blue-800 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>{s}</button>
              ))}
            </div>
          </div>

          <div className="mb-5">
            <p className="text-xs text-gray-500 uppercase mb-2">Log Touchpoint</p>
            <div className="flex gap-2 mb-2">
              {['call', 'email', 'text', 'meeting'].map(t => (
                <button key={t} onClick={() => setTpType(t)} className={`px-2 py-1 rounded text-xs capitalize ${tpType === t ? 'bg-blue-800 text-white' : 'bg-gray-800 text-gray-400'}`}>{t}</button>
              ))}
            </div>
            <textarea placeholder="Notes (optional)" value={tpNotes} onChange={e => setTpNotes(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none resize-none h-16 mb-2" />
            <button onClick={() => logTouchpoint(selected.id)} className="w-full bg-blue-800 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium">Log {tpType}</button>
          </div>

          <div className="mb-5">
            <p className="text-xs text-gray-500 uppercase mb-2">History ({(selected.touchpoints || []).length})</p>
            {(selected.touchpoints || []).length === 0 ? (
              <p className="text-gray-600 text-xs">No touchpoints yet.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-auto">
                {[...(selected.touchpoints || [])].reverse().map((t, i) => (
                  <div key={i} className="bg-gray-800 rounded-lg p-2 text-xs">
                    <p className="text-sky-400 capitalize font-medium">{t.type}</p>
                    {t.notes && <p className="text-gray-400 mt-0.5">{t.notes}</p>}
                    <p className="text-gray-600 mt-0.5">{new Date(t.date).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button onClick={() => deleteLead(selected.id)} className="w-full bg-red-950 hover:bg-red-900 text-red-400 py-2 rounded-lg text-xs">Delete Lead</button>
        </div>
      )}
    </div>
  )
}
