'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DonutChart } from '../components/charts/Charts'

interface Post {
  id: string; topic: string; status: string; postType: string | null
  scheduledFor: string | null; postedAt: string | null
}
interface PillarRow { type: string; count: number; avgEngagement: number | null }
interface Analytics {
  connected: boolean
  mode: 'company-page' | 'personal'
  name: string | null
  stats: { impressionCount: number; likeCount: number; commentCount: number; shareCount: number } | null
  pillarMix: PillarRow[]
  posted: { topic: string; postType: string | null; postedAt: string | null; impressions: number | null; engagementRate: number | null }[]
}

const TYPE_LABEL: Record<string, string> = {
  ranking: 'Industry Ranking',
  news: 'AI News Analysis',
  education: 'GEO Education',
}
const fmt = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n))
const startOfWeek = () => {
  const d = new Date()
  const day = (d.getDay() + 6) % 7 // Monday = 0
  d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - day)
  return d
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-gray-900 border border-gray-800 rounded-2xl p-5 ${className}`}>{children}</div>
}

export default function MediaHub() {
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [a, setA] = useState<Analytics | null>(null)

  useEffect(() => {
    fetch('/api/posts?workspace=media').then(r => r.json()).then(setPosts).catch(() => setPosts([]))
    fetch('/api/linkedin/analytics').then(r => r.json()).then(setA).catch(() => setA(null))
  }, [])

  const loading = posts === null || a === null
  const weekStart = startOfWeek()
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7)

  const thisWeek = (posts ?? [])
    .filter(p => p.scheduledFor && p.status !== 'posted')
    .filter(p => { const d = new Date(p.scheduledFor!); return d >= weekStart && d < weekEnd })
    .sort((x, y) => (x.scheduledFor! < y.scheduledFor! ? -1 : 1))

  const drafts = (posts ?? []).filter(p => p.status === 'draft').length
  const approved = (posts ?? []).filter(p => p.status === 'approved').length
  const postedCount = (posts ?? []).filter(p => p.status === 'posted').length

  const lastPost = (a?.posted ?? [])[0]
  const pillarData = (a?.pillarMix ?? []).map(p => ({ name: TYPE_LABEL[p.type] ?? p.type, value: p.count }))
  const totalReactions = a?.stats ? a.stats.likeCount + a.stats.commentCount + a.stats.shareCount : null

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-gray-900 rounded animate-pulse" />
        <div className="grid md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-40 bg-gray-900 border border-gray-800 rounded-2xl animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Media</h2>
          <p className="text-gray-400 text-sm">Your LinkedIn authority engine — at a glance.</p>
        </div>
        <span className={`text-xs px-3 py-1.5 rounded-lg border ${a?.connected ? 'text-green-400 bg-green-950/40 border-green-900' : 'text-amber-400 bg-amber-950/30 border-amber-900'}`}>
          {a?.connected ? `Connected${a.name ? ` · ${a.name}` : ''}` : 'LinkedIn not connected'}
        </span>
      </div>

      {/* Top row: pipeline snapshot · lifetime reach · pillar mix */}
      <div className="grid md:grid-cols-3 gap-4 mb-4">
        {/* Pipeline */}
        <Card>
          <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-3">Content pipeline</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { n: drafts, l: 'Drafts', href: '/authority?workspace=media' },
              { n: approved, l: 'Approved', href: '/authority?workspace=media' },
              { n: postedCount, l: 'Posted', href: '/media/analytics' },
            ].map(s => (
              <Link key={s.l} href={s.href} className="rounded-xl bg-gray-950 border border-gray-800 py-3 hover:border-gray-700 transition-colors">
                <p className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-serif)' }}>{s.n}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{s.l}</p>
              </Link>
            ))}
          </div>
        </Card>

        {/* Lifetime reach */}
        <Card>
          <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-3">Lifetime reach</p>
          {a?.stats ? (
            <div className="flex items-end gap-4">
              <div>
                <p className="text-3xl font-bold text-white leading-none" style={{ fontFamily: 'var(--font-serif)' }}>{fmt(a.stats.impressionCount)}</p>
                <p className="text-xs text-gray-500 mt-1">impressions</p>
              </div>
              <div className="text-xs text-gray-400 space-y-0.5 pb-0.5">
                <p>{fmt(totalReactions ?? 0)} engagements</p>
                <p className="text-gray-600">company page</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 leading-relaxed">Reach appears once a company-page connection with the analytics scope is active. <Link href="/media/analytics" className="text-gold hover:underline">Details →</Link></p>
          )}
        </Card>

        {/* Pillar mix mini */}
        <Card>
          <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-2">Content mix</p>
          {pillarData.length > 0 ? (
            <div className="flex items-center gap-3">
              <div className="h-20 w-20 shrink-0">
                <DonutChart data={pillarData} centerValue={String(pillarData.reduce((s, d) => s + d.value, 0))} centerLabel="posts" />
              </div>
              <ul className="text-xs space-y-1 flex-1">
                {(a?.pillarMix ?? []).slice(0, 3).map(p => (
                  <li key={p.type} className="flex justify-between gap-2">
                    <span className="text-gray-400 truncate">{TYPE_LABEL[p.type] ?? p.type}</span>
                    <span className="text-gray-300">{p.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No published posts yet.</p>
          )}
        </Card>
      </div>

      {/* Second row: this week's plan · last post */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* This week's posting plan */}
        <Card className="md:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-200">This week’s plan</p>
            <Link href="/authority?workspace=media" className="text-xs text-gold hover:underline">Open Content →</Link>
          </div>
          {thisWeek.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-gray-400">Nothing scheduled this week.</p>
              <p className="text-xs text-gray-600 mt-1">The Mon/Wed/Fri engine fills the calendar — or draft one now.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {thisWeek.map(p => (
                <div key={p.id} className="flex items-center gap-3 text-sm">
                  <span className="text-gray-400 w-24 shrink-0">{new Date(p.scheduledFor!).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  {p.postType && TYPE_LABEL[p.postType] && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-300 shrink-0">{TYPE_LABEL[p.postType]}</span>
                  )}
                  <span className="text-gray-300 truncate">{p.topic}</span>
                  <span className={`ml-auto text-xs capitalize shrink-0 ${p.status === 'approved' ? 'text-green-400' : 'text-gray-500'}`}>{p.status}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Last published post */}
        <Card>
          <p className="text-sm font-semibold text-gray-200 mb-3">Last published</p>
          {lastPost ? (
            <div>
              {lastPost.postType && TYPE_LABEL[lastPost.postType] && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-300">{TYPE_LABEL[lastPost.postType]}</span>
              )}
              <p className="text-sm text-gray-200 mt-2 line-clamp-2">{lastPost.topic || '(untitled)'}</p>
              <p className="text-[11px] text-gray-500 mt-1">{lastPost.postedAt ? new Date(lastPost.postedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</p>
              <div className="flex gap-4 mt-3 pt-3 border-t border-gray-800 text-sm">
                <div><p className="text-white font-semibold">{lastPost.impressions != null ? fmt(lastPost.impressions) : '—'}</p><p className="text-[11px] text-gray-500">impressions</p></div>
                <div><p className="text-white font-semibold">{lastPost.engagementRate != null ? (lastPost.engagementRate * 100).toFixed(1) + '%' : '—'}</p><p className="text-[11px] text-gray-500">engagement</p></div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No published posts yet. <Link href="/authority?workspace=media" className="text-gold hover:underline">Draft one →</Link></p>
          )}
        </Card>
      </div>
    </div>
  )
}
