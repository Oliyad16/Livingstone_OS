import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../lib/db'
import { safe, workspaceOf } from '../../lib/handler'
import { writePost } from '../../lib/postwriter'

const SELECT = `
  SELECT id, topic, body, status, source,
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

// POST { topic, workspace } → generate a draft and store it.
export async function POST(req: NextRequest) {
  const { topic, workspace } = await req.json()
  if (!topic) return NextResponse.json({ error: 'topic required' }, { status: 400 })
  const ws = workspace === 'government' ? 'government' : 'private'

  const { body, source } = await writePost(topic)
  const id = Date.now().toString()
  await sql`
    INSERT INTO posts (id, topic, body, status, source, workspace)
    VALUES (${id}, ${topic}, ${body}, 'draft', ${source}, ${ws})
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
