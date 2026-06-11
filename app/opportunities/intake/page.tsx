'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

interface IntakeOpp {
  id: string; title: string; solNo: string; agency: string; naics: string
  vehicle: string; setAside: string; value: number; dueDate: string | null
  stage: string; source: string; url: string; notes: string
  oppType: 'RFI' | 'RFP' | 'unknown'
  verified: 'pending' | 'verified' | 'rejected'
  verifyNotes: string
  sourceEmailId: string | null
  intakeAt: string | null
}

// Days until due, with urgency color (mirrors opportunities/page.tsx dueInfo()).
function dueInfo(dateStr: string | null) {
  if (!dateStr) return { text: 'no deadline', cls: 'text-gray-500' }
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (days < 0) return { text: 'past due', cls: 'text-red-400' }
  if (days <= 7) return { text: `${days}d left`, cls: 'text-red-400' }
  if (days <= 21) return { text: `${days}d left`, cls: 'text-amber-400' }
  return { text: `${days}d left`, cls: 'text-gray-400' }
}

const verifiedPill: Record<string, string> = {
  pending: 'bg-amber-950 text-amber-300',
  verified: 'bg-green-900 text-green-300',
  rejected: 'bg-red-950 text-red-400',
}

export default function Intake() {
  const [opps, setOpps] = useState<IntakeOpp[]>([])
  const [filter, setFilter] = useState<'all' | 'pending' | 'verified' | 'rejected'>('all')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/intake/rfpmart?status=all')
    const data = await res.json().catch(() => [])
    setOpps(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  // RFP: mark verdict + (on verify) optionally send to the main pipeline.
  async function verify(o: IntakeOpp, verified: 'verified' | 'rejected') {
    setBusy(o.id)
    await fetch(`/api/intake/${o.id}/verify`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verified }),
    })
    await load(); setBusy(null)
  }

  // RFP "Send to pipeline" → promote into the main Opportunities table at qualified.
  async function sendToPipeline(o: IntakeOpp) {
    setBusy(o.id)
    await fetch('/api/opportunities', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: o.id, stage: 'qualified', verified: 'verified' }),
    })
    await load(); setBusy(null)
  }

  const shown = useMemo(
    () => filter === 'all' ? opps : opps.filter(o => o.verified === filter),
    [opps, filter]
  )
  const rfps = shown.filter(o => o.oppType === 'RFP')
  const rfis = shown.filter(o => o.oppType === 'RFI')
  const unknowns = shown.filter(o => o.oppType === 'unknown')

  const pendingCount = opps.filter(o => o.verified === 'pending').length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Intake</h2>
          <p className="text-gray-400 text-sm">
            RFPMart email triage · {opps.length} captured
            {pendingCount > 0 && <span className="text-amber-400"> · {pendingCount} pending verification</span>}
          </p>
        </div>
        <Link href="/opportunities" className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium">
          → Pipeline
        </Link>
      </div>

      {/* Verification filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(['all', 'pending', 'verified', 'rejected'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${filter === s ? 'bg-blue-800 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading intake…</p>
      ) : opps.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
          <p className="text-gray-400 text-sm mb-1">No opportunities captured yet.</p>
          <p className="text-gray-500 text-xs">Run <code className="text-gold">npm run fetch-rfpmart</code> to pull RFPMart emails, then verify them here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* RFP column — bid candidates */}
          <Column
            title="RFPs — Bid Candidates"
            hint="Active solicitations you can respond to. Verify, then send the real ones to the pipeline for a bid/no-bid."
            count={rfps.length}
            accent="text-gold"
          >
            {rfps.map(o => (
              <RfpCard key={o.id} o={o} busy={busy === o.id} onVerify={verify} onSend={sendToPipeline} />
            ))}
            {rfps.length === 0 && <Empty>No RFPs in this view.</Empty>}
          </Column>

          {/* RFI column — shape / influence */}
          <Column
            title="RFIs — Shape & Influence"
            hint="Information requests and sources-sought. Not a bid yet — respond to shape the future RFP, or park it."
            count={rfis.length}
            accent="text-sky-300"
          >
            {rfis.map(o => (
              <RfiCard key={o.id} o={o} busy={busy === o.id} onVerify={verify} />
            ))}
            {rfis.length === 0 && <Empty>No RFIs in this view.</Empty>}
            {unknowns.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">Unclassified — {unknowns.length}</p>
                {unknowns.map(o => <RfiCard key={o.id} o={o} busy={busy === o.id} onVerify={verify} />)}
              </div>
            )}
          </Column>
        </div>
      )}
    </div>
  )
}

