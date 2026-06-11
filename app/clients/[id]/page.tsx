'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface Client {
  id: string; name: string; company: string; email: string; phone: string
  service: string; type: string; status: string; notes: string
  monthlyValue: number; projectValue: number; startDate: string; ga4PropertyId: string | null
  setupFee: number; billingDay: number | null; contractMonths: number
  contractEnd: string | null; stripeCustomerId: string | null
}
interface Installment {
  id: string; clientId: string; label: string; amount: number
  dueDate: string | null; status: string; paidAt: string | null; notes: string
}
interface StripeData {
  connected: boolean; matched?: boolean; error?: string
  suggestedCustomerId?: string | null
  customer?: { id: string; email: string | null; name: string | null }
  subscription?: { status: string; amount: number; interval: string; currentPeriodEnd: string | null } | null
  totals?: { paid: number; openBalance: number }
  invoices?: { id: string; number: string | null; status: string | null; amountDue: number; amountPaid: number; date: string; url: string | null }[]
}
interface Property { id: string; name: string; account: string }
interface Delta { current: number; prior: number; deltaPct: number | null }
interface Report {
  range: { start: string; end: string }
  totals: Record<string, Delta>
  byChannel: { channel: string; sessions: number; conversions: number }[]
  geo: { organicSessions: Delta; aiSessions: Delta; aiBreakdown: { source: string; sessions: number }[] }
}

const SERVICES = ['GEO', 'SEO', 'website', 'software', 'other']
const money = (n: number) => `$${Number(n || 0).toLocaleString()}`
const dateFmt = (d: string | null) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

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

