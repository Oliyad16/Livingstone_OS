'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useWorkspace } from './components/WorkspaceContext'

interface Lead {
  id: string
  name: string
  company: string
  status: string
  touchpoints: { date: string }[]
  createdAt: string
}

interface Client {
  id: string
  name: string
  service: string
  type: string
  monthlyValue: number
  projectValue: number
  status: string
}

interface Financials {
  revenue: { id: string; amount: number; date: string; label: string }[]
  expenses: { id: string; amount: number; date: string; label: string }[]
}

interface Opp { id: string; title: string; agency: string; value: number; dueDate: string | null; stage: string }

function thisWeek(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  return d >= weekAgo && d <= now
}

export default function Overview() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [financials, setFinancials] = useState<Financials>({ revenue: [], expenses: [] })
  const [followups, setFollowups] = useState(0)
  const [draftPosts, setDraftPosts] = useState(0)
  const [opps, setOpps] = useState<Opp[]>([])
  const { workspace } = useWorkspace()
  const isGov = workspace === 'government'

  useEffect(() => {
    const w = `?workspace=${workspace}`
    // Fetch JSON, falling back to a default on any network/parse error so a
    // failed request can't leave an unhandled rejection or stale state.
    const load = <T,>(url: string, fallback: T): Promise<T> =>
      fetch(url).then(r => r.json()).catch(() => fallback)

    load<Client[]>(`/api/clients${w}`, []).then(d => setClients(Array.isArray(d) ? d : []))
    load<Financials>(`/api/financials${w}`, { revenue: [], expenses: [] }).then(setFinancials)
    if (isGov) {
      load<Opp[]>(`/api/opportunities${w}`, []).then(d => setOpps(Array.isArray(d) ? d : []))
    } else {
      load<Lead[]>(`/api/leads${w}`, []).then(d => setLeads(Array.isArray(d) ? d : []))
      load<{ count?: number }>(`/api/leads/followups${w}`, {}).then(j => setFollowups(j.count || 0))
      load<{ status: string }[]>(`/api/posts${w}`, []).then(p =>
        setDraftPosts(Array.isArray(p) ? p.filter(x => x.status === 'draft').length : 0))
    }
  }, [workspace, isGov])

  const activeClients = clients.filter(c => c.status === 'active')
  const mrr = activeClients.filter(c => c.type === 'retainer').reduce((s, c) => s + Number(c.monthlyValue), 0)
  const newLeadsThisWeek = leads.filter(l => thisWeek(l.createdAt)).length
  const touchpointsThisWeek = leads.reduce((s, l) => s + (l.touchpoints || []).filter(t => thisWeek(t.date)).length, 0)
  const closedThisWeek = leads.filter(l => l.status === 'closed' && thisWeek(l.createdAt)).length
  const totalRevenue = financials.revenue.reduce((s, r) => s + Number(r.amount), 0)
  const totalExpenses = financials.expenses.reduce((s, e) => s + Number(e.amount), 0)

  // Government capture metrics
  const openOpps = opps.filter(o => !['won', 'lost'].includes(o.stage))
  const govPipelineValue = openOpps.reduce((s, o) => s + Number(o.value), 0)
  const dueSoon = openOpps.filter(o => o.dueDate && (new Date(o.dueDate).getTime() - Date.now()) / 86400000 <= 7).length
  const decided = opps.filter(o => ['won', 'lost'].includes(o.stage))
  const govWinRate = decided.length ? Math.round((opps.filter(o => o.stage === 'won').length / decided.length) * 100) : 0

  const privatePipeline: Record<string, number> = { new: 0, contacted: 0, qualified: 0, proposal: 0, closed: 0, lost: 0 }
  leads.forEach(l => { if (privatePipeline[l.status] !== undefined) privatePipeline[l.status]++ })

  const govPipeline: Record<string, number> = { identified: 0, qualified: 0, bid: 0, submitted: 0, won: 0, lost: 0 }
  opps.forEach(o => { if (govPipeline[o.stage] !== undefined) govPipeline[o.stage]++ })

  const privateStats = [
    { label: 'Active Clients', value: activeClients.length },
    { label: 'MRR', value: `$${mrr.toLocaleString()}` },
    { label: 'Total Leads', value: leads.length },
    { label: 'New Leads This Week', value: newLeadsThisWeek },
    { label: 'Touchpoints This Week', value: touchpointsThisWeek },
    { label: 'Closed This Week', value: closedThisWeek },
    { label: 'Total Revenue', value: `$${totalRevenue.toLocaleString()}` },
    { label: 'Total Expenses', value: `$${totalExpenses.toLocaleString()}` },
    { label: 'Post Drafts', value: draftPosts },
  ]

  const govStats = [
    { label: 'Open Pipeline', value: `$${govPipelineValue.toLocaleString()}` },
    { label: 'Open Opportunities', value: openOpps.length },
    { label: 'Due ≤ 7 days', value: dueSoon },
    { label: 'Win Rate', value: decided.length ? `${govWinRate}%` : '—' },
    { label: 'Total Opportunities', value: opps.length },
    { label: 'Active Clients', value: activeClients.length },
    { label: 'Total Revenue', value: `$${totalRevenue.toLocaleString()}` },
    { label: 'Total Expenses', value: `$${totalExpenses.toLocaleString()}` },
  ]

  const stats = isGov ? govStats : privateStats
  const pipeline = isGov ? govPipeline : privatePipeline

  const pipelineStages = isGov
    ? [
        { key: 'identified', label: 'Identified' },
        { key: 'qualified', label: 'Qualified' },
        { key: 'bid', label: 'Bid' },
        { key: 'submitted', label: 'Submitted' },
        { key: 'won', label: 'Won' },
        { key: 'lost', label: 'Lost' },
      ]
    : [
        { key: 'new', label: 'New' },
        { key: 'contacted', label: 'Contacted' },
        { key: 'qualified', label: 'Qualified' },
        { key: 'proposal', label: 'Proposal Sent' },
        { key: 'closed', label: 'Closed' },
        { key: 'lost', label: 'Lost' },
      ]

  return (
    <div>
      <h2 className="text-2xl font-bold mb-1">Good morning, Olyad.</h2>
      <p className="text-gray-400 mb-8 text-sm">Here&apos;s where the business stands right now.</p>

      {!isGov && followups > 0 && (
        <Link href="/followups" className="block mb-8 bg-amber-950/40 border border-amber-800/60 rounded-xl p-4 hover:bg-amber-950/60 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-amber-300 font-semibold">{followups} lead{followups === 1 ? '' : 's'} need follow-up</p>
              <p className="text-amber-200/60 text-xs mt-0.5">No contact in 3+ days. Click to draft replies.</p>
            </div>
            <span className="text-amber-400 text-sm">Review →</span>
          </div>
        </Link>
      )}

      {isGov && dueSoon > 0 && (
        <Link href="/opportunities" className="block mb-8 bg-red-950/40 border border-red-800/60 rounded-xl p-4 hover:bg-red-950/60 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-300 font-semibold">{dueSoon} opportunit{dueSoon === 1 ? 'y' : 'ies'} due within 7 days</p>
              <p className="text-red-200/60 text-xs mt-0.5">Solicitation deadlines approaching. Click to review.</p>
            </div>
            <span className="text-red-400 text-sm">Review →</span>
          </div>
        </Link>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {stats.map(s => (
          <div key={s.label} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      <h3 className="text-lg font-semibold mb-4">Pipeline</h3>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-10">
        {pipelineStages.map(s => (
          <div key={s.key} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-sky-400">{pipeline[s.key]}</p>
            <p className="text-xs text-gray-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {isGov ? (
        <>
          <h3 className="text-lg font-semibold mb-4">Closing Soon</h3>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {openOpps.length === 0 ? (
              <p className="text-gray-500 p-6 text-sm">No open opportunities. Add one in the Opportunities tab.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="text-left p-4">Title</th>
                    <th className="text-left p-4">Agency</th>
                    <th className="text-right p-4">Value</th>
                    <th className="text-left p-4">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {[...openOpps]
                    .filter(o => o.dueDate)
                    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
                    .slice(0, 5)
                    .map(o => {
                      const days = Math.ceil((new Date(o.dueDate!).getTime() - Date.now()) / 86400000)
                      const cls = days <= 7 ? 'text-red-400' : days <= 21 ? 'text-amber-400' : 'text-gray-400'
                      return (
                        <tr key={o.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50">
                          <td className="p-4 font-medium">{o.title}</td>
                          <td className="p-4 text-gray-400">{o.agency}</td>
                          <td className="p-4 text-right text-gray-300">{o.value ? `$${Number(o.value).toLocaleString()}` : '—'}</td>
                          <td className={`p-4 ${cls}`}>{days < 0 ? 'past due' : `${days}d`}</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : (
        <>
          <h3 className="text-lg font-semibold mb-4">Recent Leads</h3>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {leads.length === 0 ? (
              <p className="text-gray-500 p-6 text-sm">No leads yet. Add your first lead in the Leads tab.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="text-left p-4">Name</th>
                    <th className="text-left p-4">Company</th>
                    <th className="text-left p-4">Status</th>
                    <th className="text-left p-4">Touchpoints</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.slice(-5).reverse().map(l => (
                    <tr key={l.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50">
                      <td className="p-4 font-medium">{l.name}</td>
                      <td className="p-4 text-gray-400">{l.company}</td>
                      <td className="p-4">
                        <span className="px-2 py-0.5 rounded-full text-xs bg-blue-900 text-sky-300 capitalize">{l.status}</span>
                      </td>
                      <td className="p-4 text-gray-400">{(l.touchpoints || []).length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
