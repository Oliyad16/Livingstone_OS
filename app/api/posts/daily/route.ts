import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../../lib/db'
import { writePost, TOPIC_SUGGESTIONS } from '../../../lib/postwriter'
import { safeEqual } from '../../../lib/auth'

// The daily post is always authored on the private side.
const WORKSPACE = 'private'

// Generate one draft per day on a rotating GEO topic. Idempotent: if a draft
// was already created today, does nothing. Intended to be hit by a daily cron.
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

  const today = new Date().toISOString().split('T')[0]

  const existing = (await sql`
    SELECT count(*)::int AS n FROM posts
    WHERE created_at::date = ${today}::date AND workspace = ${WORKSPACE}
  `) as { n: number }[]
  if (existing[0]?.n > 0) {
    return NextResponse.json({ ok: true, created: false, reason: 'A post was already created today.' })
  }

  // Rotate topic by day-of-year so it varies without randomness.
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000)
  const topic = TOPIC_SUGGESTIONS[dayOfYear % TOPIC_SUGGESTIONS.length]

  const { body, source } = await writePost(topic)
  const id = Date.now().toString()
  await sql`
    INSERT INTO posts (id, topic, body, status, source, workspace)
    VALUES (${id}, ${topic}, ${body}, 'draft', ${source}, ${WORKSPACE})
  `
  return NextResponse.json({ ok: true, created: true, topic })
}
