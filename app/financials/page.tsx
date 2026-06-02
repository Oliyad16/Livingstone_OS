'use client'
import { useEffect, useState } from 'react'
import { useWorkspace } from '../components/WorkspaceContext'

interface Entry { id: string; label: string; amount: number; date: string; category?: string; source?: string }
interface Financials { revenue: Entry[]; expenses: Entry[] }

const blank = { label: '', amount: 0, date: new Date().toISOString().split('T')[0], category: '' }

export default function Financials() {
  const [data, setData] = useState<Financials>({ revenue: [], expenses: [] })
  const [form, setForm] = useState(blank)
  const [kind, setKind] = useState<'revenue' | 'expense'>('revenue')
  const [adding, setAdding] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const { workspace } = useWorkspace()

  async function load() {
    const res = await fetch(`/api/financials?workspace=${workspace}`)
    setData(await res.json())
  }
  useEffect(() => { load() }, [workspace])

  async function syncStripe() {
    setSyncing(true); setSyncMsg('')
    try {
      const res = await fetch('/api/financials/sync-stripe', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { setSyncMsg(json.error || 'Sync failed.'); return }
      setSyncMsg(`Synced ${json.synced} payment${json.synced === 1 ? '' : 's'} from Stripe.`)
      await load()
    } catch {
      setSyncMsg('Sync failed — check the dev server logs.')
    } finally {
      setSyncing(false)
    }
  }

  async function addEntry() {
    await fetch('/api/financials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, kind, workspace }) })
    setForm(blank); setAdding(false); load()
  }

  async function deleteEntry(id: string, entryKind: string) {
    await fetch('/api/financials', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, kind: entryKind }) })
    load()
  }

  const totalRevenue = data.revenue.reduce((s, e) => s + Number(e.amount), 0)
  const totalExpenses = data.expenses.reduce((s, e) => s + Number(e.amount), 0)
  const profit = totalRevenue - totalExpenses

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Financials</h2>
          <p className="text-gray-400 text-sm">Track revenue and spending</p>
        </div>
        <div className="flex items-center gap-3">
          {syncMsg && <span className="text-xs text-gray-400">{syncMsg}</span>}
          <button onClick={syncStripe} disabled={syncing} className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium border border-gray-700">{syncing ? 'Syncing…' : 'Sync Stripe'}</button>
          <button onClick={() => setAdding(true)} className="bg-blue-800 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">+ Add Entry</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-1">Total Revenue</p>
          <p className="text-2xl font-bold text-green-400">${totalRevenue.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-1">Total Expenses</p>
          <p className="text-2xl font-bold text-red-400">${totalExpenses.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-1">Net Profit</p>
          <p className={`text-2xl font-bold ${profit >= 0 ? 'text-white' : 'text-red-400'}`}>${profit.toLocaleString()}</p>
        </div>
      </div>

      {adding && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-6">
          <div className="flex gap-2 mb-4">
            <button onClick={() => setKind('revenue')} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${kind === 'revenue' ? 'bg-green-700 text-white' : 'bg-gray-800 text-gray-400'}`}>Revenue</button>
            <button onClick={() => setKind('expense')} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${kind === 'expense' ? 'bg-red-800 text-white' : 'bg-gray-800 text-gray-400'}`}>Expense</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Label (e.g. GEO retainer - Acme)" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-700" />
            <input type="number" placeholder="Amount ($)" value={form.amount || ''} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-700" />
            <input placeholder="Category (e.g. software, ads, tools)" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-700" />
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-700" />
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={addEntry} className="bg-blue-800 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">Save</button>
            <button onClick={() => { setAdding(false); setForm(blank) }} className="bg-gray-800 text-gray-400 px-4 py-2 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-semibold text-green-400 mb-3 uppercase tracking-wider">Revenue</h3>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {data.revenue.length === 0 ? (
              <p className="text-gray-500 p-5 text-sm">No revenue entries yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                  <tr><th className="text-left p-3">Label</th><th className="text-left p-3">Amount</th><th className="text-left p-3">Date</th><th></th></tr>
                </thead>
                <tbody>
                  {[...data.revenue].reverse().map(e => (
                    <tr key={e.id} className="border-b border-gray-800 last:border-0">
                      <td className="p-3">
                        {e.label}
                        {e.source === 'stripe' && <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-blue-900 text-sky-300 align-middle">Stripe</span>}
                      </td>
                      <td className="p-3 text-green-400 font-medium">${Number(e.amount).toLocaleString()}</td>
                      <td className="p-3 text-gray-400">{e.date}</td>
                      <td className="p-3">{e.source === 'stripe' ? <span className="text-xs text-gray-700">auto</span> : <button onClick={() => deleteEntry(e.id, 'revenue')} className="text-xs text-red-600 hover:text-red-400">x</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-red-400 mb-3 uppercase tracking-wider">Expenses</h3>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {data.expenses.length === 0 ? (
              <p className="text-gray-500 p-5 text-sm">No expenses yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                  <tr><th className="text-left p-3">Label</th><th className="text-left p-3">Amount</th><th className="text-left p-3">Date</th><th></th></tr>
                </thead>
                <tbody>
                  {[...data.expenses].reverse().map(e => (
                    <tr key={e.id} className="border-b border-gray-800 last:border-0">
                      <td className="p-3">{e.label}</td>
                      <td className="p-3 text-red-400 font-medium">${Number(e.amount).toLocaleString()}</td>
                      <td className="p-3 text-gray-400">{e.date}</td>
                      <td className="p-3"><button onClick={() => deleteEntry(e.id, 'expense')} className="text-xs text-red-600 hover:text-red-400">x</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
