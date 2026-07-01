import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../../lib/db'
import { writePost, TOPICS_BY_TYPE, type PostType } from '../../../lib/postwriter'
import { safeEqual } from '../../../lib/auth'

// The daily post is always authored on the private side.
const WORKSPACE = 'private'

// Pillar by weekday (UTC) — see docs/CONTENT-STRATEGY.md.
// Mon = ranking, Wed = news, Fri = education.
const TYPE_BY_UTC_DAY: Record<number, PostType> = { 1: 'ranking', 3: 'news', 5: 'education' }

// FALLBACK drafter for the Mon/Wed/Fri publishing cadence. The primary
// drafter is the `linkedin-authority-drafts` scheduled Claude agent (runs on
// the owner's subscription at 8am local with real scanner/news data). This
// cron fires later in the day and is idempotent: if any post was already
// created today (i.e. the agent ran), it does nothing. On other weekdays it
// also does nothing.
//
// Auth: this route is exempt from the session gate (proxy.ts) because the cron
// has no session. It authenticates instead with CRON_SECRET, sent by Vercel Cron
// as `Authorization: Bearer <CRON_SECRET>`. When CRON_SECRET is unset the check
// is skipped (local/dev convenience).
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (!token || !safeEqual(token, secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const now = new Date()
  const type = TYPE_BY_UTC_DAY[now.getUTCDay()]
  if (!type) {
    return NextResponse.json({ ok: true, created: false, reason: 'Not a posting day (Mon/Wed/Fri).' })
  }

  // A post counts as "covered" if it was created today (day-of agent ran) OR
  // was prepared ahead and scheduled for today (monthly/weekly prep agents).
  const today = now.toISOString().split('T')[0]
  const existing = (await sql`
    SELECT count(*)::int AS n FROM posts
    WHERE (created_at::date = ${today}::date OR scheduled_for::date = ${today}::date)
      AND workspace = ${WORKSPACE}
  `) as { n: number }[]
  if (existing[0]?.n > 0) {
    return NextResponse.json({ ok: true, created: false, reason: 'A post already exists for today.' })
  }

  // Rotate topic by week-of-year so each pillar cycles through its list.
  const week = Math.floor((Date.now() - new Date(now.getUTCFullYear(), 0, 0).getTime()) / (7 * 86400000))
  const topics = TOPICS_BY_TYPE[type]
  const topic = topics[week % topics.length]

  const { body, source } = await writePost(topic, type)
  const id = Date.now().toString()
  await sql`
    INSERT INTO posts (id, topic, body, status, source, workspace, post_type)
    VALUES (${id}, ${topic}, ${body}, 'draft', ${source}, ${WORKSPACE}, ${type})
  `
  return NextResponse.json({ ok: true, created: true, type, topic })
}
