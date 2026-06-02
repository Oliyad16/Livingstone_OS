import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../lib/db'
import { safe } from '../../lib/handler'

const SELECT = `
  SELECT id, lead_id AS "leadId", to_email AS "toEmail", subject, body, status, error,
         created_at AS "createdAt", sent_at AS "sentAt"
  FROM email_outbox
`

// List queue (newest first). Used by the dashboard to show send status.
export const GET = safe(async () => {
  const rows = await sql.query(`${SELECT} ORDER BY created_at DESC`)
  return NextResponse.json(rows)
}, [])

// Enqueue an email to send via the local gws sender script.
export async function POST(req: NextRequest) {
  const { leadId, toEmail, subject, body } = await req.json()
  if (!toEmail || !subject || !body) {
    return NextResponse.json({ error: 'toEmail, subject, body required' }, { status: 400 })
  }
  const id = Date.now().toString()
  await sql`
    INSERT INTO email_outbox (id, lead_id, to_email, subject, body, status)
    VALUES (${id}, ${leadId ?? null}, ${toEmail}, ${subject}, ${body}, 'queued')
  `
  const rows = await sql.query(`${SELECT} WHERE id = $1`, [id])
  return NextResponse.json(rows[0], { status: 201 })
}
