'use client'
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface KeyPerson { name: string; role: string; email: string; phone: string }
interface KeyDates {
  release?: string; industryDay?: string; qaDue?: string; proposalDue?: string; award?: string
}
interface OppExtra {
  keyDates?: KeyDates; keyPeople?: KeyPerson[]; from?: string; links?: string[]
  budgetBasis?: 'disclosed' | 'estimated' | 'unknown'
  budgetLow?: number; budgetHigh?: number; budgetRationale?: string; fit?: string
}
interface DocRow {
  id: string; name: string; url: string; mimeType: string; folder: string
  modifiedAt: string | null; syncedAt: string | null
}
interface Opp {
  id: string; title: string; solNo: string; agency: string; naics: string
  vehicle: string; setAside: string; value: number; dueDate: string | null
  stage: string; source: string; url: string; notes: string
  oppType: 'RFI' | 'RFP' | 'unknown'; verified: 'pending' | 'verified' | 'rejected'
  verifyNotes: string
  summary: string; driveFolderId: string | null; driveFolderUrl: string | null
  extra: OppExtra; documents: DocRow[]
}

// Subfolders we render in order; matches the sync-drive script's structure.
const SUBFOLDERS = ['Solicitation Docs', 'Our Responses', 'Research & Intel'] as const

const DATE_FIELDS: { key: keyof KeyDates; label: string }[] = [
  { key: 'release', label: 'RFP Released' },
  { key: 'industryDay', label: 'Industry Day' },
  { key: 'qaDue', label: 'Questions Due' },
  { key: 'proposalDue', label: 'Proposal Due' },
  { key: 'award', label: 'Award' },
]

function dateColor(dateStr?: string) {
  if (!dateStr) return 'text-gray-500'
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (days < 0) return 'text-gray-500'
  if (days <= 7) return 'text-red-400'
  if (days <= 21) return 'text-amber-400'
  return 'text-gray-300'
}
function daysLabel(dateStr?: string) {
  if (!dateStr) return ''
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (days < 0) return 'passed'
  if (days === 0) return 'today'
  return `${days}d`
}

const verifiedPill: Record<string, string> = {
  pending: 'bg-amber-950 text-amber-300',
  verified: 'bg-green-900 text-green-300',
  rejected: 'bg-red-950 text-red-400',
}
const typePill: Record<string, string> = {
  RFP: 'bg-blue-900 text-sky-300',
  RFI: 'bg-purple-900 text-purple-300',
  unknown: 'bg-gray-800 text-gray-400',
}

