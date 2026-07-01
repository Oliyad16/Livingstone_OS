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

// Small inline icon set for KPI cards.
function StatIcon({ name }: { name: string }) {
  const p = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const icons: Record<string, React.ReactNode> = {
    clients: <svg {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h5" /></svg>,
    money: <svg {...p}><path d="M12 2v20M17 6.5c0-2-2.2-3-5-3s-5 1-5 3 2.5 2.8 5 3.5 5 1.5 5 3.5-2.2 3-5 3-5-1-5-3" /></svg>,
    leads: <svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /></svg>,
    spark: <svg {...p}><path d="m13 2-9 12h7l-1 8 9-12h-7z" /></svg>,
    touch: <svg {...p}><path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" /></svg>,
    check: <svg {...p}><path d="M20 6 9 17l-5-5" /></svg>,
    up: <svg {...p}><path d="M3 17 9 11l4 4 8-8M21 7v6M21 7h-6" /></svg>,
    down: <svg {...p}><path d="M3 7 9 13l4-4 8 8M21 17v-6M21 17h-6" /></svg>,
    doc: <svg {...p}><path d="M14 3v5h5M7 3h7l5 5v13H7z" /><path d="M10 13h6M10 17h6" /></svg>,
    target: <svg {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.2" /></svg>,
    clock: <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  }
  return <>{icons[name] ?? icons.spark}</>
}

type Tint = 'gold' | 'berry' | 'green' | 'red' | 'neutral'
const TINTS: Record<Tint, { bg: string; fg: string }> = {
  gold: { bg: 'rgba(154,119,35,0.10)', fg: '#9a7723' },
  berry: { bg: 'rgba(47,75,196,0.10)', fg: '#2f4bc4' },
  green: { bg: 'rgba(5,150,105,0.10)', fg: '#059669' },
  red: { bg: 'rgba(220,38,38,0.10)', fg: '#dc2626' },
  neutral: { bg: 'rgba(42,38,32,0.06)', fg: '#6b6457' },
}

function StatCard({ label, value, icon, tint = 'neutral' }: { label: string; value: string | number; icon: string; tint?: Tint }) {
  const t = TINTS[tint]
  return (
    <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800 card-hover">
      <div className="flex items-start justify-between mb-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: t.bg, color: t.fg }}>
          <StatIcon name={icon} />
        </span>
      </div>
      <p className="text-[2rem] leading-none font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-serif)' }}>{value}</p>
      <p className="text-xs text-gray-500 mt-2 font-medium">{label}</p>
    </div>
  )
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

  const privateStats: { label: string; value: string | number; icon: string; tint: Tint }[] = [
    { label: 'Active Clients', value: activeClients.length, icon: 'clients', tint: 'gold' },
    { label: 'MRR', value: `$${mrr.toLocaleString()}`, icon: 'money', tint: 'green' },
    { label: 'Total Leads', value: leads.length, icon: 'leads', tint: 'berry' },
    { label: 'New Leads This Week', value: newLeadsThisWeek, icon: 'spark', tint: 'gold' },
    { label: 'Touchpoints This Week', value: touchpointsThisWeek, icon: 'touch', tint: 'berry' },
    { label: 'Closed This Week', value: closedThisWeek, icon: 'check', tint: 'green' },
    { label: 'Total Revenue', value: `$${totalRevenue.toLocaleString()}`, icon: 'up', tint: 'green' },
    { label: 'Total Expenses', value: `$${totalExpenses.toLocaleString()}`, icon: 'down', tint: 'red' },
    { label: 'Post Drafts', value: draftPosts, icon: 'doc', tint: 'neutral' },
  ]

  const govStats: { label: string; value: string | number; icon: string; tint: Tint }[] = [
    { label: 'Open Pipeline', value: `$${govPipelineValue.toLocaleString()}`, icon: 'money', tint: 'gold' },
    { label: 'Open Opportunities', value: openOpps.length, icon: 'target', tint: 'berry' },
    { label: 'Due ≤ 7 days', value: dueSoon, icon: 'clock', tint: dueSoon > 0 ? 'red' : 'neutral' },
    { label: 'Win Rate', value: decided.length ? `${govWinRate}%` : '—', icon: 'check', tint: 'green' },
    { label: 'Total Opportunities', value: opps.length, icon: 'doc', tint: 'neutral' },
    { label: 'Active Clients', value: activeClients.length, icon: 'clients', tint: 'gold' },
    { label: 'Total Revenue', value: `$${totalRevenue.toLocaleString()}`, icon: 'up', tint: 'green' },
    { label: 'Total Expenses', value: `$${totalExpenses.toLocaleString()}`, icon: 'down', tint: 'red' },
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

  const maxStage = Math.max(1, ...pipelineStages.map(s => pipeline[s.key]))

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold text-white">Good morning, Oliyad.</h2>
          <div className="gold-divider my-3" />
          <p className="text-gray-500 text-sm">Here&apos;s where the business stands right now.</p>
        </div>
        <span className="text-xs text-gray-500 font-medium rounded-full border border-gray-800 bg-gray-900 px-3 py-1.5">{today}</span>
      </div>

      {!isGov && followups > 0 && (
        <Link href="/followups" className="block mb-8 rounded-2xl p-4 border border-amber-800 bg-amber-950 hover:brightness-[0.99] transition card-hover">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
                <StatIcon name="clock" />
              </span>
              <div>
                <p className="text-amber-300 font-semibold">{followups} lead{followups === 1 ? '' : 's'} need follow-up</p>
                <p className="text-amber-200 text-xs mt-0.5 opacity-80">No contact in 3+ days. Click to draft replies.</p>
              </div>
            </div>
            <span className="text-amber-400 text-sm font-semibold whitespace-nowrap">Review →</span>
          </div>
        </Link>
      )}

      {isGov && dueSoon > 0 && (
        <Link href="/opportunities" className="block mb-8 rounded-2xl p-4 border border-red-800 bg-red-950 hover:brightness-[0.99] transition card-hover">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/15 text-red-400">
                <StatIcon name="clock" />
              </span>
              <div>
                <p className="text-red-300 font-semibold">{dueSoon} opportunit{dueSoon === 1 ? 'y' : 'ies'} due within 7 days</p>
                <p className="text-red-200 text-xs mt-0.5 opacity-80">Solicitation deadlines approaching. Click to review.</p>
              </div>
            </div>
            <span className="text-red-400 text-sm font-semibold whitespace-nowrap">Review →</span>
          </div>
        </Link>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 mb-10">
        {stats.map(s => (
          <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} tint={s.tint} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Pipeline as a horizontal funnel */}
        <section className="lg:col-span-2">
          <h3 className="text-lg font-semibold mb-4 text-white">Pipeline</h3>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
            {pipelineStages.map(s => {
              const v = pipeline[s.key]
              const pct = Math.round((v / maxStage) * 100)
              const isLost = s.key === 'lost'
              return (
                <div key={s.key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-gray-400">{s.label}</span>
                    <span className="text-sm font-bold text-white">{v}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max(pct, v > 0 ? 6 : 0)}%`,
                        background: isLost
                          ? 'linear-gradient(90deg,#e7c2c2,#dc2626)'
                          : 'linear-gradient(90deg,#c9a961,#9a7723)',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Recent activity table */}
        <section className="lg:col-span-3">
          <h3 className="text-lg font-semibold mb-4 text-white">{isGov ? 'Closing Soon' : 'Recent Leads'}</h3>
          {isGov ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              {openOpps.length === 0 ? (
                <p className="text-gray-500 p-6 text-sm">No open opportunities. Add one in the Opportunities tab.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-800 text-gray-500 text-[11px] uppercase tracking-wide">
                    <tr>
                      <th className="text-left p-4 font-semibold">Title</th>
                      <th className="text-left p-4 font-semibold">Agency</th>
                      <th className="text-right p-4 font-semibold">Value</th>
                      <th className="text-left p-4 font-semibold">Due</th>
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
                          <tr key={o.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-950 transition-colors">
                            <td className="p-4 font-medium text-white">{o.title}</td>
                            <td className="p-4 text-gray-400">{o.agency}</td>
                            <td className="p-4 text-right text-gray-300 font-medium">{o.value ? `$${Number(o.value).toLocaleString()}` : '—'}</td>
                            <td className={`p-4 font-semibold ${cls}`}>{days < 0 ? 'past due' : `${days}d`}</td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              {leads.length === 0 ? (
                <p className="text-gray-500 p-6 text-sm">No leads yet. Add your first lead in the Leads tab.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-800 text-gray-500 text-[11px] uppercase tracking-wide">
                    <tr>
                      <th className="text-left p-4 font-semibold">Name</th>
                      <th className="text-left p-4 font-semibold">Company</th>
                      <th className="text-left p-4 font-semibold">Status</th>
                      <th className="text-right p-4 font-semibold">Touchpoints</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.slice(-5).reverse().map(l => (
                      <tr key={l.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-950 transition-colors">
                        <td className="p-4 font-medium text-white">{l.name}</td>
                        <td className="p-4 text-gray-400">{l.company}</td>
                        <td className="p-4">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-900 text-sky-300 capitalize">{l.status}</span>
                        </td>
                        <td className="p-4 text-right text-gray-400">{(l.touchpoints || []).length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
