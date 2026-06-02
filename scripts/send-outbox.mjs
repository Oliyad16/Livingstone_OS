#!/usr/bin/env node
/**
 * Local Gmail sender for the Livingstone command center.
 *
 * Reads queued rows from email_outbox, sends each via the `gws` CLI
 * (gmail.users.messages.send), marks them sent, and logs a touchpoint on the
 * lead so it clears the Follow-ups queue.
 *
 * Runs locally (or on a cron box) — NOT on Vercel, since gws is a CLI binary
 * with local OAuth credentials.
 *
 * Usage:
 *   node scripts/send-outbox.mjs            # send all queued
 *   node scripts/send-outbox.mjs --dry-run  # show what would send, send nothing
 *
 * Requires: DATABASE_URL in env (or .env.local), and `gws auth login` already done.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const execFileP = promisify(execFile)
const DRY = process.argv.includes('--dry-run')

// Load DATABASE_URL from env or .env.local
function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  try {
    const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    const m = env.match(/^DATABASE_URL=(.+)$/m)
    if (m) return m[1].trim()
  } catch {}
  throw new Error('DATABASE_URL not set and not found in .env.local')
}

// Build a base64url-encoded RFC822 message for the Gmail API `raw` field.
function buildRaw({ to, subject, body }) {
  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
  ]
  const mime = headers.join('\r\n') + '\r\n\r\n' + body
  return Buffer.from(mime, 'utf8').toString('base64url')
}

async function sendViaGws(raw) {
  // gws gmail users messages send --json '{"raw":"..."}'
  const { stdout } = await execFileP('gws', [
    'gmail', 'users', 'messages', 'send',
    '--params', JSON.stringify({ userId: 'me' }),
    '--json', JSON.stringify({ raw }),
  ])
  return stdout
}

async function main() {
  const db = new Client({ connectionString: databaseUrl() })
  await db.connect()

  const { rows: queued } = await db.query(
    `SELECT id, lead_id, to_email, subject, body FROM email_outbox WHERE status = 'queued' ORDER BY created_at ASC`
  )

  if (queued.length === 0) {
    console.log('Outbox empty. Nothing to send.')
    await db.end()
    return
  }

  console.log(`${queued.length} email(s) queued${DRY ? ' (dry run)' : ''}.`)

  for (const row of queued) {
    console.log(`\n→ ${row.to_email} — "${row.subject}"`)
    if (DRY) { console.log('  [dry-run] not sending'); continue }

    try {
      const raw = buildRaw({ to: row.to_email, subject: row.subject, body: row.body })
      await sendViaGws(raw)

      await db.query(`UPDATE email_outbox SET status = 'sent', sent_at = now(), error = NULL WHERE id = $1`, [row.id])

      // Log a touchpoint so the lead clears the Follow-ups queue.
      if (row.lead_id) {
        const tp = JSON.stringify({ type: 'email', notes: `Sent: ${row.subject}`, date: new Date().toISOString() })
        await db.query(
          `UPDATE leads
           SET touchpoints = COALESCE(touchpoints, '[]'::jsonb) || $1::jsonb,
               last_contacted_at = now()
           WHERE id = $2`,
          [tp, row.lead_id]
        )
      }
      console.log('  ✓ sent')
    } catch (err) {
      const msg = (err && err.message) || String(err)
      await db.query(`UPDATE email_outbox SET status = 'failed', error = $1 WHERE id = $2`, [msg, row.id])
      console.error(`  ✗ failed: ${msg}`)
    }
  }

  await db.end()
  console.log('\nDone.')
}

main().catch(e => { console.error(e); process.exit(1) })
