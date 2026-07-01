'use client'
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface KeyPerson { name: string; role: string; email: string; phone: string }
interface KeyDates {
  release?: string; industryDay?: string; qaDue?: string; proposalDue?: string; award?: string
}
interface Submission {
  deadline?: string        // free-text date + time + timezone, e.g. "2026-06-26 2:00 PM ET"
  method?: string          // how to submit (portal/email/physical)
  requiredDocs?: string[]  // checklist of documents/forms a bidder must include
  evaluation?: string      // how proposals are scored
  eligibility?: string     // set-aside / MBE / registration prerequisites
}
interface OppExtra {
  keyDates?: KeyDates; keyPeople?: KeyPerson[]; from?: string; links?: string[]
  budgetBasis?: 'disclosed' | 'estimated' | 'unknown'
  budgetLow?: number; budgetHigh?: number; budgetRationale?: string; fit?: string
  status?: string; sources?: string[]; nextActions?: string[]
  submission?: Submission
}
interface RfpDoc {
  id: string; filename: string; mimeType: string; sizeBytes: number | null; uploadedAt: string | null
}

// Portals that render via JS / require a logged-in vendor account — a raw link
// there often looks empty. We flag these so the user knows why.
const GATED_HOSTS = ['ocp.dc.gov', 'sam.gov', 'dgs.dc.gov', 'internationaleprocurement.com']
function isGated(url: string): boolean {
  try { return GATED_HOSTS.some(h => new URL(url).hostname.includes(h)) } catch { return false }
}
function hostLabel(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

// An opportunity is "expired" when its agent status says closed, or any known
// deadline (top-level dueDate or extra.keyDates.proposalDue) is in the past.
function isExpired(opp: { dueDate: string | null; extra?: OppExtra }): boolean {
  const status = (opp.extra?.status || '').toLowerCase()
  if (status.includes('closed') || status.includes('expired') || status.includes('archived')) return true
  const due = opp.dueDate || opp.extra?.keyDates?.proposalDue
  if (due && /^\d{4}-\d{2}-\d{2}$/.test(due)) return new Date(due).getTime() < Date.now()
  return false
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
  extra: OppExtra; documents: DocRow[]; rfpDocuments?: RfpDoc[]
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
  const router = useRouter()
  const [opp, setOpp] = useState<Opp | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

  // Remove this opportunity (e.g. an expired solicitation). Confirms first, then
  // DELETEs and returns to the list. The API also clears its cached documents.
  const remove = useCallback(async () => {
    if (!confirm('Delete this opportunity? This removes the deal room and its cached documents. This cannot be undone.')) return
    setDeleting(true)
    const res = await fetch('/api/opportunities', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) router.push('/opportunities')
    else { setDeleting(false); alert('Delete failed. Try again.') }
  }, [id, router])

  // Update a top-level field locally; persist on blur.
  function setField<K extends keyof Opp>(key: K, val: Opp[K]) {
    setOpp(o => o ? { ...o, [key]: val } : o)
  }
  function setExtra(next: OppExtra) {
    setOpp(o => o ? { ...o, extra: next } : o)
  }

  // Upload an RFP file (read as base64, POST JSON). Reloads so it appears in the list.
  const [uploading, setUploading] = useState(false)
  const uploadRfp = useCallback(async (file: File) => {
    setUploading(true)
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(String(r.result).split(',')[1] || '')
        r.onerror = rej
        r.readAsDataURL(file)
      })
      const resp = await fetch(`/api/opportunities/${id}/rfp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, contentB64: b64 }),
      })
      if (!resp.ok) { const j = await resp.json().catch(() => ({})); alert(`Upload failed: ${j.error || resp.status}`) }
      else await load()
    } finally {
      setUploading(false)
    }
  }, [id, load])

  const deleteRfp = useCallback(async (fileId: string) => {
    if (!confirm('Delete this RFP file?')) return
    const resp = await fetch(`/api/opportunities/${id}/rfp`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId }),
    })
    if (resp.ok) await load()
  }, [id, load])

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
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={`rounded-full text-[11px] px-2 py-0.5 ${typePill[opp.oppType]}`}>{opp.oppType}</span>
            <span className={`rounded-full text-[11px] px-2 py-0.5 capitalize ${verifiedPill[opp.verified]}`}>{opp.verified}</span>
            <span className="rounded-full text-[11px] px-2 py-0.5 bg-gray-800 text-gray-400 capitalize">{opp.stage}</span>
            {isExpired(opp) && (
              <span className="rounded-full text-[11px] px-2 py-0.5 bg-red-950 text-red-300 border border-red-900 font-medium">⛔ Expired / closed</span>
            )}
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
          <button onClick={remove} disabled={deleting}
            className="text-xs text-gray-500 hover:text-red-400 disabled:opacity-50 mt-1">
            {deleting ? 'Deleting…' : '🗑 Delete opportunity'}
          </button>
        </div>
      </div>

      {/* How to submit — the FIRST thing you see: email vs. portal login, by when.
          This is the bid/no-bid gate, so it sits above everything else. */}
      <HowToSubmit opp={opp} extra={extra} onEnrich={enrich} enriching={enriching} />

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
        {/* Links: primary solicitation link + every verified source, de-duped.
            Gated portals (OCP/SAM/DGS) get a note so an empty page isn't confusing. */}
        {(() => {
          const links = [opp.url, ...(extra.sources || [])].filter(Boolean) as string[]
          const seen = new Set<string>()
          const unique = links.filter(u => (seen.has(u) ? false : (seen.add(u), true)))
          if (unique.length === 0 && !extra.from) return null
          return (
            <div className="mt-4 border-t border-gray-800 pt-3">
              <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-2">Links</p>
              <ul className="space-y-1.5">
                {unique.map((u, i) => (
                  <li key={u} className="flex items-center gap-2 text-sm flex-wrap">
                    <a href={u} target="_blank" rel="noreferrer" className="text-gold hover:underline break-all">
                      {i === 0 ? '★ ' : ''}{hostLabel(u)} ↗
                    </a>
                    {isGated(u) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/40 text-amber-400 border border-amber-900/60">
                        requires vendor login — may look empty
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {extra.from && <p className="text-xs text-gray-500 mt-2">From: {extra.from}</p>}
            </div>
          )
        })()}
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

      {/* Submission Requirements — how to bid, read from the RFP */}
      {(() => {
        const sub = extra.submission || {}
        const docsList = sub.requiredDocs || []
        const setSub = (next: Submission) => setExtra({ ...extra, submission: next })
        const saveSub = (next: Submission) => patch({ extra: { ...extra, submission: next } })
        return (
          <div id="submission-requirements" className="scroll-mt-4">
          <Section title="Submission Requirements" hint="How to bid — deadline, what to send, how to submit. Read from the RFP.">
            <div className="grid md:grid-cols-2 gap-3 mb-3">
              <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
                <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-1">Proposal deadline (date · time · TZ)</p>
                <input
                  value={sub.deadline || ''}
                  onChange={e => setSub({ ...sub, deadline: e.target.value })}
                  onBlur={() => saveSub(sub)}
                  placeholder="e.g. 2026-07-15, 2:00 PM ET"
                  className="w-full bg-transparent text-sm text-gray-200 placeholder-gray-600 focus:outline-none font-medium"
                />
              </div>
              <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
                <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-1">How to submit</p>
                <input
                  value={sub.method || ''}
                  onChange={e => setSub({ ...sub, method: e.target.value })}
                  onBlur={() => saveSub(sub)}
                  placeholder="e.g. Upload sealed Technical + Price via eMMA"
                  className="w-full bg-transparent text-sm text-gray-200 placeholder-gray-600 focus:outline-none"
                />
              </div>
            </div>

            {/* Required documents checklist */}
            <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 mb-3">
              <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-2">Required documents to submit</p>
              {docsList.length === 0 ? (
                <p className="text-xs text-gray-600 mb-2">None recorded yet — read them off the RFP and add below.</p>
              ) : (
                <ul className="space-y-1 mb-2">
                  {docsList.map((d, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-gold">▢</span>
                      <input
                        value={d}
                        onChange={e => { const next = { ...sub, requiredDocs: docsList.map((x, j) => j === i ? e.target.value : x) }; setSub(next) }}
                        onBlur={() => saveSub(sub)}
                        className="flex-1 bg-transparent text-sm text-gray-200 focus:outline-none"
                      />
                      <button onClick={() => { const next = { ...sub, requiredDocs: docsList.filter((_, j) => j !== i) }; setSub(next); saveSub(next) }}
                        className="text-gray-600 hover:text-red-400 text-xs px-1">✕</button>
                    </li>
                  ))}
                </ul>
              )}
              <button onClick={() => { const next = { ...sub, requiredDocs: [...docsList, ''] }; setSub(next) }}
                className="text-xs text-gold hover:underline">+ Add required document</button>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
                <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-1">Evaluation criteria</p>
                <textarea
                  value={sub.evaluation || ''}
                  onChange={e => setSub({ ...sub, evaluation: e.target.value })}
                  onBlur={() => saveSub(sub)}
                  placeholder="How proposals are scored (technical vs price weighting)…"
                  className="w-full bg-transparent text-sm text-gray-200 placeholder-gray-600 focus:outline-none resize-none h-16"
                />
              </div>
              <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
                <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-1">Eligibility / set-aside / prerequisites</p>
                <textarea
                  value={sub.eligibility || ''}
                  onChange={e => setSub({ ...sub, eligibility: e.target.value })}
                  onBlur={() => saveSub(sub)}
                  placeholder="MBE goal %, registration prerequisites, set-aside…"
                  className="w-full bg-transparent text-sm text-gray-200 placeholder-gray-600 focus:outline-none resize-none h-16"
                />
              </div>
            </div>
          </Section>
          </div>
        )
      })()}

      {/* RFP Documents — the actual solicitation files we dissect for the bid */}
      <Section title="RFP Documents" hint="The actual solicitation files. Upload the RFP package so we can dissect it for the bid.">
        {(opp.rfpDocuments || []).length === 0 ? (
          <div className="bg-gray-950 border border-dashed border-gray-800 rounded-lg p-5 text-center">
            <p className="text-gray-400 text-sm mb-1">No RFP stored yet.</p>
            <p className="text-gray-500 text-xs mb-3">Download the solicitation from its portal (often a vendor login), then upload it here. Deleting this contract deletes its RFP files too.</p>
            <label className="inline-block text-xs bg-blue-800 hover:bg-blue-700 text-white px-4 py-2 rounded-lg cursor-pointer">
              {uploading ? 'Uploading…' : '⬆ Upload RFP file'}
              <input type="file" className="hidden" disabled={uploading}
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadRfp(f); e.target.value = '' }} />
            </label>
          </div>
        ) : (
          <div className="space-y-2">
            <ul className="space-y-1.5">
              {(opp.rfpDocuments || []).map(f => (
                <li key={f.id} className="flex items-center justify-between bg-gray-950 border border-gray-800 rounded-lg px-3 py-2">
                  <a href={`/api/opportunities/${id}/rfp?download=${f.id}`} target="_blank" rel="noreferrer"
                    className="text-sm text-gray-200 hover:text-gold truncate flex items-center gap-2">
                    <span>📄</span>{f.filename}
                  </a>
                  <span className="flex items-center gap-3 shrink-0 ml-3">
                    <span className="text-[11px] text-gray-600">{f.sizeBytes ? `${(f.sizeBytes / 1024).toFixed(0)} KB` : ''}</span>
                    <button onClick={() => deleteRfp(f.id)} className="text-gray-600 hover:text-red-400 text-xs">✕</button>
                  </span>
                </li>
              ))}
            </ul>
            <label className="inline-block text-xs text-gold hover:underline cursor-pointer mt-1">
              {uploading ? 'Uploading…' : '+ Upload another RFP file'}
              <input type="file" className="hidden" disabled={uploading}
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadRfp(f); e.target.value = '' }} />
            </label>
          </div>
        )}
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

// Known submission portals → a friendly name, so "how to submit" reads plainly.
const PORTAL_NAMES: { re: RegExp; name: string }[] = [
  { re: /sam\.gov/i, name: 'SAM.gov' },
  { re: /emma\.maryland\.gov|emaryland/i, name: 'Maryland eMMA' },
  { re: /ocp\.dc\.gov|contracts\.ocp\.dc\.gov/i, name: 'DC OCP eSourcing' },
  { re: /dgs\.dc\.gov/i, name: 'DC DGS' },
  { re: /bonfirehub|gobonfire/i, name: 'Bonfire' },
  { re: /planetbids/i, name: 'PlanetBids' },
  { re: /bidnet/i, name: 'BidNet' },
  { re: /periscope|bidsync/i, name: 'Periscope / BidSync' },
  { re: /rfpmart/i, name: 'RFPMart (listing only — find the real portal in the RFP)' },
]

// Derive the submission CHANNEL from whatever we already know, so the card is
// never blank. Priority: an explicit method the agent/user recorded → a known
// portal in the links → a contact email → unknown (prompt to enrich).
type SubChannel = { kind: 'portal' | 'email' | 'method' | 'unknown'; label: string; detail: string }
function deriveChannel(opp: Opp, extra: OppExtra): SubChannel {
  const sub = extra.submission || {}
  if (sub.method && sub.method.trim()) return { kind: 'method', label: 'How to submit', detail: sub.method.trim() }
  const links = [opp.url, ...(extra.sources || [])].filter(Boolean) as string[]
  for (const u of links) {
    const hit = PORTAL_NAMES.find(p => p.re.test(u))
    if (hit) return { kind: 'portal', label: 'Submit via portal (login required)', detail: hit.name }
  }
  const person = (extra.keyPeople || []).find(p => p.email)
  if (person?.email) return { kind: 'email', label: 'Likely submit by email', detail: `${person.email}${person.name ? ` · ${person.name}` : ''}` }
  return { kind: 'unknown', label: 'Submission channel unknown', detail: 'Not yet extracted — enrich from the RFP, or open the solicitation link.' }
}

// The bid/no-bid gate, promoted to the top of the deal room: at a glance, HOW do
// I submit (email vs. portal), by WHEN, and what MUST I include.
function HowToSubmit({ opp, extra, onEnrich, enriching }: {
  opp: Opp; extra: OppExtra; onEnrich: () => void; enriching: boolean
}) {
  const sub = extra.submission || {}
  const ch = deriveChannel(opp, extra)
  const deadline = sub.deadline || opp.dueDate || extra.keyDates?.proposalDue || ''
  const docs = sub.requiredDocs || []
  const derived = ch.kind !== 'method' // channel was inferred, not read from the RFP
  const tone = {
    portal: 'border-amber-800 bg-amber-950/30',
    email: 'border-blue-800 bg-blue-950/30',
    method: 'border-green-900 bg-green-950/20',
    unknown: 'border-gray-800 bg-gray-950',
  }[ch.kind]
  const icon = { portal: '🔐', email: '✉️', method: '✅', unknown: '❓' }[ch.kind]

  return (
    <section className={`mb-7 rounded-xl border ${tone} p-4`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none mt-0.5">{icon}</span>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-0.5">How to submit</p>
            <p className="text-lg font-bold leading-tight text-gray-100">{ch.label}</p>
            <p className="text-sm text-gray-300 mt-0.5 break-words">{ch.detail}</p>
            {derived && ch.kind !== 'unknown' && (
              <p className="text-[11px] text-gray-500 mt-1 italic">Inferred from the link/contact — confirm against the RFP.</p>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-0.5">Deadline</p>
          <p className={`text-base font-semibold ${deadline ? 'text-gray-100' : 'text-gray-600'}`}>
            {deadline || 'not recorded'}
          </p>
          {deadline && /^\d{4}-\d{2}-\d{2}$/.test(deadline) && (
            <p className={`text-[11px] mt-0.5 ${dateColor(deadline)}`}>{daysLabel(deadline)}</p>
          )}
        </div>
      </div>

      {/* Quick line for what must be included, if known. */}
      <div className="mt-3 flex items-center gap-3 flex-wrap border-t border-white/5 pt-3">
        <span className="text-[11px] uppercase tracking-widest text-gray-500">Must include</span>
        {docs.length > 0 ? (
          <span className="flex flex-wrap gap-1.5">
            {docs.map((d, i) => (
              <span key={i} className="text-xs bg-black/30 border border-gray-800 rounded px-2 py-0.5 text-gray-300">{d}</span>
            ))}
          </span>
        ) : (
          <span className="text-xs text-gray-600">not recorded yet</span>
        )}
        <button onClick={onEnrich} disabled={enriching}
          className="ml-auto text-xs bg-blue-800 hover:bg-blue-700 disabled:opacity-60 text-white px-3 py-1.5 rounded-lg font-medium">
          {enriching ? 'Reading RFP…' : '✨ Auto-fill from RFP'}
        </button>
        <a href="#submission-requirements" className="text-xs text-gold hover:underline">Edit details ↓</a>
      </div>
    </section>
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
