import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../../lib/db'
import { publishPost } from '../../../lib/linkedin'

// Publish a stored post to LinkedIn, then mark it posted.
export async function POST(req: NextRequest) {
  const { id } = await req.json()
  const rows = (await sql`SELECT id, body, status FROM posts WHERE id = ${id}`) as { id: string; body: string; status: string }[]
  if (rows.length === 0) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  try {
    const linkedinId = await publishPost(rows[0].body)
    await sql`UPDATE posts SET status = 'posted', posted_at = now(), linkedin_id = ${linkedinId} WHERE id = ${id}`
    return NextResponse.json({ ok: true, linkedinId })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
