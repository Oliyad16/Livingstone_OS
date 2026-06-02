'use client'
import { useEffect, useState } from 'react'
import { useWorkspace } from '../components/WorkspaceContext'

interface Lead {
  id: string; name: string; company: string; email: string; service: string
  status: string; source: string; daysSince: number
}
interface Draft { subject: string; body: string; email: string }

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
  const { workspace } = useWorkspace()

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/leads/followups?workspace=${workspace}`)
    const json = await res.json()
    setLeads(json.leads || [])
    setStaleDays(json.staleDays || 3)
    setLoading(false)
  }
  useEffect(() => { load() }, [workspace])

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
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Follow-ups</h2>
        <p className="text-gray-400 text-sm">
          Active leads with no contact in {staleDays}+ days. Draft, send, then log it to clear.
        </p>
        <p className="text-gray-600 text-xs mt-1">
          &ldquo;Queue for Gmail&rdquo; adds the email to the outbox. Run <code className="text-gray-500">npm run send-outbox</code> locally to send via gws and auto-log the touchpoint.
        </p>
      </div>

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