export default function DealRoom() {
  const { id } = useParams<{ id: string }>()
  const [opp, setOpp] = useState<Opp | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [enriching, setEnriching] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/opportunities/${id}`)
    if (res.ok) setOpp(await res.json())
    else setNotFound(true)
  }, [id])
  useEffect(() => { load() }, [load])

  // Persist a patch to the opportunity. Optimistic: state is already updated by the
  // caller; this just writes through. Reloads documents-affecting changes via load().
  const patch = useCallback(async (body: Record<string, unknown>) => {
    setSaving(true)
    await fetch('/api/opportunities', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...body }),
    })
    setSaving(false)
  }, [id])

  // Run the enrichment sub-agent: fills summary, key people, key dates, and a
  // budget estimate from what's known + any synced solicitation docs.
  const enrich = useCallback(async () => {
    setEnriching(true)
    try {
      const res = await fetch(`/api/opportunities/${id}/enrich`, { method: 'POST' })
      if (res.ok) await load()
    } finally {
      setEnriching(false)
    }
  }, [id, load])

  // Update a top-level field locally; persist on blur.
  function setField<K extends keyof Opp>(key: K, val: Opp[K]) {
    setOpp(o => o ? { ...o, [key]: val } : o)
  }
  function setExtra(next: OppExtra) {
    setOpp(o => o ? { ...o, extra: next } : o)
  }

  if (notFound) return (
    <div>
      <Link href="/opportunities" className="text-gray-500 hover:text-white text-sm">← Opportunities</Link>
      <p className="text-gray-400 text-sm mt-4">Opportunity not found. It may have been deleted.</p>
    </div>
  )
  if (!opp) return <p className="text-gray-500 text-sm">Loading…</p>

  const extra = opp.extra || {}
  const dates = extra.keyDates || {}
  const people = extra.keyPeople || []
  const docsByFolder = (folder: string) => opp.documents.filter(d => d.folder === folder)
  const lastSynced = opp.documents.reduce<string | null>((m, d) => (d.syncedAt && (!m || d.syncedAt > m) ? d.syncedAt : m), null)

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between">
        <Link href="/opportunities" className="text-gray-500 hover:text-white text-sm">← Opportunities</Link>
        {saving && <span className="text-xs text-gray-500">saving…</span>}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mt-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold leading-tight">{opp.title}</h2>
          <p className="text-gray-400 text-sm mt-1">
            {opp.agency || 'agency unknown'}{opp.solNo && ` · ${opp.solNo}`}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className={`rounded-full text-[11px] px-2 py-0.5 ${typePill[opp.oppType]}`}>{opp.oppType}</span>
            <span className={`rounded-full text-[11px] px-2 py-0.5 capitalize ${verifiedPill[opp.verified]}`}>{opp.verified}</span>
            <span className="rounded-full text-[11px] px-2 py-0.5 bg-gray-800 text-gray-400 capitalize">{opp.stage}</span>
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-2">
          <button onClick={enrich} disabled={enriching}
            className="bg-blue-800 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium">
            {enriching ? 'Enriching…' : '✨ Enrich with AI'}
          </button>
          {opp.driveFolderUrl ? (
            <a href={opp.driveFolderUrl} target="_blank" rel="noreferrer"
              className="text-sm text-gold hover:underline">📁 Open in Drive</a>
          ) : (
            <span className="text-[11px] text-gray-500 max-w-[160px] text-right">No Drive folder — run <code className="text-gold">npm run sync-drive</code></span>
          )}
        </div>
      </div>

      {/* Summary */}
      <Section title="Summary" hint="Plain-language overview of what this project is.">
        <textarea
          value={opp.summary}
          onChange={e => setField('summary', e.target.value)}
          onBlur={() => patch({ summary: opp.summary })}
          placeholder="What is this contract about? (the agent drafts this on intake; edit freely)"
          className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-700 resize-none h-24"
        />
      </Section>

      {/* Budget — estimated vs disclosed, clearly flagged */}
      <Section title="Budget" hint="The agency's likely contract value. An estimate is an inference, not a published figure.">
        <BudgetBlock opp={opp} extra={extra} setField={setField} patch={patch} />
      </Section>

      {/* Key facts — the "little Excel sheet" */}
      <Section title="Key Facts" hint="Classification, and where it came from.">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Agency" value={opp.agency} onChange={v => setField('agency', v)} onBlur={() => patch({ agency: opp.agency })} />
          <Field label="Solicitation #" value={opp.solNo} onChange={v => setField('solNo', v)} onBlur={() => patch({ solNo: opp.solNo })} />
          <Field label="NAICS" value={opp.naics} onChange={v => setField('naics', v)} onBlur={() => patch({ naics: opp.naics })} />
          <Field label="Set-aside" value={opp.setAside} onChange={v => setField('setAside', v)} onBlur={() => patch({ setAside: opp.setAside })} />
          <Field label="Vehicle" value={opp.vehicle} onChange={v => setField('vehicle', v)} onBlur={() => patch({ vehicle: opp.vehicle })} />
        </div>
        {(opp.url || extra.from) && (
          <div className="mt-3 text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
            {opp.url && <a href={opp.url} target="_blank" rel="noreferrer" className="text-gold hover:underline">Solicitation link ↗</a>}
            {extra.from && <span>From: {extra.from}</span>}
          </div>
        )}
      </Section>

      {/* Key dates timeline */}
      <Section title="Key Dates" hint="Important deadlines. Industry day, questions due, proposal due, award.">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {DATE_FIELDS.map(({ key, label }) => (
            <div key={key} className="bg-gray-950 border border-gray-800 rounded-lg p-3">
              <p className="text-[11px] text-gray-500 mb-1">{label}</p>
              <input
                type="date"
                value={dates[key] || ''}
                onChange={e => setExtra({ ...extra, keyDates: { ...dates, [key]: e.target.value } })}
                onBlur={() => patch({ extra: { ...extra, keyDates: { ...dates, [key]: dates[key] } } })}
                className="w-full bg-transparent text-sm text-gray-200 focus:outline-none"
              />
              {dates[key] && <p className={`text-[11px] mt-1 ${dateColor(dates[key])}`}>{daysLabel(dates[key])}</p>}
            </div>
          ))}
        </div>
      </Section>

      {/* Key people */}
      <Section title="Key People" hint="Who to respond to — contracting officer + contacts.">
        <div className="space-y-2">
          {people.map((p, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr_1.4fr_1fr_auto] gap-2 items-center">
              <PeopleInput placeholder="Name" value={p.name} onChange={v => updatePerson(people, i, { name: v }, setExtra, extra)} onBlur={() => patch({ extra })} />
              <PeopleInput placeholder="Role" value={p.role} onChange={v => updatePerson(people, i, { role: v }, setExtra, extra)} onBlur={() => patch({ extra })} />
              <PeopleInput placeholder="Email" value={p.email} onChange={v => updatePerson(people, i, { email: v }, setExtra, extra)} onBlur={() => patch({ extra })} />
              <PeopleInput placeholder="Phone" value={p.phone} onChange={v => updatePerson(people, i, { phone: v }, setExtra, extra)} onBlur={() => patch({ extra })} />
              <button
                onClick={() => { const next = { ...extra, keyPeople: people.filter((_, j) => j !== i) }; setExtra(next); patch({ extra: next }) }}
                className="text-gray-600 hover:text-red-400 text-sm px-2">✕</button>
            </div>
          ))}
          <button
            onClick={() => { const next = { ...extra, keyPeople: [...people, { name: '', role: '', email: '', phone: '' }] }; setExtra(next) }}
            className="text-xs text-gold hover:underline mt-1">+ Add person</button>
        </div>
      </Section>

      {/* Documents (Drive) */}
      <Section
        title="Documents"
        hint={`Files in this contract's Drive folder.${lastSynced ? ` Last synced ${new Date(lastSynced).toLocaleString()}.` : ''}`}
      >
        {opp.documents.length === 0 ? (
          <div className="bg-gray-950 border border-dashed border-gray-800 rounded-lg p-5 text-center">
            <p className="text-gray-400 text-sm mb-1">No documents synced yet.</p>
            <p className="text-gray-500 text-xs">Run <code className="text-gold">npm run sync-drive</code> to create the Drive folder and pull its files.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {SUBFOLDERS.map(folder => {
              const docs = docsByFolder(folder)
              return (
                <div key={folder}>
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">{folder} · {docs.length}</p>
                  {docs.length === 0 ? (
                    <p className="text-xs text-gray-600 pl-1">empty</p>
                  ) : (
                    <ul className="space-y-1">
                      {docs.map(d => (
                        <li key={d.id} className="flex items-center justify-between bg-gray-950 border border-gray-800 rounded-lg px-3 py-2">
                          <a href={d.url} target="_blank" rel="noreferrer" className="text-sm text-gray-200 hover:text-gold truncate">{d.name}</a>
                          <span className="text-[11px] text-gray-600 shrink-0 ml-3">{d.modifiedAt ? new Date(d.modifiedAt).toLocaleDateString() : ''}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
            {/* Any files in unexpected/other folders */}
            {opp.documents.filter(d => !SUBFOLDERS.includes(d.folder as typeof SUBFOLDERS[number])).length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">Other</p>
                <ul className="space-y-1">
                  {opp.documents.filter(d => !SUBFOLDERS.includes(d.folder as typeof SUBFOLDERS[number])).map(d => (
                    <li key={d.id} className="flex items-center justify-between bg-gray-950 border border-gray-800 rounded-lg px-3 py-2">
                      <a href={d.url} target="_blank" rel="noreferrer" className="text-sm text-gray-200 hover:text-gold truncate">{d.name}</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Verification notes (read-only context from the agent) */}
      {opp.verifyNotes && (
        <Section title="Verification Notes" hint="What the research agent found.">
          <p className="text-sm text-gray-300 bg-gray-950 border border-gray-800 rounded-lg p-3 leading-relaxed">{opp.verifyNotes}</p>
        </Section>
      )}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-300">{title}</h3>
      {hint && <p className="text-[11px] text-gray-500 mt-0.5 mb-3">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </section>
  )
}

function BudgetBlock({ opp, extra, setField, patch }: {
  opp: Opp; extra: OppExtra
  setField: <K extends keyof Opp>(k: K, v: Opp[K]) => void
  patch: (b: Record<string, unknown>) => void
}) {
  const basis = extra.budgetBasis || (opp.value > 0 ? 'disclosed' : 'unknown')
  const badge = basis === 'disclosed'
    ? { text: 'Disclosed', cls: 'bg-green-900 text-green-300' }
    : basis === 'estimated'
      ? { text: 'AI Estimate', cls: 'bg-amber-950 text-amber-300' }
      : { text: 'Unknown', cls: 'bg-gray-800 text-gray-500' }
  const low = extra.budgetLow || 0
  const high = extra.budgetHigh || 0
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-lg p-4">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl font-bold text-white">{opp.value > 0 ? `$${opp.value.toLocaleString()}` : '—'}</span>
        <span className={`rounded-full text-[10px] px-2 py-0.5 ${badge.cls}`}>{badge.text}</span>
        <input
          type="number" value={opp.value || ''}
          onChange={e => setField('value', Number(e.target.value) || 0)}
          onBlur={() => patch({ value: opp.value })}
          placeholder="set value"
          className="ml-auto w-32 bg-transparent border border-gray-800 rounded px-2 py-1 text-sm text-gray-300 text-right focus:outline-none focus:border-blue-700"
        />
      </div>
      {basis === 'estimated' && (low > 0 || high > 0) && (
        <p className="text-xs text-amber-300/80">Estimated range: ${low.toLocaleString()} – ${high.toLocaleString()}</p>
      )}
      {extra.budgetRationale && <p className="text-[11px] text-gray-500 mt-1 leading-snug">{extra.budgetRationale}</p>}
      {basis === 'unknown' && <p className="text-[11px] text-gray-600 mt-1">Run “✨ Enrich with AI” to estimate the likely budget.</p>}
    </div>
  )
}

function Field({ label, value, onChange, onBlur, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; onBlur: () => void; type?: string
}) {
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
      <p className="text-[11px] text-gray-500 mb-1">{label}</p>
      <input
        type={type} value={value}
        onChange={e => onChange(e.target.value)} onBlur={onBlur}
        className="w-full bg-transparent text-sm text-gray-200 placeholder-gray-600 focus:outline-none"
        placeholder="—"
      />
    </div>
  )
}

function PeopleInput({ placeholder, value, onChange, onBlur }: {
  placeholder: string; value: string; onChange: (v: string) => void; onBlur: () => void
}) {
  return (
    <input
      placeholder={placeholder} value={value}
      onChange={e => onChange(e.target.value)} onBlur={onBlur}
      className="bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-700"
    />
  )
}

function updatePerson(
  people: KeyPerson[], i: number, patchObj: Partial<KeyPerson>,
  setExtra: (e: OppExtra) => void, extra: OppExtra
) {
  const next = people.map((p, j) => (j === i ? { ...p, ...patchObj } : p))
  setExtra({ ...extra, keyPeople: next })
}
