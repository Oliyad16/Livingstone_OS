import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../../lib/db'
import { getOrgStats, getPostStats, getConnection, orgUrn } from '../../../lib/linkedin'
import { safe, guard } from '../../../lib/handler'

// LinkedIn content analytics for the Media workspace. Combines:
// - the connection state + posting mode,
// - lifetime company-page share stats (when in org mode with a scoped token),
// - the locally stored history of published posts WITH cached per-post metrics,
// - pillar mix (count + avg engagement by content type),
// - a weekly trend series (posts + impressions + engagement per ISO week).
// Degrades gracefully: missing org token/scope → stats null, per-post metrics
// show as null (UI renders "—", never a fake 0).

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

export const GET = safe(
  async () => {
    const conn = await getConnection()
    const connected = !!conn?.access_token && (!!conn?.member_urn || !!orgUrn())

    const stats = await getOrgStats()

    const posted = (await sql`
      SELECT id, topic, post_type AS "postType", linkedin_id AS "linkedinId",
             ugc_urn AS "ugcUrn", posted_at AS "postedAt",
             impressions, unique_impressions AS "uniqueImpressions", clicks,
             likes, comments, shares, engagement_rate AS "engagementRate",
             stats_synced_at AS "statsSyncedAt"
      FROM posts
      WHERE status = 'posted' AND workspace = 'media'
      ORDER BY posted_at DESC NULLS LAST
      LIMIT 100
    `) as PostedRow[]

    // Pillar mix: count + avg engagement rate by content type (published posts).
    const pillarMix = (await sql`
      SELECT COALESCE(post_type, 'news') AS "type",
             count(*)::int AS count,
             round(avg(engagement_rate) FILTER (WHERE engagement_rate IS NOT NULL)::numeric, 4) AS "avgEngagement",
             COALESCE(sum(impressions), 0)::int AS impressions
      FROM posts
      WHERE status = 'posted' AND workspace = 'media'
      GROUP BY 1 ORDER BY 2 DESC
    `) as { type: string; count: number; avgEngagement: number | null; impressions: number }[]

    // Weekly trend: posts + summed impressions + avg engagement per ISO week (12w).
    const trend = (await sql`
      SELECT to_char(date_trunc('week', posted_at), 'YYYY-MM-DD') AS week,
             count(*)::int AS posts,
             COALESCE(sum(impressions), 0)::int AS impressions,
             round((avg(engagement_rate) FILTER (WHERE engagement_rate IS NOT NULL) * 100)::numeric, 2) AS "engagementPct"
      FROM posts
      WHERE status = 'posted' AND workspace = 'media' AND posted_at IS NOT NULL
        AND posted_at > now() - interval '12 weeks'
      GROUP BY 1 ORDER BY 1
    `) as { week: string; posts: number; impressions: number; engagementPct: number | null }[]

    // Cadence kept for back-compat (posts/week); same source as trend.
    const cadence = trend.map(t => ({ week: t.week, count: t.posts }))

    // How many posted rows still lack a stats sync (drives the "Sync stats" hint).
    const unsynced = posted.filter(p => p.ugcUrn && p.statsSyncedAt == null).length

    return NextResponse.json({
      connected,
      mode: orgUrn() ? 'company-page' : 'personal',
      name: conn?.name ?? null,
      stats,
      posted,
      pillarMix,
      trend,
      cadence,
      unsynced,
    })
  },
  { connected: false, mode: 'personal', name: null, stats: null, posted: [], pillarMix: [], trend: [], cadence: [], unsynced: 0 }
)

// POST = refresh per-post statistics from LinkedIn into the DB. Pulls the stored
// UGC URNs for posted media content, queries per-share statistics, and caches the
// metrics on each row. No-op (synced:0) when org mode/scope is unavailable.
export const POST = guard(async (_req: NextRequest) => {
  const rows = (await sql`
    SELECT id, ugc_urn AS "ugcUrn"
    FROM posts
    WHERE status = 'posted' AND workspace = 'media' AND ugc_urn IS NOT NULL
  `) as { id: string; ugcUrn: string }[]

  if (rows.length === 0) return NextResponse.json({ ok: true, synced: 0, reason: 'no posts with a URN' })

  const urns = rows.map(r => r.ugcUrn)
  const statsByUrn = await getPostStats(urns)
  const hits = Object.keys(statsByUrn).length
  if (hits === 0) {
    return NextResponse.json({ ok: true, synced: 0, reason: 'no stats returned (company-page scope required)' })
  }

  let synced = 0
  for (const r of rows) {
    const s = statsByUrn[r.ugcUrn]
    if (!s) continue
    await sql`
      UPDATE posts SET
        impressions = ${s.impressionCount},
        unique_impressions = ${s.uniqueImpressionsCount},
        clicks = ${s.clickCount},
        likes = ${s.likeCount},
        comments = ${s.commentCount},
        shares = ${s.shareCount},
        engagement_rate = ${s.engagement},
        stats_synced_at = now()
      WHERE id = ${r.id}
    `
    synced++
  }
  return NextResponse.json({ ok: true, synced })
})
