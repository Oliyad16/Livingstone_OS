import { NextResponse } from 'next/server'
import { sql } from '../../../lib/db'
import { writePost, TOPIC_SUGGESTIONS } from '../../../lib/postwriter'

// Generate one draft per day on a rotating GEO topic. Idempotent: if a draft
// was already created today, does nothing. Intended to be hit by a daily cron.
export async function POST() {
  const today = new Date().toISOString().split('T')[0]

  const existing = (await sql`
    SELECT count(*)::int AS n FROM posts
    WHERE created_at::date = ${today}::date
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
    VALUES (${id}, ${topic}, ${body}, 'draft', ${source}, 'private')
  `
  return NextResponse.json({ ok: true, created: true, topic })
}

// Allow GET too so a cron service / browser can trigger it easily.
export const GET = POST
