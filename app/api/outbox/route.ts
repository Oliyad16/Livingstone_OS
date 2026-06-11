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

// The approval gate. Edit a draft's subject/body, approve it (draft → queued,
// the sender script only sends 'queued'), or reject it (draft → rejected).
// Status changes are restricted to draft/queued/rejected so 'sent' rows stay
// immutable history.
export async function PUT(req: NextRequest) {
  const { id, subject, body, status } = await req.json()
  const existing = (await sql.query(`${SELECT} WHERE id = $1`, [id])) as { status: string; subject: string; body: string }[]
  if (existing.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const cur = existing[0]
  if (cur.status === 'sent') return NextResponse.json({ error: 'Already sent' }, { status: 409 })

  const nextStatus = status === undefined ? cur.status
    : ['draft', 'queued', 'rejected'].includes(status) ? status : null
  if (nextStatus === null) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  await sql`
    UPDATE email_outbox SET
      subject = ${subject ?? cur.subject},
      body    = ${body ?? cur.body},
      status  = ${nextStatus}
    WHERE id = ${id}
  `
  const rows = await sql.query(`${SELECT} WHERE id = $1`, [id])
  return NextResponse.json(rows[0])
}

// Remove a draft/rejected/failed row outright. Sent rows are kept as history.
export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  await sql`DELETE FROM email_outbox WHERE id = ${id} AND status <> 'sent'`
  return NextResponse.json({ ok: true })
}
