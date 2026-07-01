'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Trash2, FileText, FolderOpen, Plus, Clock, ArrowUpDown, CheckCircle2, X, Lock, Mail, HelpCircle } from 'lucide-react'
import { useWorkspace } from '../components/WorkspaceContext'
import { Button } from '@/app/components/ui/button'
import { Badge } from '@/app/components/ui/badge'
import { Checkbox } from '@/app/components/ui/checkbox'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Textarea } from '@/app/components/ui/textarea'
import { Skeleton } from '@/app/components/ui/skeleton'
import {
  Card,
  CardContent,
} from '@/app/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/app/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/components/ui/alert-dialog'

interface Forecast {
  anticipatedRelease?: string  // free-text window, e.g. "Q4 FY26" or "2026-09"
  signal?: 'recompete' | 'rfi-to-rfp' | 'forecast-tool' | 'announcement'
  confidence?: 'high' | 'medium' | 'low'
  watchWhy?: string            // why we're tracking it / what to prep now
  incumbent?: string           // current contract holder (for recompetes)
}
interface Opp {
  id: string; title: string; solNo: string; agency: string; naics: string
  vehicle: string; setAside: string; value: number; dueDate: string | null
  stage: string; source: string; url: string; notes: string
  category?: 'software' | 'marketing' | 'unknown'
  kind?: 'opportunity' | 'forecast'
  summary?: string; driveFolderUrl?: string | null
  createdAt?: string; deletedAt?: string | null
  extra?: {
    status?: string; keyDates?: { proposalDue?: string }; forecast?: Forecast
    score?: number
    scoring?: { score?: number; recommendation?: string; rationale?: string }
    submission?: { deadline?: string; method?: string; requiredDocs?: string[]; evaluation?: string; eligibility?: string }
    keyPeople?: { name?: string; role?: string; email?: string; phone?: string }[]
    sources?: string[]
  }
}

// Portal hosts that require a vendor login to submit.
const PORTAL_RE = /sam\.gov|emma\.maryland|emaryland|ocp\.dc\.gov|dgs\.dc\.gov|bonfirehub|gobonfire|planetbids|bidnet|periscope|bidsync/i

// What channel does this contract submit through? Derived from a recorded method,
// else a known portal link, else a contact email — so the list is never blank.
function channelOf(o: Opp): { kind: 'portal' | 'email' | 'method' | 'unknown'; label: string } {
  const m = o.extra?.submission?.method
  if (m && m.trim()) return { kind: 'method', label: m.length > 26 ? m.slice(0, 26) + '…' : m }
  const links = [o.url, ...(o.extra?.sources || [])].filter(Boolean) as string[]
  if (links.some(u => PORTAL_RE.test(u))) return { kind: 'portal', label: 'Portal login' }
  if ((o.extra?.keyPeople || []).some(p => p.email)) return { kind: 'email', label: 'Email' }
  return { kind: 'unknown', label: 'Unknown' }
}

// Submission readiness — do we know enough to actually bid? ready = channel +
// deadline + ≥1 required doc; partial = some; unknown = none.
function readinessOf(o: Opp): { level: 'ready' | 'partial' | 'unknown'; label: string; cls: string } {
  const sub = o.extra?.submission || {}
  const hasChannel = channelOf(o).kind !== 'unknown'
  const hasDeadline = !!(sub.deadline || o.dueDate || o.extra?.keyDates?.proposalDue)
  const hasDocs = (sub.requiredDocs || []).length > 0
  if (hasChannel && hasDeadline && hasDocs) return { level: 'ready', label: 'Ready', cls: 'bg-green-900 text-green-300' }
  if ([hasChannel, hasDeadline, hasDocs].filter(Boolean).length >= 1) return { level: 'partial', label: 'Partial', cls: 'bg-amber-950 text-amber-300' }
  return { level: 'unknown', label: 'Needs info', cls: 'bg-secondary text-muted-foreground' }
}

// Fit score (1–10) written by the scoring agent into extra.score. 0 = unscored/expired.
function fitScore(o: Opp): number {
  return Number(o.extra?.score ?? 0)
}

// Score → badge styling: 7+ pursue (gold), 4–6 maybe (amber), 1–3 pass (muted), 0 unscored.
function scoreBadgeClass(s: number): string {
  if (s >= 7) return 'bg-primary/15 text-primary'
  if (s >= 4) return 'bg-amber-100 text-amber-800'
  if (s >= 1) return 'bg-muted text-muted-foreground'
  return 'bg-transparent text-muted-foreground/40'
}

