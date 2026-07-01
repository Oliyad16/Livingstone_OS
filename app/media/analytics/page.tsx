'use client'
import { useCallback, useEffect, useState } from 'react'
import { ChartFrame } from '../../components/charts/ChartFrame'
import { DonutChart, ChartLegend, AreaTrend } from '../../components/charts/Charts'
import { CHART } from '../../components/charts/theme'

interface Stats {
  impressionCount: number
  uniqueImpressionsCount: number
  clickCount: number
  likeCount: number
  commentCount: number
  shareCount: number
  engagement: number
}
interface PostedRow {
  id: string
  topic: string
  postType: string | null
  linkedinId: string | null
  ugcUrn: string | null
  postedAt: string | null
  impressions: number | null
  uniqueImpressions: number | null
  clicks: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  engagementRate: number | null
  statsSyncedAt: string | null
}
interface PillarRow { type: string; count: number; avgEngagement: number | null; impressions: number }
interface TrendRow { week: string; posts: number; impressions: number; engagementPct: number | null }
interface Report {
  connected: boolean
  mode: 'company-page' | 'personal'
  name: string | null
  stats: Stats | null
  posted: PostedRow[]
  pillarMix: PillarRow[]
  trend: TrendRow[]
  unsynced: number
}

const TYPE_LABEL: Record<string, string> = {
  ranking: 'Industry Ranking',
  news: 'AI News Analysis',
  education: 'GEO Education',
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}
function pct(n: number | null | undefined): string {
  return n == null ? '—' : (n * 100).toFixed(2) + '%'
}
function dash(n: number | null | undefined): string {
  return n == null ? '—' : fmt(n)
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-5 border ${accent ? 'bg-gold/5 border-gold/30' : 'bg-gray-900 border-gray-800'}`}>
      <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-serif)' }}>{value}</p>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}

function SkeletonCard({ h = 110 }: { h?: number }) {
  return <div className="rounded-2xl bg-gray-900 border border-gray-800 animate-pulse" style={{ height: h }} />
}

export default function MediaAnalytics() {
  const [data, setData] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [sortKey, setSortKey] = useState<'date' | 'impressions' | 'engagement'>('date')

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/linkedin/analytics')
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  async function syncStats() {
    setSyncing(true)
    try {
      const res = await fetch('/api/linkedin/analytics', { method: 'POST' })
      const j = await res.json()
      if (!res.ok) setToast({ kind: 'err', msg: j.error || 'Sync failed' })
      else if (j.synced > 0) { setToast({ kind: 'ok', msg: `Synced metrics for ${j.synced} post${j.synced === 1 ? '' : 's'}.` }); load() }
      else setToast({ kind: 'err', msg: j.reason || 'No metrics returned. Company-page analytics scope is required.' })
    } catch (e) {
      setToast({ kind: 'err', msg: e instanceof Error ? e.message : 'Sync failed' })
    } finally {
      setSyncing(false)
    }
  }

  const s = data?.stats
  const engagementRate =
    s && s.impressionCount > 0
      ? (((s.likeCount + s.commentCount + s.shareCount + s.clickCount) / s.impressionCount) * 100).toFixed(2) + '%'
      : '—'

  // Pillar mix for the donut: posts per content type.
  const pillarData = (data?.pillarMix ?? []).map(p => ({ name: TYPE_LABEL[p.type] ?? p.type, value: p.count }))
  // Best-performing pillar by avg engagement (only those with a measured rate).
  const bestPillar = (data?.pillarMix ?? [])
    .filter(p => p.avgEngagement != null)
    .sort((a, b) => (b.avgEngagement ?? 0) - (a.avgEngagement ?? 0))[0]

  // Trend series for the area chart (chronological, friendly week labels).
  const trendData = (data?.trend ?? []).map(t => ({
    week: new Date(t.week).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
    impressions: t.impressions,
    engagement: t.engagementPct ?? 0,
  }))
  const hasTrendImpressions = (data?.trend ?? []).some(t => t.impressions > 0)

  // Sorted post list.
  const posted = [...(data?.posted ?? [])].sort((a, b) => {
    if (sortKey === 'impressions') return (b.impressions ?? -1) - (a.impressions ?? -1)
    if (sortKey === 'engagement') return (b.engagementRate ?? -1) - (a.engagementRate ?? -1)
    return (b.postedAt ?? '').localeCompare(a.postedAt ?? '')
  })

  return (
    <div className="relative">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 rounded-xl border px-4 py-3 text-sm shadow-soft ${
          toast.kind === 'ok' ? 'bg-green-950/80 border-green-800 text-green-300' : 'bg-amber-950/80 border-amber-800 text-amber-200'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">LinkedIn Analytics</h2>
          <p className="text-gray-400 text-sm">Reach, engagement, and what content is working.</p>
        </div>
        <div className="flex items-center gap-2">
          {data?.connected && data.mode === 'company-page' && (
            <button
              onClick={syncStats}
              disabled={syncing}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-200 disabled:opacity-50"
              title="Pull the latest per-post impressions and engagement from LinkedIn"
            >
              {syncing ? 'Syncing…' : '↻ Sync stats'}
            </button>
          )}
          {data && (
            <span
              className={`text-xs px-3 py-1.5 rounded-lg border ${
                data.connected
                  ? 'text-green-400 bg-green-950/40 border-green-900'
                  : 'text-amber-400 bg-amber-950/30 border-amber-900'
              }`}
            >
              {data.connected
                ? `Connected${data.name ? ` · ${data.name}` : ''} · ${data.mode === 'company-page' ? 'company page' : 'personal'}`
                : 'Not connected'}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <SkeletonCard h={300} /><SkeletonCard h={300} /><SkeletonCard h={300} />
          </div>
        </div>
      ) : (
        <>
          {/* Reach KPI cards */}
          {s ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Stat accent label="Impressions" value={fmt(s.impressionCount)} hint={`${fmt(s.uniqueImpressionsCount)} unique`} />
              <Stat label="Engagement rate" value={engagementRate} hint="reactions + comments + shares + clicks ÷ impressions" />
              <Stat label="Reactions" value={fmt(s.likeCount)} hint={`${fmt(s.clickCount)} clicks`} />
              <Stat label="Comments / Shares" value={`${fmt(s.commentCount)} / ${fmt(s.shareCount)}`} />
            </div>
          ) : (
            <div className="bg-amber-950/20 border border-amber-900/60 rounded-2xl p-5 mb-6">
              <p className="text-sm text-amber-300 font-medium mb-1">Reach metrics need company-page access</p>
              <p className="text-xs text-amber-400/80 leading-relaxed">
                Lifetime impressions, reactions and engagement are pulled from the LinkedIn company page.
                {data?.mode === 'personal'
                  ? ' You’re connected in personal mode — LinkedIn doesn’t expose analytics for personal posts via the API.'
                  : ' Reconnect at /api/linkedin/auth with the Community Management API product enabled so the token carries the analytics scope.'}
                {' '}Your published-post history is shown below regardless.
              </p>
            </div>
          )}

          {/* Charts row: pillar mix + engagement trend */}
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <ChartFrame
              title="Content mix"
              subtitle="Published posts by pillar"
              explainer={bestPillar ? `Best engagement: ${TYPE_LABEL[bestPillar.type] ?? bestPillar.type} (${pct(bestPillar.avgEngagement)})` : 'Sync stats to see which pillar performs best.'}
              height={220}
              empty={pillarData.length === 0}
              emptyHint="Publish posts from the Content tab to see your pillar mix."
            >
              <div className="grid grid-cols-2 gap-3 h-full items-center">
                <DonutChart data={pillarData} centerValue={String(pillarData.reduce((a, b) => a + b.value, 0))} centerLabel="posts" />
                <ChartLegend data={pillarData} />
              </div>
            </ChartFrame>

            <div className="md:col-span-2">
              <ChartFrame
                title="Reach & engagement over time"
                subtitle="Per week · last 12 weeks"
                explainer="Impressions (area) with engagement rate %. A rising line means your content is resonating more."
                height={220}
                empty={!hasTrendImpressions}
                emptyHint="Per-week reach appears once posts have synced impressions. Hit “Sync stats”."
              >
                <AreaTrend
                  data={trendData}
                  xKey="week"
                  series={[
                    { key: 'impressions', name: 'Impressions', color: CHART.gold },
                    { key: 'engagement', name: 'Engagement %', color: CHART.green },
                  ]}
                />
              </ChartFrame>
            </div>
          </div>

          {/* Per-post performance table */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-semibold text-white">Post performance</h3>
                <p className="text-xs text-gray-500">
                  {data ? `${data.posted.length} published` : ''}
                  {data && data.unsynced > 0 && <span className="text-amber-500"> · {data.unsynced} not yet synced</span>}
                </p>
              </div>
              {data && data.posted.length > 0 && (
                <div className="flex gap-1 text-xs">
                  {(['date', 'impressions', 'engagement'] as const).map(k => (
                    <button
                      key={k}
                      onClick={() => setSortKey(k)}
                      className={`px-2.5 py-1 rounded-lg capitalize ${sortKey === k ? 'bg-gold/15 text-gold border border-gold/30' : 'text-gray-500 hover:text-gray-300 border border-transparent'}`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!data || data.posted.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-12">
                <div className="h-12 w-12 rounded-2xl bg-gray-800 flex items-center justify-center mb-3 text-gray-500 text-xl">✎</div>
                <p className="text-gray-300 text-sm font-medium">No published posts yet</p>
                <p className="text-gray-500 text-xs mt-1 mb-4 max-w-xs">Draft, approve, and publish from the Content tab — performance shows up here.</p>
                <a href="/authority?workspace=media" className="text-xs bg-blue-800 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium">Go to Content</a>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-800">
                      <th className="text-left font-medium py-2 pr-3">Date</th>
                      <th className="text-left font-medium py-2 pr-3">Pillar</th>
                      <th className="text-left font-medium py-2 pr-3">Topic</th>
                      <th className="text-right font-medium py-2 px-3">Impressions</th>
                      <th className="text-right font-medium py-2 px-3">Reactions</th>
                      <th className="text-right font-medium py-2 px-3">Comments</th>
                      <th className="text-right font-medium py-2 pl-3">Engagement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posted.map(p => (
                      <tr key={p.id} className="border-b border-gray-800/60 last:border-0 hover:bg-gray-800/30">
                        <td className="py-2.5 pr-3 text-gray-500 whitespace-nowrap">
                          {p.postedAt ? new Date(p.postedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}
                        </td>
                        <td className="py-2.5 pr-3">
                          {p.postType && TYPE_LABEL[p.postType] && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-300 whitespace-nowrap">
                              {TYPE_LABEL[p.postType]}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-gray-300 max-w-[260px] truncate">{p.topic || '(untitled)'}</td>
                        <td className="py-2.5 px-3 text-right text-white tabular-nums">{dash(p.impressions)}</td>
                        <td className="py-2.5 px-3 text-right text-gray-300 tabular-nums">{dash(p.likes)}</td>
                        <td className="py-2.5 px-3 text-right text-gray-300 tabular-nums">{dash(p.comments)}</td>
                        <td className="py-2.5 pl-3 text-right tabular-nums">
                          <span className={p.engagementRate != null && p.engagementRate >= (bestPillar?.avgEngagement ?? 0) ? 'text-green-400' : 'text-gray-300'}>
                            {pct(p.engagementRate)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.posted.every(p => p.statsSyncedAt == null) && (
                  <p className="text-[11px] text-gray-600 mt-3">
                    Per-post metrics show “—” until synced. Click <span className="text-gray-400">↻ Sync stats</span> (company-page connection required).
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
