import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../lib/db'
import { safe, workspaceOf } from '../../lib/handler'
import { writePost, isPostType } from '../../lib/postwriter'

const SELECT = `
  SELECT id, topic, body, status, source,
         post_type     AS "postType",
         scheduled_for AS "scheduledFor",
         created_at    AS "createdAt",
         posted_at     AS "postedAt"
  FROM posts
`

export const GET = safe(async (req) => {
  const ws = workspaceOf(req)
  const rows = await sql.query(`${SELECT} WHERE workspace = $1 ORDER BY created_at DESC`, [ws])
  return NextResponse.json(rows)
}, [])

// POST { topic, type?, workspace } → generate a draft and store it.
// POST { topic, type?, body, workspace } → store a pre-written draft as-is
// (used by the scheduled Claude agents, which draft on the owner's
// subscription and submit the finished text).
// POST { topic, type?, status: 'planned', scheduledFor, body? } → reserve a
// posting-calendar slot; body (optional) holds the research brief. A prep
// agent later fills it via PUT { id, body, status: 'draft' }.
export async function POST(req: NextRequest) {
  const payload = await req.json()
  const { topic, workspace } = payload
  if (!topic) return NextResponse.json({ error: 'topic required' }, { status: 400 })
  const ws = workspace === 'government' ? 'government' : workspace === 'media' ? 'media' : 'private'
  const type = isPostType(payload.type) ? payload.type : 'news'
  const status = payload.status === 'planned' ? 'planned' : 'draft'
  const scheduledFor =
    typeof payload.scheduledFor === 'string' && payload.scheduledFor ? payload.scheduledFor : null

  const { body, source } =
    typeof payload.body === 'string' && payload.body.trim()
      ? { body: payload.body.trim(), source: 'agent' }
      : status === 'planned'
        ? { body: '', source: 'agent' } // calendar slot — no text yet
        : await writePost(topic, type)
  const id = Date.now().toString()
  await sql`
    INSERT INTO posts (id, topic, body, status, source, workspace, post_type, scheduled_for)
    VALUES (${id}, ${topic}, ${body}, ${status}, ${source}, ${ws}, ${type}, ${scheduledFor})
  `
  const rows = await sql.query(`${SELECT} WHERE id = $1`, [id])
  return NextResponse.json(rows[0], { status: 201 })
}

// PUT { id, body?, status?, scheduledFor? }
export async function PUT(req: NextRequest) {
  const body = await req.json()
  const existing = await sql.query(`${SELECT} WHERE id = $1`, [body.id])
  if (existing.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const cur = existing[0]

  const status = body.status ?? cur.status
  const postedAt = status === 'posted' ? new Date().toISOString() : cur.postedAt

  await sql`
    UPDATE posts SET
      body          = ${body.body ?? cur.body},
      status        = ${status},
      scheduled_for = ${body.scheduledFor ?? cur.scheduledFor},
      posted_at     = ${postedAt}
    WHERE id = ${body.id}
  `
  const rows = await sql.query(`${SELECT} WHERE id = $1`, [body.id])
  return NextResponse.json(rows[0])
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  await sql`DELETE FROM posts WHERE id = ${id}`
  return NextResponse.json({ ok: true })
}