// US state / region inferred from the agency + summary text, for the region filter.
const STATE_NAMES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'West Virginia', 'Washington',
  'Wisconsin', 'Wyoming', 'British Columbia', 'Alberta', 'Ontario',
]
function regionOf(o: Opp): string {
  const hay = `${o.agency} ${o.summary || ''} ${o.notes || ''}`
  if (/\bDC\b|District of Columbia|Washington,\s?DC/.test(hay)) return 'Washington, DC'
  for (const s of STATE_NAMES) {
    if (new RegExp(`\\b${s}\\b`).test(hay)) return s
  }
  return '—'
}

// Sort modes for the opportunity list.
type SortKey = 'score' | 'dueSoon' | 'dueLate' | 'newest' | 'oldest'
const SORT_LABEL: Record<SortKey, string> = {
  score: 'Fit score (best first)',
  dueSoon: 'Due date (soonest)',
  dueLate: 'Due date (latest)',
  newest: 'Recently added',
  oldest: 'Oldest added',
}
function sortOpps(list: Opp[], key: SortKey): Opp[] {
  const arr = [...list]
  const dueMs = (o: Opp) => (o.dueDate ? new Date(o.dueDate).getTime() : NaN)
  const addMs = (o: Opp) => (o.createdAt ? new Date(o.createdAt).getTime() : 0)
  switch (key) {
    case 'score': return arr.sort((a, b) => fitScore(b) - fitScore(a) || (dueMs(a) || Infinity) - (dueMs(b) || Infinity))
    case 'dueSoon': return arr.sort((a, b) => (isNaN(dueMs(a)) ? Infinity : dueMs(a)) - (isNaN(dueMs(b)) ? Infinity : dueMs(b)))
    case 'dueLate': return arr.sort((a, b) => (isNaN(dueMs(b)) ? -Infinity : dueMs(b)) - (isNaN(dueMs(a)) ? -Infinity : dueMs(a)))
    case 'newest': return arr.sort((a, b) => addMs(b) - addMs(a))
    case 'oldest': return arr.sort((a, b) => addMs(a) - addMs(b))
  }
}

// Expired = agent status marked closed/archived, or a known deadline is past.
function isExpired(o: Opp): boolean {
  const status = (o.extra?.status || '').toLowerCase()
  if (status.includes('closed') || status.includes('expired') || status.includes('archived')) return true
  const due = o.dueDate || o.extra?.keyDates?.proposalDue
  if (due && /^\d{4}-\d{2}-\d{2}$/.test(due)) return new Date(due).getTime() < Date.now()
  return false
}

const STAGES = ['identified', 'qualified', 'bid', 'submitted', 'won', 'lost']
const SOURCES = ['sam.gov', 'state', 'email', 'partner', 'manual']
const blank = {
  title: '', solNo: '', agency: '', naics: '', vehicle: '', setAside: '',
  value: 0, dueDate: '', stage: 'identified', source: 'sam.gov', url: '', notes: '',
}

// Days until due, with urgency color (semantic status tokens).
function dueInfo(dateStr: string | null) {
  if (!dateStr) return { text: '—', cls: 'text-muted-foreground' }
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (days < 0) return { text: 'past due', cls: 'text-red-400 font-semibold' }
  if (days <= 7) return { text: `${days}d left`, cls: 'text-red-400 font-semibold' }
  if (days <= 21) return { text: `${days}d left`, cls: 'text-amber-400 font-medium' }
  return { text: `${days}d left`, cls: 'text-muted-foreground' }
}

// Stage → badge styling. Won/lost/active map onto the warm status palette.
function stageBadgeClass(stage: string): string {
  switch (stage) {
    case 'won': return 'bg-green-900 text-green-300'
    case 'lost': return 'bg-red-900 text-red-300'
    case 'submitted': return 'bg-blue-900 text-sky-300'
    default: return 'bg-secondary text-secondary-foreground'
  }
}

