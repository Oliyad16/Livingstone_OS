'use client'
import { useEffect, useState } from 'react'
import { useWorkspace } from '../components/WorkspaceContext'

interface Lead {
  id: string; name: string; company: string; email: string; service: string
  status: string; source: string; daysSince: number
}
interface Draft { subject: string; body: string; email: string }
interface OutboxRow {
  id: string; leadId: string | null; toEmail: string; subject: string; body: string
  status: string; error: string | null; createdAt: string; sentAt: string | null
}

export default function Followups() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [staleDays, setStaleDays] = useState(3)
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [draftLoading, setDraftLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [queueing, setQueueing] = useState(false)
  const [queued, setQueued] = useState('')
  const [outbox, setOutbox] = useState<OutboxRow[]>([])
  const [editingDraft, setEditingDraft] = useState<string | null>(null)
  const [draftEdits, setDraftEdits] = useState<{ subject: string; body: string }>({ subject: '', body: '' })
  const [preparing, setPreparing] = useState(false)
  const [prepareMsg, setPrepareMsg] = useState('')
  const { workspace } = useWorkspace()

  async function load() {
    setLoading(true)
    const [fRes, oRes] = await Promise.all([
      fetch(`/api/leads/followups?workspace=${workspace}`),
      fetch('/api/outbox'),
    ])
    const json = await fRes.json()
    setLeads(json.leads || [])
    setStaleDays(json.staleDays || 3)
    const oJson = await oRes.json()
    setOutbox(Array.isArray(oJson) ? oJson : [])
    setLoading(false)
  }
  useEffect(() => { load() }, [workspace])

  async function prepareDrafts() {
    setPreparing(true); setPrepareMsg('')
    const res = await fetch(`/api/leads/followups/prepare?workspace=${workspace}`, { method: 'POST' })
    const j = await res.json()
    setPreparing(false)
    setPrepareMsg(j.prepared > 0 ? `${j.prepared} draft${j.prepared > 1 ? 's' : ''} prepared` : 'Nothing new to draft')
    setTimeout(() => setPrepareMsg(''), 4000)
    load()
  }

  async function approveDraft(row: OutboxRow) {
    const edits = editingDraft === row.id ? draftEdits : { subject: row.subject, body: row.body }
    await fetch('/api/outbox', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: row.id, ...edits, status: 'queued' }),
    })
    setEditingDraft(null); load()
  }

  async function rejectDraft(row: OutboxRow) {
    await fetch('/api/outbox', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: row.id }),
    })
    setEditingDraft(null); load()
  }

  const pendingApproval = outbox.filter(o => o.status === 'draft')
  const awaitingSend = outbox.filter(o => o.status === 'queued')

  async function openDraft(lead: Lead) {
    if (openId === lead.id) { setOpenId(null); setDraft(null); return }
    setOpenId(lead.id); setDraft(null); setDraftLoading(true); setCopied(false)
    const res = await fetch('/api/leads/draft', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: lead.id }),
    })
    setDraft(await res.json()); setDraftLoading(false)
  }

  async function copyDraft() {
    if (!draft) return
    await navigator.clipboard.writeText(draft.body)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  function openInEmail() {
    if (!draft) return
    const to = encodeURIComponent(draft.email)
    const subject = encodeURIComponent(draft.subject)
    const body = encodeURIComponent(draft.body)
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`
  }

  async function logContacted(lead: Lead) {
    await fetch('/api/leads/touchpoint', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: lead.id, type: 'email', notes: 'Follow-up sent (from queue)' }),
    })
    setOpenId(null); setDraft(null); load()
  }

  async function queueForGmail(lead: Lead) {
    if (!draft || !draft.email) return
    setQueueing(true)
    await fetch('/api/outbox', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: lead.id, toEmail: draft.email, subject: draft.subject, body: draft.body }),
    })
    setQueueing(false); setQueued(lead.id); setTimeout(() => setQueued(''), 4000)
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Follow-ups</h2>
          <p className="text-gray-400 text-sm">
            Active leads with no contact in {staleDays}+ days. Drafts are written automatically — you approve, the engine sends.
          </p>
          <p className="text-gray-600 text-xs mt-1">
            Approved emails send via the scheduled <code className="text-gray-500">send-outbox</code> job (or run <code className="text-gray-500">npm run send-outbox</code>) and auto-log the touchpoint.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {prepareMsg && <span className="text-xs text-green-400">{prepareMsg}</span>}
          <button onClick={prepareDrafts} disabled={preparing} className="bg-blue-800 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
            {preparing ? 'Drafting…' : 'Draft all stale leads'}
          </button>
        </div>
      </div>

      {/* ===== Approval queue: auto-drafted emails waiting for the human gate ===== */}
      {pendingApproval.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-3">Awaiting your approval <span className="text-sm font-normal text-amber-400">({pendingApproval.length})</span></h3>
          <div className="space-y-3">
            {pendingApproval.map(row => {
              const lead = leads.find(l => l.id === row.leadId)
              const isEditing = editingDraft === row.id
              return (
                <div key={row.id} className="bg-gray-900 border border-gray-700 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">{lead ? `${lead.name}${lead.company ? ` · ${lead.company}` : ''}` : row.toEmail}</p>
                    <span className="text-xs text-gray-500">{row.toEmail}</span>
                  </div>
                  {isEditing ? (
                    <>
                      <input
                        value={draftEdits.subject}
                        onChange={e => setDraftEdits({ ...draftEdits, subject: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white mb-2 focus:outline-none focus:border-blue-700"
                      />
                      <textarea
                        value={draftEdits.body}
                        onChange={e => setDraftEdits({ ...draftEdits, body: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white h-48 resize-y focus:outline-none focus:border-blue-700 font-mono leading-relaxed"
                      />
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-gray-300 font-medium mb-1">{row.subject}</p>
                      <p className="text-xs text-gray-500 whitespace-pre-line line-clamp-4">{row.body}</p>
                    </>
                  )}
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => approveDraft(row)} className="bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium">
                      Approve &amp; send
                    </button>
                    {isEditing ? (
                      <button onClick={() => setEditingDraft(null)} className="bg-gray-800 text-gray-400 px-3 py-1.5 rounded-lg text-sm">Cancel edit</button>
                    ) : (
                      <button onClick={() => { setEditingDraft(row.id); setDraftEdits({ subject: row.subject, body: row.body }) }} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white px-3 py-1.5 rounded-lg text-sm">
                        Edit first
                      </button>
                    )}
                    <button onClick={() => rejectDraft(row)} className="text-red-600 hover:text-red-400 px-3 py-1.5 text-sm ml-auto">Reject</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {awaitingSend.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-8">
          <p className="text-sm text-gray-400">
            <span className="text-green-400 font-medium">{awaitingSend.length} approved</span> — sending on the next outbox run ({awaitingSend.map(o => o.toEmail).join(', ')})
          </p>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : leads.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-300 font-medium">You&apos;re all caught up.</p>
          <p className="text-gray-500 text-sm mt-1">No leads need follow-up right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leads.map(l => (
            <div key={l.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{l.name}</p>
                    {l.company && <span className="text-gray-500 text-sm truncate">· {l.company}</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 capitalize">
                    {l.service || 'general'} · {l.status} ·
                    <span className="text-amber-400 ml-1">{l.daysSince} days since contact</span>
                  </p>
                </div>
                <button onClick={() => openDraft(l)} className="shrink-0 bg-blue-800 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium">
                  {openId === l.id ? 'Hide draft' : 'Draft follow-up'}
                </button>
              </div>

              {openId === l.id && (
                <div className="border-t border-gray-800 p-4 bg-gray-950/50">
                  {draftLoading || !draft ? (
                    <p className="text-gray-500 text-sm">Writing draft…</p>
                  ) : (
                    <>
                      <p className="text-xs text-gray-500 mb-1">Subject</p>
                      <input
                        value={draft.subject}
                        onChange={e => setDraft({ ...draft, subject: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white mb-3 focus:outline-none focus:border-blue-700"
                      />
                      <p className="text-xs text-gray-500 mb-1">Message {!draft.email && <span className="text-amber-500">(no email on file — use Copy)</span>}</p>
                      <textarea
                        value={draft.body}
                        onChange={e => setDraft({ ...draft, body: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white h-56 resize-y focus:outline-none focus:border-blue-700 font-mono leading-relaxed"
                      />
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button onClick={copyDraft} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white px-3 py-1.5 rounded-lg text-sm">
                          {copied ? 'Copied ✓' : 'Copy'}
                        </button>
                        <button onClick={openInEmail} disabled={!draft.email} className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 border border-gray-700 text-white px-3 py-1.5 rounded-lg text-sm">
                          Open in email
                        </button>
                        <button onClick={() => queueForGmail(l)} disabled={!draft.email || queueing} title={!draft.email ? 'No email on file' : 'Queue to send via Gmail (gws)'} className="bg-blue-900 hover:bg-blue-800 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-sm">
                          {queued === l.id ? 'Queued ✓' : queueing ? 'Queuing…' : 'Queue for Gmail'}
                        </button>
                        <button onClick={() => logContacted(l)} className="bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium ml-auto">
                          Mark contacted
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