function Column({ title, hint, count, accent, children }: { title: string; hint: string; count: number; accent: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3">
        <h3 className={`text-sm font-bold uppercase tracking-wide ${accent}`}>{title} · {count}</h3>
        <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{hint}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="bg-gray-900 border border-dashed border-gray-800 rounded-xl p-5 text-center text-gray-500 text-sm">{children}</div>
}

// Shared header block: title, agency/sol, verified pill, due urgency, notes, link.
function CardHead({ o }: { o: IntakeOpp }) {
  const due = dueInfo(o.dueDate)
  return (
    <>
      <div className="flex items-start justify-between gap-3 mb-1">
        <p className="font-medium leading-snug">{o.title}</p>
        <span className={`shrink-0 rounded-full text-[10px] px-2 py-0.5 capitalize ${verifiedPill[o.verified]}`}>{o.verified}</span>
      </div>
      <p className="text-xs text-gray-500 mb-2">
        {o.agency || 'agency unknown'}{o.solNo && ` · ${o.solNo}`}{o.naics && ` · NAICS ${o.naics}`}
      </p>
      <div className="flex items-center gap-3 text-xs mb-2">
        <span className={due.cls}>{due.text}</span>
        {o.value > 0 && <span className="text-gray-400">${o.value.toLocaleString()}</span>}
        {o.url && <a href={o.url} target="_blank" rel="noreferrer" className="text-gold hover:underline truncate max-w-[160px]">source ↗</a>}
      </div>
      {o.verifyNotes && <p className="text-[11px] text-gray-400 bg-gray-950 border border-gray-800 rounded-lg p-2 mb-2 leading-snug">{o.verifyNotes}</p>}
    </>
  )
}

function RfpCard({ o, busy, onVerify, onSend }: { o: IntakeOpp; busy: boolean; onVerify: (o: IntakeOpp, v: 'verified' | 'rejected') => void; onSend: (o: IntakeOpp) => void }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <CardHead o={o} />
      <div className="flex gap-2 flex-wrap mt-1">
        {o.verified === 'pending' && (
          <>
            <button disabled={busy} onClick={() => onVerify(o, 'verified')} className="bg-blue-800 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-medium">✓ Verify real</button>
            <button disabled={busy} onClick={() => onVerify(o, 'rejected')} className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 px-3 py-1.5 rounded-lg text-xs">✕ Reject</button>
          </>
        )}
        {o.verified === 'verified' && o.stage === 'identified' && (
          <button disabled={busy} onClick={() => onSend(o)} className="bg-blue-800 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-medium">→ Send to pipeline (bid/no-bid)</button>
        )}
        {o.verified === 'verified' && o.stage !== 'identified' && (
          <span className="text-xs text-green-300">In pipeline · <span className="capitalize">{o.stage}</span></span>
        )}
        {o.verified === 'rejected' && (
          <button disabled={busy} onClick={() => onVerify(o, 'verified')} className="text-xs text-gray-500 hover:text-gray-300 underline">restore</button>
        )}
      </div>
    </div>
  )
}

function RfiCard({ o, busy, onVerify }: { o: IntakeOpp; busy: boolean; onVerify: (o: IntakeOpp, v: 'verified' | 'rejected') => void }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <CardHead o={o} />
      <div className="flex gap-2 flex-wrap mt-1">
        {o.verified === 'pending' && (
          <>
            <button disabled={busy} onClick={() => onVerify(o, 'verified')} className="bg-blue-800 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-medium">✓ Worth shaping</button>
            <button disabled={busy} onClick={() => onVerify(o, 'rejected')} className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 px-3 py-1.5 rounded-lg text-xs">✕ Skip</button>
          </>
        )}
        {o.verified === 'verified' && <span className="text-xs text-sky-300">On watch · respond to influence the RFP</span>}
        {o.verified === 'rejected' && (
          <button disabled={busy} onClick={() => onVerify(o, 'verified')} className="text-xs text-gray-500 hover:text-gray-300 underline">restore</button>
        )}
      </div>
    </div>
  )
}