const inputCls = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-700 w-full'

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>()
  const [client, setClient] = useState<Client | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Partial<Client>>({})
  const [saving, setSaving] = useState(false)
  const [installments, setInstallments] = useState<Installment[]>([])
  const [addingInst, setAddingInst] = useState(false)
  const [instForm, setInstForm] = useState({ label: '', amount: '', dueDate: '' })
  const [stripeData, setStripeData] = useState<StripeData | null>(null)
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
  async function loadInstallments() {
    const res = await fetch(`/api/clients/${id}/installments`)
    if (res.ok) setInstallments(await res.json())
  }
  useEffect(() => {
    loadClient()
    loadInstallments()
    fetch(`/api/clients/${id}/stripe`).then(r => r.json()).then(setStripeData).catch(() => {})
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

  function startEdit() {
    if (!client) return
    setDraft({ ...client, startDate: client.startDate ? client.startDate.split('T')[0] : '', contractEnd: client.contractEnd ? client.contractEnd.split('T')[0] : '' })
    setEditing(true)
  }
  async function saveEdit() {
    if (!client) return
    setSaving(true)
    await fetch('/api/clients', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...draft, id: client.id,
        billingDay: draft.billingDay ? Number(draft.billingDay) : null,
        contractMonths: Number(draft.contractMonths) || 0,
        contractEnd: draft.contractEnd || null,
        monthlyValue: Number(draft.monthlyValue) || 0,
        projectValue: Number(draft.projectValue) || 0,
        setupFee: Number(draft.setupFee) || 0,
      }),
    })
    setSaving(false); setEditing(false)
    loadClient()
  }

  async function addInstallment() {
    if (!instForm.amount) return
    await fetch(`/api/clients/${id}/installments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: instForm.label, amount: Number(instForm.amount), dueDate: instForm.dueDate || null }),
    })
    setInstForm({ label: '', amount: '', dueDate: '' }); setAddingInst(false)
    loadInstallments()
  }
  async function togglePaid(inst: Installment) {
    await fetch(`/api/clients/${id}/installments`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: inst.id, status: inst.status === 'paid' ? 'pending' : 'paid' }),
    })
    loadInstallments()
  }
  async function deleteInstallment(instId: string) {
    await fetch(`/api/clients/${id}/installments`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: instId }),
    })
    loadInstallments()
  }
  async function linkStripeCustomer(customerId: string) {
    if (!client) return
    await fetch('/api/clients', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: client.id, stripeCustomerId: customerId }),
    })
    loadClient()
    fetch(`/api/clients/${id}/stripe`).then(r => r.json()).then(setStripeData).catch(() => {})
  }

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

  // Payment plan math. Overdue is derived, never stored.
  const today = new Date().toISOString().split('T')[0]
  const scheduled = installments.reduce((s, i) => s + Number(i.amount), 0)
  const collected = installments.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0)
  const overdue = installments.filter(i => i.status === 'pending' && i.dueDate && i.dueDate.split('T')[0] < today)
  const nextDue = installments.find(i => i.status === 'pending' && i.dueDate && i.dueDate.split('T')[0] >= today)
  const dealValue = client.type === 'retainer'
    ? Number(client.setupFee) + Number(client.monthlyValue) * (client.contractMonths || 1)
    : Number(client.setupFee) + Number(client.projectValue)

  return (
    <div>
      <Link href="/clients" className="text-gray-500 hover:text-white text-sm">← Clients</Link>

      <div className="flex items-start justify-between mt-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold">{client.name}</h2>
          <p className="text-gray-400 text-sm">{client.company}</p>
        </div>
        <div className="flex items-center gap-3">
          {!editing && <button onClick={startEdit} className="bg-blue-800 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium">Edit</button>}
          <span className={`px-2.5 py-1 rounded-full text-xs capitalize ${client.status === 'active' ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-400'}`}>{client.status}</span>
        </div>
      </div>

      {/* ===== Edit form ===== */}
      {editing ? (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-8">
          <h3 className="font-semibold mb-4">Edit Client</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {([['name', 'Name'], ['company', 'Company'], ['email', 'Email'], ['phone', 'Phone']] as const).map(([f, label]) => (
              <div key={f}>
                <label className="text-xs text-gray-500 block mb-1">{label}</label>
                <input value={String(draft[f] ?? '')} onChange={e => setDraft({ ...draft, [f]: e.target.value })} className={inputCls} />
              </div>
            ))}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Service</label>
              <select value={draft.service} onChange={e => setDraft({ ...draft, service: e.target.value })} className={inputCls}>
                {SERVICES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Deal type</label>
              <select value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })} className={inputCls}>
                <option value="retainer">Retainer (monthly)</option>
                <option value="project">One-time project</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Status</label>
              <select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })} className={inputCls}>
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Start date</label>
              <input type="date" value={String(draft.startDate ?? '')} onChange={e => setDraft({ ...draft, startDate: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Monthly retainer ($)</label>
              <input type="number" value={draft.monthlyValue ?? 0} onChange={e => setDraft({ ...draft, monthlyValue: Number(e.target.value) })} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Project value ($)</label>
              <input type="number" value={draft.projectValue ?? 0} onChange={e => setDraft({ ...draft, projectValue: Number(e.target.value) })} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Setup fee ($)</label>
              <input type="number" value={draft.setupFee ?? 0} onChange={e => setDraft({ ...draft, setupFee: Number(e.target.value) })} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Billing day (1–28)</label>
              <input type="number" min={1} max={28} value={draft.billingDay ?? ''} onChange={e => setDraft({ ...draft, billingDay: e.target.value ? Number(e.target.value) : null })} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Contract length (months, 0 = month-to-month)</label>
              <input type="number" min={0} value={draft.contractMonths ?? 0} onChange={e => setDraft({ ...draft, contractMonths: Number(e.target.value) })} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Contract end / renewal</label>
              <input type="date" value={String(draft.contractEnd ?? '')} onChange={e => setDraft({ ...draft, contractEnd: e.target.value })} className={inputCls} />
            </div>
            <div className="col-span-2 md:col-span-3">
              <label className="text-xs text-gray-500 block mb-1">Notes</label>
              <textarea value={String(draft.notes ?? '')} onChange={e => setDraft({ ...draft, notes: e.target.value })} className={`${inputCls} resize-none h-20`} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={saveEdit} disabled={saving} className="bg-blue-800 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">{saving ? 'Saving…' : 'Save changes'}</button>
            <button onClick={() => setEditing(false)} className="bg-gray-800 text-gray-400 px-4 py-2 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      ) : (
        <>
          {/* Profile */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4"><p className="text-xs text-gray-500 mb-1">Service</p><p className="font-semibold">{client.service || '—'}</p></div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4"><p className="text-xs text-gray-500 mb-1">Type</p><p className="font-semibold capitalize">{client.type}</p></div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4"><p className="text-xs text-gray-500 mb-1">{client.type === 'retainer' ? 'Monthly' : 'Project'}</p><p className="font-semibold">{money(client.type === 'retainer' ? client.monthlyValue : client.projectValue)}</p></div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4"><p className="text-xs text-gray-500 mb-1">Since</p><p className="font-semibold">{dateFmt(client.startDate)}</p></div>
          </div>

          {(client.email || client.phone || client.notes) && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-8 text-sm space-y-1">
              {client.email && <p className="text-gray-400">{client.email}</p>}
              {client.phone && <p className="text-gray-400">{client.phone}</p>}
              {client.notes && <p className="text-gray-400 mt-2">{client.notes}</p>}
            </div>
          )}
        </>
      )}

      {/* ===== Payment plan ===== */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">Payment Plan</h3>
        <button onClick={() => setAddingInst(true)} className="text-xs text-sky-400 hover:text-sky-300">+ Add installment</button>
      </div>

      {/* Terms strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Deal structure</p>
          <p className="font-semibold text-sm">
            {Number(client.setupFee) > 0 && <>{money(client.setupFee)} setup<br /></>}
            {client.type === 'retainer'
              ? <>{money(client.monthlyValue)}/mo{client.billingDay ? ` · bills day ${client.billingDay}` : ''}</>
              : <>{money(client.projectValue)} project</>}
          </p>
          {client.type === 'retainer' && (
            <p className="text-xs text-gray-600 mt-0.5">
              {client.contractMonths ? `${client.contractMonths}-month term` : 'month-to-month'}
              {client.contractEnd ? ` · renews ${dateFmt(client.contractEnd)}` : ''}
            </p>
          )}
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">{client.type === 'retainer' ? 'Contract value' : 'Total deal value'}</p>
          <p className="text-xl font-bold">{money(dealValue)}</p>
          {client.type === 'retainer' && !client.contractMonths && <p className="text-xs text-gray-600 mt-0.5">1 month shown (open-ended)</p>}
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Collected (schedule)</p>
          <p className="text-xl font-bold text-green-400">{money(collected)}</p>
          <p className="text-xs text-gray-600 mt-0.5">of {money(scheduled)} scheduled</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">{overdue.length ? 'Overdue' : 'Next due'}</p>
          {overdue.length ? (
            <>
              <p className="text-xl font-bold text-red-400">{money(overdue.reduce((s, i) => s + Number(i.amount), 0))}</p>
              <p className="text-xs text-red-400 mt-0.5">{overdue.length} installment{overdue.length > 1 ? 's' : ''} late</p>
            </>
          ) : nextDue ? (
            <>
              <p className="text-xl font-bold">{money(nextDue.amount)}</p>
              <p className="text-xs text-gray-600 mt-0.5">{dateFmt(nextDue.dueDate)}{nextDue.label ? ` · ${nextDue.label}` : ''}</p>
            </>
          ) : (
            <p className="text-sm text-gray-500 mt-1">Nothing scheduled</p>
          )}
        </div>
      </div>

      {/* Add installment form */}
      {addingInst && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input placeholder="Label (e.g. 50% deposit)" value={instForm.label} onChange={e => setInstForm({ ...instForm, label: e.target.value })} className={inputCls} />
            <input type="number" placeholder="Amount ($)" value={instForm.amount} onChange={e => setInstForm({ ...instForm, amount: e.target.value })} className={inputCls} />
            <input type="date" value={instForm.dueDate} onChange={e => setInstForm({ ...instForm, dueDate: e.target.value })} className={inputCls} />
            <div className="flex gap-2">
              <button onClick={addInstallment} className="bg-blue-800 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">Add</button>
              <button onClick={() => setAddingInst(false)} className="bg-gray-800 text-gray-400 px-3 py-2 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Installment schedule */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-8">
        {installments.length === 0 ? (
          <p className="text-gray-500 p-5 text-sm">No installments yet. Add a schedule above (e.g. &ldquo;50% deposit&rdquo;, &ldquo;25% at design approval&rdquo;) or rely on the monthly retainer + Stripe history below.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left p-3">Installment</th>
                <th className="text-left p-3">Amount</th>
                <th className="text-left p-3">Due</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3"></th>
              </tr>
            </thead>
            <tbody>
              {installments.map(inst => {
                const isOverdue = inst.status === 'pending' && inst.dueDate && inst.dueDate.split('T')[0] < today
                return (
                  <tr key={inst.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50">
                    <td className="p-3 font-medium">{inst.label || 'Installment'}</td>
                    <td className="p-3">{money(inst.amount)}</td>
                    <td className="p-3 text-gray-400 whitespace-nowrap">{dateFmt(inst.dueDate)}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${inst.status === 'paid' ? 'bg-green-900 text-green-300' : isOverdue ? 'bg-red-900 text-red-300' : 'bg-gray-800 text-gray-400'}`}>
                        {inst.status === 'paid' ? `paid ${inst.paidAt ? dateFmt(inst.paidAt) : ''}` : isOverdue ? 'overdue' : 'pending'}
                      </span>
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <button onClick={() => togglePaid(inst)} className="text-xs text-gray-500 hover:text-white mr-3">{inst.status === 'paid' ? 'Mark unpaid' : 'Mark paid'}</button>
                      <button onClick={() => deleteInstallment(inst.id)} className="text-xs text-red-600 hover:text-red-400">Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ===== Stripe payment history ===== */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">Stripe Payments</h3>
        {stripeData?.matched && stripeData.customer && (
          <span className="text-xs text-gray-500">customer {stripeData.customer.id}</span>
        )}
      </div>
      {!stripeData ? (
        <p className="text-gray-500 text-sm mb-8">Loading Stripe…</p>
      ) : !stripeData.connected ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-8"><p className="text-gray-400 text-sm">{stripeData.error || 'Stripe is not connected.'}</p></div>
      ) : !stripeData.matched ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-8">
          <p className="text-gray-400 text-sm">No Stripe customer found for {client.email || 'this client'}. Once they pay through Stripe, history appears here automatically.</p>
        </div>
      ) : (
        <div className="mb-8">
          {stripeData.suggestedCustomerId && (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 mb-4 flex items-center justify-between">
              <p className="text-sm text-gray-400">Matched by email to Stripe customer <span className="text-white font-medium">{stripeData.suggestedCustomerId}</span> — link it to this client?</p>
              <button onClick={() => linkStripeCustomer(stripeData.suggestedCustomerId!)} className="bg-blue-800 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium ml-3 whitespace-nowrap">Link customer</button>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Lifetime paid</p>
              <p className="text-xl font-bold text-green-400">{money(stripeData.totals?.paid || 0)}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Open balance</p>
              <p className={`text-xl font-bold ${stripeData.totals?.openBalance ? 'text-red-400' : ''}`}>{money(stripeData.totals?.openBalance || 0)}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Subscription</p>
              {stripeData.subscription ? (
                <>
                  <p className="text-xl font-bold">{money(stripeData.subscription.amount)}<span className="text-sm font-normal text-gray-500">/{stripeData.subscription.interval}</span></p>
                  <p className="text-xs text-gray-600 mt-0.5 capitalize">{stripeData.subscription.status}{stripeData.subscription.currentPeriodEnd ? ` · renews ${dateFmt(stripeData.subscription.currentPeriodEnd)}` : ''}</p>
                </>
              ) : <p className="text-sm text-gray-500 mt-1">None active</p>}
            </div>
          </div>
          {(stripeData.invoices?.length || 0) > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                  <tr><th className="text-left p-3">Invoice</th><th className="text-left p-3">Date</th><th className="text-left p-3">Amount</th><th className="text-left p-3">Status</th></tr>
                </thead>
                <tbody>
                  {stripeData.invoices!.map(inv => (
                    <tr key={inv.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50">
                      <td className="p-3 font-medium">{inv.url ? <a href={inv.url} target="_blank" rel="noreferrer" className="hover:text-sky-400">{inv.number || inv.id}</a> : (inv.number || inv.id)}</td>
                      <td className="p-3 text-gray-400">{dateFmt(inv.date)}</td>
                      <td className="p-3">{money(inv.amountPaid || inv.amountDue)}</td>
                      <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs capitalize ${inv.status === 'paid' ? 'bg-green-900 text-green-300' : inv.status === 'open' ? 'bg-red-900 text-red-300' : 'bg-gray-800 text-gray-400'}`}>{inv.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
