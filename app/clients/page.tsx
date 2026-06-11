'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useWorkspace } from '../components/WorkspaceContext'

interface Client {
  id: string; name: string; company: string; email: string; phone: string
  service: string; type: string; monthlyValue: number; projectValue: number
  setupFee: number; status: string; startDate: string; notes: string
}

const SERVICES = ['GEO', 'SEO', 'website', 'software', 'other']
const blank = { name: '', company: '', email: '', phone: '', service: 'GEO', type: 'retainer', monthlyValue: 0, projectValue: 0, setupFee: 0, startDate: new Date().toISOString().split('T')[0], notes: '' }

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([])
  const [form, setForm] = useState(blank)
  const [adding, setAdding] = useState(false)
  const { workspace } = useWorkspace()

  async function load() {
    const res = await fetch(`/api/clients?workspace=${workspace}`)
    setClients(await res.json())
  }
  useEffect(() => { load() }, [workspace])

  async function addClient() {
    await fetch('/api/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, workspace }) })
    setForm(blank); setAdding(false); load()
  }

  async function toggleStatus(c: Client) {
    await fetch('/api/clients', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, status: c.status === 'active' ? 'inactive' : 'active' }) })
    load()
  }

  async function deleteClient(id: string) {
    await fetch('/api/clients', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    load()
  }

  const active = clients.filter(c => c.status === 'active')
  const mrr = active.filter(c => c.type === 'retainer').reduce((s, c) => s + Number(c.monthlyValue), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Clients</h2>
          <p className="text-gray-400 text-sm">{active.length} active &mdash; MRR: <span className="text-green-400 font-semibold">${mrr.toLocaleString()}</span></p>
        </div>
        <button onClick={() => setAdding(true)} className="bg-blue-800 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">+ Add Client</button>
      </div>

      {adding && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-5">
          <h3 className="font-semibold mb-4">New Client</h3>
          <div className="grid grid-cols-2 gap-3">
            {(['name', 'company', 'email', 'phone'] as const).map(f => (
              <input key={f} placeholder={f.charAt(0).toUpperCase() + f.slice(1)} value={String(form[f])} onChange={e => setForm({ ...form, [f]: e.target.value })} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-700" />
            ))}
            <select value={form.service} onChange={e => setForm({ ...form, service: e.target.value })} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-700">
              {SERVICES.map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-700">
              <option value="retainer">Retainer (monthly)</option>
              <option value="project">One-time project</option>
            </select>
            <input type="number" placeholder="Monthly value ($)" value={form.monthlyValue || ''} onChange={e => setForm({ ...form, monthlyValue: Number(e.target.value) })} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-700" />
            <input type="number" placeholder="Project value ($)" value={form.projectValue || ''} onChange={e => setForm({ ...form, projectValue: Number(e.target.value) })} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-700" />
            <input type="number" placeholder="Setup fee ($, optional)" value={form.setupFee || ''} onChange={e => setForm({ ...form, setupFee: Number(e.target.value) })} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-700" />
            <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-700" />
            <textarea placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="col-span-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none resize-none h-20" />
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={addClient} className="bg-blue-800 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">Save</button>
            <button onClick={() => { setAdding(false); setForm(blank) }} className="bg-gray-800 text-gray-400 px-4 py-2 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {clients.length === 0 ? (
          <p className="text-gray-500 p-6 text-sm">No clients yet. Add your first client above.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left p-4">Name</th>
                <th className="text-left p-4">Company</th>
                <th className="text-left p-4">Service</th>
                <th className="text-left p-4">Type</th>
                <th className="text-left p-4">Value</th>
                <th className="text-left p-4">Since</th>
                <th className="text-left p-4">Status</th>
                <th className="text-left p-4"></th>
              </tr>
            </thead>
            <tbody>
              {clients.map(c => (
                <tr key={c.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50">
                  <td className="p-4 font-medium">
                    <Link href={`/clients/${c.id}`} className="text-white hover:text-sky-400">{c.name}</Link>
                  </td>
                  <td className="p-4 text-gray-400">{c.company}</td>
                  <td className="p-4 text-gray-400">{c.service}</td>
                  <td className="p-4 text-gray-400 capitalize">{c.type}</td>
                  <td className="p-4 text-green-400 font-medium">
                    {c.type === 'retainer' ? `$${Number(c.monthlyValue).toLocaleString()}/mo` : `$${Number(c.projectValue).toLocaleString()}`}
                    {Number(c.setupFee) > 0 && <span className="text-xs text-gray-500 font-normal"> +${Number(c.setupFee).toLocaleString()} setup</span>}
                  </td>
                  <td className="p-4 text-gray-400 whitespace-nowrap">{c.startDate ? new Date(c.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${c.status === 'active' ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-500'}`}>{c.status}</span>
                  </td>
                  <td className="p-4 flex gap-2">
                    <button onClick={() => toggleStatus(c)} className="text-xs text-gray-500 hover:text-white">{c.status === 'active' ? 'Deactivate' : 'Activate'}</button>
                    <button onClick={() => deleteClient(c.id)} className="text-xs text-red-600 hover:text-red-400">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