export default function Opportunities() {
  const { workspace } = useWorkspace()
  const [opps, setOpps] = useState<Opp[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(blank)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('all')
  const [lane, setLane] = useState<'software' | 'marketing' | 'forecasts'>('software')
  const [pendingDelete, setPendingDelete] = useState<Opp | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [region, setRegion] = useState('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmingExpired, setConfirmingExpired] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  // Trash + Undo. `trash` holds the soft-deleted rows for the Trash view; `undo`
  // holds the ids from the most recent delete so a one-click Undo can restore them.
  const [showTrash, setShowTrash] = useState(false)
  const [trash, setTrash] = useState<Opp[]>([])
  const [undo, setUndo] = useState<{ ids: string[]; label: string } | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [liveRes, trashRes] = await Promise.all([
        fetch(`/api/opportunities?workspace=${workspace}`),
        fetch(`/api/opportunities?workspace=${workspace}&trashed=1`),
      ])
      setOpps(await liveRes.json())
      setTrash(await trashRes.json())
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [workspace])

  async function add() {
    setSaving(true)
    try {
      await fetch('/api/opportunities', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, workspace }),
      })
      setForm(blank); setAdding(false); await load()
    } finally {
      setSaving(false)
    }
  }

  async function moveStage(o: Opp, stage: string) {
    await fetch('/api/opportunities', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: o.id, stage }),
    })
    load()
  }

  async function remove(o: Opp) {
    const res = await fetch('/api/opportunities', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: o.id }),
    })
    const j = await res.json().catch(() => ({}))
    setPendingDelete(null)
    setUndo({ ids: j.ids || [o.id], label: `Moved “${o.title}” to Trash` })
    load()
  }

  // Restore soft-deleted rows (Undo toast + Trash "Restore"). Clears deleted_at.
  async function restore(ids: string[]) {
    if (ids.length === 0) return
    await fetch('/api/opportunities', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restore: true, ids }),
    })
    setUndo(null)
    await load()
  }

  // Permanently delete from Trash — the only path that actually destroys data.
  async function purge(ids: string[]) {
    if (ids.length === 0) return
    await fetch('/api/opportunities', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, purge: true }),
    })
    await load()
  }

  // Move every selected opportunity to the "qualified" stage — i.e. "I'm
  // committing to pursue these." One round-trip via the bulk PUT path.
  async function qualifySelected() {
    if (selected.size === 0) return
    setBulkBusy(true)
    try {
      await fetch('/api/opportunities', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulk: true, ids: [...selected], stage: 'qualified' }),
      })
      setSelected(new Set())
      await load()
    } finally {
      setBulkBusy(false)
    }
  }

  // Delete every expired contract in this workspace (past-due or closed/archived).
  async function deleteExpired() {
    setBulkBusy(true)
    try {
      const res = await fetch('/api/opportunities', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteExpired: true, workspace }),
      })
      const j = await res.json().catch(() => ({}))
      setConfirmingExpired(false)
      if (j.ids?.length) setUndo({ ids: j.ids, label: `Moved ${j.ids.length} expired to Trash` })
      await load()
    } finally {
      setBulkBusy(false)
    }
  }

  // Split the corpus: live opportunities (by lane) vs forecasts.
  const isForecast = (o: Opp) => o.kind === 'forecast'
  const laneOpps = opps.filter(o => !isForecast(o) && (o.category || 'unknown') === (lane === 'software' ? 'software' : 'marketing'))
  const forecasts = opps.filter(isForecast)
  const showingForecasts = lane === 'forecasts'

  // KPIs scoped to the active opportunity lane.
  const openOpps = laneOpps.filter(o => !['won', 'lost'].includes(o.stage))
  const pipelineValue = openOpps.reduce((s, o) => s + Number(o.value), 0)
  const dueSoon = openOpps.filter(o => o.dueDate && (new Date(o.dueDate).getTime() - Date.now()) / 86400000 <= 7).length
  const decided = laneOpps.filter(o => ['won', 'lost'].includes(o.stage))
  const winRate = decided.length ? Math.round((laneOpps.filter(o => o.stage === 'won').length / decided.length) * 100) : 0

  // Forecast KPIs.
  const forecastValue = forecasts.reduce((s, o) => s + Number(o.value), 0)
  const highConf = forecasts.filter(o => o.extra?.forecast?.confidence === 'high').length

  // Apply stage filter → region filter → sort. Order matters: filter, then sort.
  const byStage = filter === 'all' ? laneOpps : laneOpps.filter(o => o.stage === filter)
  const byRegion = region === 'all' ? byStage : byStage.filter(o => regionOf(o) === region)
  const shown = sortOpps(byRegion, sortKey)

  // Region options present in the current lane (so the dropdown only lists real ones).
  const regionOptions = Array.from(new Set(laneOpps.map(regionOf)))
    .filter(r => r !== '—')
    .sort((a, b) => (a === 'Washington, DC' ? -1 : b === 'Washington, DC' ? 1 : a.localeCompare(b)))

  // Expired count across the whole workspace (both lanes) — drives the cleanup banner.
  const expiredCount = opps.filter(o => !isForecast(o) && isExpired(o)).length

  // Selection helpers, scoped to what's currently shown.
  const shownIds = shown.map(o => o.id)
  const allShownSelected = shownIds.length > 0 && shownIds.every(id => selected.has(id))
  const toggleOne = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAllShown = () =>
    setSelected(prev => {
      const n = new Set(prev)
      if (allShownSelected) shownIds.forEach(id => n.delete(id))
      else shownIds.forEach(id => n.add(id))
      return n
    })

  const laneCounts = {
    software: opps.filter(o => !isForecast(o) && (o.category || 'unknown') === 'software').length,
    marketing: opps.filter(o => !isForecast(o) && (o.category || 'unknown') === 'marketing').length,
    forecasts: forecasts.length,
  }

  return (
    <div>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h2 className="text-2xl">Opportunities</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Government capture pipeline · {laneCounts.software} software · {laneCounts.marketing} marketing · {laneCounts.forecasts} forecast
          </p>
        </div>
        <div className="flex items-center gap-2">
          {trash.length > 0 && (
            <Button variant="outline" onClick={() => setShowTrash(true)}>
              <Trash2 /> Trash <span className="ml-1 text-xs opacity-60">{trash.length}</span>
            </Button>
          )}
          <Button onClick={() => setAdding(true)}>
            <Plus /> Add {showingForecasts ? 'Forecast' : 'Opportunity'}
          </Button>
        </div>
      </div>
      <div className="gold-divider mb-6" />

      {/* ── Lane switcher: the two delivery lanes + the forecast watchlist ── */}
      <Tabs value={lane} onValueChange={v => { setLane(v as typeof lane); setFilter('all') }} className="mb-5">
        <TabsList>
          <TabsTrigger value="software">Software <span className="ml-1.5 text-xs opacity-60">{laneCounts.software}</span></TabsTrigger>
          <TabsTrigger value="marketing">Marketing <span className="ml-1.5 text-xs opacity-60">{laneCounts.marketing}</span></TabsTrigger>
          <TabsTrigger value="forecasts">Forecasts <span className="ml-1.5 text-xs opacity-60">{laneCounts.forecasts}</span></TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ════════════ FORECASTS LANE ════════════ */}
      {showingForecasts ? (
        <ForecastView
          forecasts={forecasts}
          total={forecastValue}
          highConf={highConf}
          loading={loading}
          onDelete={setPendingDelete}
        />
      ) : (
      <>
      {/* ── Hero: time-sensitive signal (arrangement: most urgent on top) ─ */}
      {dueSoon > 0 && (
        <button
          onClick={() => setFilter('all')}
          className="w-full mb-5 flex items-center gap-3 rounded-xl border border-red-800 bg-red-950 px-4 py-3 text-left transition-colors hover:brightness-[0.99]"
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-red-900">
            <Clock className="size-4 text-red-300" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-red-300">
              {dueSoon} {dueSoon === 1 ? 'opportunity' : 'opportunities'} due within 7 days
            </span>
            <span className="block text-xs text-red-400/80">
              Solicitation deadlines approaching — prioritize these bids.
            </span>
          </span>
        </button>
      )}

      {/* ── KPI strip (3–5 max, most important leftmost) ─────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Kpi label="Open Pipeline" value={`$${pipelineValue.toLocaleString()}`} />
        <Kpi label="Open Opps" value={String(openOpps.length)} />
        <Kpi
          label="Due ≤ 7 days"
          value={String(dueSoon)}
          valueClass={dueSoon ? 'text-red-400' : undefined}
        />
        <Kpi label="Win Rate" value={decided.length ? `${winRate}%` : '—'} />
      </div>

      {/* ── Expired cleanup banner ───────────────────────────────────── */}
      {expiredCount > 0 && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/40 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-secondary">
              <Trash2 className="size-4 text-muted-foreground" />
            </span>
            <span className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{expiredCount} expired {expiredCount === 1 ? 'contract' : 'contracts'}</span> past deadline — clear them to keep the pipeline clean.
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setConfirmingExpired(true)}>
            <Trash2 /> Delete all expired
          </Button>
        </div>
      )}

      {/* ── Controls: stage filter + sort + region (filter → sort → view) ─ */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            {STAGES.map(s => (
              <TabsTrigger key={s} value={s} className="capitalize">{s}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="ml-auto flex items-center gap-2">
          <Select value={sortKey} onValueChange={v => setSortKey(v as SortKey)}>
            <SelectTrigger size="sm" className="w-[200px]">
              <ArrowUpDown className="size-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABEL) as SortKey[]).map(k => (
                <SelectItem key={k} value={k}>{SORT_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger size="sm" className="w-[170px]">
              <SelectValue placeholder="All regions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All regions</SelectItem>
              {regionOptions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Selection action bar (appears when rows are checked) ─────── */}
      {selected.size > 0 && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5">
          <span className="text-sm font-medium">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={qualifySelected} disabled={bulkBusy}>
              <CheckCircle2 /> {bulkBusy ? 'Moving…' : 'Move to Qualified'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              <X /> Clear
            </Button>
          </div>
        </div>
      )}

      {/* ── Primary working surface: the pipeline table ──────────────── */}
      <Card className="overflow-hidden p-0">
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton />
          ) : shown.length === 0 ? (
            <EmptyState filter={filter} onAdd={() => setAdding(true)} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      checked={allShownSelected}
                      onCheckedChange={toggleAllShown}
                      aria-label="Select all shown"
                    />
                  </TableHead>
                  <TableHead className="w-14 text-center">Fit</TableHead>
                  <TableHead className="min-w-[260px] max-w-[400px]">Title / Agency</TableHead>
                  <TableHead>Set-aside</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Submit</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map(o => {
                  const due = dueInfo(o.dueDate)
                  const score = fitScore(o)
                  const isSel = selected.has(o.id)
                  return (
                    <TableRow key={o.id} data-state={isSel ? 'selected' : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={isSel}
                          onCheckedChange={() => toggleOne(o.id)}
                          aria-label={`Select ${o.title}`}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={`inline-flex min-w-7 justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold ${scoreBadgeClass(score)}`}
                          title={o.extra?.scoring?.rationale || (score ? `Fit ${score}/10` : 'Not scored')}
                        >
                          {score || '—'}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[400px]">
                        <Link
                          href={`/opportunities/${o.id}`}
                          className="font-medium hover:text-primary flex items-center gap-1.5"
                        >
                          {o.driveFolderUrl
                            ? <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                            : <FileText className="size-4 shrink-0 text-muted-foreground" />}
                          <span className="truncate">{o.title}</span>
                          {isExpired(o) && (
                            <Badge className="bg-red-900 text-red-300 shrink-0">expired</Badge>
                          )}
                        </Link>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {o.agency}{o.solNo && ` · ${o.solNo}`}
                        </p>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{o.setAside || '—'}</TableCell>
                      <TableCell className="text-right">
                        {o.value ? `$${Number(o.value).toLocaleString()}` : '—'}
                      </TableCell>
                      <TableCell><span className={due.cls}>{due.text}</span></TableCell>
                      <TableCell>
                        {(() => {
                          const ch = channelOf(o)
                          const rd = readinessOf(o)
                          const Icon = ch.kind === 'portal' ? Lock : ch.kind === 'email' ? Mail : ch.kind === 'unknown' ? HelpCircle : CheckCircle2
                          return (
                            <div className="flex flex-col gap-1">
                              <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title={ch.label}>
                                <Icon className="size-3.5 shrink-0" />
                                <span className="truncate max-w-[120px]">{ch.label}</span>
                              </span>
                              <Badge className={`${rd.cls} w-fit text-[10px] px-1.5`} title="Do we know channel + deadline + required docs?">{rd.label}</Badge>
                            </div>
                          )
                        })()}
                      </TableCell>
                      <TableCell>
                        <Select value={o.stage} onValueChange={v => moveStage(o, v)}>
                          <SelectTrigger
                            size="sm"
                            className={`h-7 rounded-full border-0 px-2.5 text-xs capitalize ${stageBadgeClass(o.stage)}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STAGES.map(s => (
                              <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-red-400"
                          onClick={() => setPendingDelete(o)}
                          title="Delete opportunity"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      </>
      )}

      {/* ── Add dialog (form moved off the main surface) ─────────────── */}
      <Dialog open={adding} onOpenChange={open => { if (!open) { setForm(blank) } setAdding(open) }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Opportunity</DialogTitle>
            <DialogDescription>Add a capture target to the pipeline.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field className="col-span-2" label="Title">
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Website Modernization — Agency" />
            </Field>
            <Field label="Solicitation #">
              <Input value={form.solNo} onChange={e => setForm({ ...form, solNo: e.target.value })} />
            </Field>
            <Field label="Agency">
              <Input value={form.agency} onChange={e => setForm({ ...form, agency: e.target.value })} />
            </Field>
            <Field label="NAICS">
              <Input value={form.naics} onChange={e => setForm({ ...form, naics: e.target.value })} />
            </Field>
            <Field label="Vehicle">
              <Input value={form.vehicle} onChange={e => setForm({ ...form, vehicle: e.target.value })} placeholder="MAS, OASIS+…" />
            </Field>
            <Field label="Set-aside">
              <Input value={form.setAside} onChange={e => setForm({ ...form, setAside: e.target.value })} placeholder="8(a), SDVOSB…" />
            </Field>
            <Field label="Value ($)">
              <Input type="number" value={form.value || ''} onChange={e => setForm({ ...form, value: Number(e.target.value) })} />
            </Field>
            <Field label="Due date">
              <Input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} />
            </Field>
            <Field label="Source">
              <Select value={form.source} onValueChange={v => setForm({ ...form, source: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Stage">
              <Select value={form.stage} onValueChange={v => setForm({ ...form, stage: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{STAGES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field className="col-span-2" label="Notes">
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="h-20 resize-none" />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setAdding(false); setForm(blank) }}>Cancel</Button>
            <Button onClick={add} disabled={!form.title || saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation (replaces window.confirm) ────────────── */}
      <AlertDialog open={!!pendingDelete} onOpenChange={open => { if (!open) setPendingDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move this opportunity to Trash?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingDelete?.title}” will be hidden from the pipeline. You can restore it from Trash, or it’ll stay there until you permanently delete it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => pendingDelete && remove(pendingDelete)}
            >
              Move to Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete-all-expired confirmation ──────────────────────────── */}
      <AlertDialog open={confirmingExpired} onOpenChange={setConfirmingExpired}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move all expired to Trash?</AlertDialogTitle>
            <AlertDialogDescription>
              This moves {expiredCount} expired {expiredCount === 1 ? 'opportunity' : 'opportunities'} (past deadline or closed) to Trash. You can restore them anytime, or permanently delete them from there.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={deleteExpired}
              disabled={bulkBusy}
            >
              {bulkBusy ? 'Moving…' : `Move ${expiredCount} to Trash`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Trash view (recycle bin) ─────────────────────────────────── */}
      <Dialog open={showTrash} onOpenChange={setShowTrash}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Trash · {trash.length}</DialogTitle>
            <DialogDescription>
              Deleted contracts live here. Restore any of them, or permanently delete to free them for good.
            </DialogDescription>
          </DialogHeader>
          {trash.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Trash2 className="size-7 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Trash is empty.</p>
            </div>
          ) : (
            <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {trash.map(o => (
                <div key={o.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{o.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {o.agency}
                      {o.deletedAt && ` · deleted ${new Date(o.deletedAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => restore([o.id])}>
                    Restore
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="size-8 text-muted-foreground hover:text-red-500"
                    onClick={() => purge([o.id])}
                    title="Delete permanently"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          {trash.length > 0 && (
            <DialogFooter className="sm:justify-between">
              <Button variant="outline" onClick={() => restore(trash.map(o => o.id))}>
                Restore all
              </Button>
              <Button
                variant="ghost"
                className="text-muted-foreground hover:text-red-500"
                onClick={() => purge(trash.map(o => o.id))}
              >
                <Trash2 /> Empty trash
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Undo toast (appears right after a delete) ────────────────── */}
      {undo && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 shadow-lg">
            <span className="text-sm">{undo.label}</span>
            <Button size="sm" variant="outline" onClick={() => restore(undo.ids)}>
              Undo
            </Button>
            <Button size="icon" variant="ghost" className="size-7" onClick={() => setUndo(null)} title="Dismiss">
              <X className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Forecast watchlist surface ───────────────────────────────────────── */

const SIGNAL_LABEL: Record<string, string> = {
  recompete: 'Recompete', 'rfi-to-rfp': 'RFI → RFP', 'forecast-tool': 'Forecast tool', announcement: 'Announced',
}
const SIGNAL_CLASS: Record<string, string> = {
  recompete: 'bg-blue-900 text-sky-300', 'rfi-to-rfp': 'bg-amber-950 text-amber-300',
  'forecast-tool': 'bg-secondary text-secondary-foreground', announcement: 'bg-green-900 text-green-300',
}
const CONF_CLASS: Record<string, string> = {
  high: 'text-green-400', medium: 'text-amber-400', low: 'text-muted-foreground',
}

function ForecastView({
  forecasts, total, highConf, loading, onDelete,
}: {
  forecasts: Opp[]; total: number; highConf: number; loading: boolean; onDelete: (o: Opp) => void
}) {
  // Sort by confidence (high first), then by anticipated release window text.
  const order = { high: 0, medium: 1, low: 2 } as Record<string, number>
  const sorted = [...forecasts].sort((a, b) => {
    const ca = order[a.extra?.forecast?.confidence || 'low'] ?? 3
    const cb = order[b.extra?.forecast?.confidence || 'low'] ?? 3
    if (ca !== cb) return ca - cb
    return String(a.extra?.forecast?.anticipatedRelease || '').localeCompare(String(b.extra?.forecast?.anticipatedRelease || ''))
  })

  return (
    <>
      <div className="mb-5 flex items-center gap-3 rounded-xl border border-border bg-secondary/40 px-4 py-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-secondary">
          <Clock className="size-4 text-primary" />
        </span>
        <span className="text-sm text-muted-foreground">
          Pre-RFP watchlist — contracts not yet solicited. Track these to position, build past performance, and meet the program office <em>before</em> the RFP drops.
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Kpi label="Forecasted Pipeline" value={`$${total.toLocaleString()}`} />
        <Kpi label="Tracked Forecasts" value={String(forecasts.length)} />
        <Kpi label="High Confidence" value={String(highConf)} valueClass={highConf ? 'text-green-400' : undefined} />
      </div>

      <Card className="overflow-hidden p-0">
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton />
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Clock className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No forecasts tracked yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[300px] max-w-[460px]">Title / Agency</TableHead>
                  <TableHead>Anticipated</TableHead>
                  <TableHead className="text-right">Est. Value</TableHead>
                  <TableHead>Signal</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(o => {
                  const f = o.extra?.forecast || {}
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="max-w-[460px]">
                        <Link href={`/opportunities/${o.id}`} className="font-medium hover:text-primary flex items-center gap-1.5">
                          <Clock className="size-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">{o.title}</span>
                        </Link>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {o.agency}{f.incumbent ? ` · incumbent: ${f.incumbent}` : ''}
                        </p>
                        {f.watchWhy && <p className="text-xs text-muted-foreground/80 mt-1 italic">{f.watchWhy}</p>}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">{f.anticipatedRelease || '—'}</TableCell>
                      <TableCell className="text-right">{o.value ? `$${Number(o.value).toLocaleString()}` : '—'}</TableCell>
                      <TableCell>
                        {f.signal
                          ? <Badge className={SIGNAL_CLASS[f.signal] || 'bg-secondary'}>{SIGNAL_LABEL[f.signal] || f.signal}</Badge>
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className={`capitalize font-medium ${CONF_CLASS[f.confidence || 'low']}`}>{f.confidence || '—'}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-red-400"
                          onClick={() => onDelete(o)} title="Remove forecast">
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}

/* ── Small local presentational helpers ──────────────────────────────── */

function Kpi({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className={`text-xl font-bold ${valueClass ?? ''}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`grid gap-1.5 ${className ?? ''}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function EmptyState({ filter, onAdd }: { filter: string; onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <FileText className="size-8 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">
        {filter === 'all'
          ? 'No opportunities yet.'
          : `No opportunities in the “${filter}” stage.`}
      </p>
      {filter === 'all' && (
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus /> Add the first opportunity
        </Button>
      )}
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-3">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  )
}
