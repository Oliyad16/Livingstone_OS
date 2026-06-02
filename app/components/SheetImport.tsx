'use client'
import { useState } from 'react'
import { useWorkspace } from './WorkspaceContext'

const FIELDS = ['name', 'company', 'email', 'phone', 'source', 'status', 'service', 'notes'] as const
type Field = typeof FIELDS[number]

// Guess a header for a field by fuzzy name match.
function autoMap(field: Field, headers: string[]): string {
  const h = headers.find(x => x.toLowerCase().replace(/[^a-z]/g, '').includes(field))
  return h || ''
}

export default function SheetImport({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false)
  const [sheetId, setSheetId] = useState('')
  const [tabs, setTabs] = useState<string[]>([])
  const [tab, setTab] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const { workspace } = useWorkspace()

  // Accept a full URL or a bare ID.
  function extractId(input: string) {
    const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
    return m ? m[1] : input.trim()
  }

  async function loadSheet() {
    const id = extractId(sheetId)
    if (!id) return
    setLoading(true); setError(''); setResult('')
    const res = await fetch('/api/leads/sheet-tabs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spreadsheetId: id }),
    })
    const j = await res.json()
    setLoading(false)
    if (!res.ok) { setError(j.error || 'Could not read sheet. Connect Google in Analytics first.'); return }
    setSheetId(id); setTabs(j.tabs || []); setTab(j.tab || ''); setHeaders(j.headers || [])
    const m: Record<string, string> = {}
    FIELDS.forEach(f => { m[f] = autoMap(f, j.headers || []) })
    setMapping(m)
  }

  async function reloadTab(newTab: string) {
    setTab(newTab); setLoading(true)
    const res = await fetch('/api/leads/sheet-tabs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spreadsheetId: sheetId, tab: newTab }),
    })
    const j = await res.json(); setLoading(false)
    if (res.ok) {
      setHeaders(j.headers || [])
      const m: Record<string, string> = {}
      FIELDS.forEach(f => { m[f] = autoMap(f, j.headers || []) })
      setMapping(m)
    }
  }

  async function sync() {
    setLoading(true); setError(''); setResult('')
    const res = await fetch('/api/leads/sync-sheet', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spreadsheetId: sheetId, tab, mapping, workspace }),
    })
    const j = await res.json(); setLoading(false)
    if (!res.ok) { setError(j.error || 'Sync failed.'); return }
    setResult(`Imported ${j.inserted} new, updated ${j.updated}, skipped ${j.skipped}.`)
    onImported()
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl mb-5">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4 text-left">
        <span className="text-sm font-medium">Import from Google Sheet</span>
        <span className="text-gray-500 text-xs">{open ? 'Hide' : 'Open'}</span>
      </button>

      {open && (
        <div className="border-t border-gray-800 p-4 space-y-3">
          <div className="flex gap-2">
            <input
              value={sheetId}
              onChange={e => setSheetId(e.target.value)}
              placeholder="Paste Google Sheet URL or ID"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-700"
            />
            <button onClick={loadSheet} disabled={loading || !sheetId} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm">
              {loading ? 'Loading…' : 'Load'}
            </button>
          </div>

          {tabs.length > 0 && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 w-16">Tab</label>
                <select value={tab} onChange={e => reloadTab(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-700">
                  {tabs.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>

              <p className="text-xs text-gray-500 pt-1">Map your columns:</p>
              <div className="grid grid-cols-2 gap-2">
                {FIELDS.map(f => (
                  <div key={f} className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 w-16 capitalize">{f}</label>
                    <select
                      value={mapping[f] || ''}
                      onChange={e => setMapping({ ...mapping, [f]: e.target.value })}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-700"
                    >
                      <option value="">— none —</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              <button onClick={sync} disabled={loading} className="bg-blue-800 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
                {loading ? 'Syncing…' : 'Sync to CRM'}
              </button>
            </>
          )}

          {error && <p className="text-amber-500 text-xs">{error}</p>}
          {result && <p className="text-green-400 text-xs">{result}</p>}
        </div>
      )}
    </div>
  )
}
