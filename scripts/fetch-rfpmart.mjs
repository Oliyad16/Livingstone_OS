#!/usr/bin/env node
/**
 * Local RFPMart intake reader for the Livingstone command center.
 *
 * Reads recent RFPMart emails via the `gws` CLI (gmail.users.messages.list/get),
 * parses each into a raw opportunity, and POSTs it to the intake endpoint
 * (/api/intake/rfpmart), which classifies (RFI vs RFP) + stores a pending
 * opportunity. The endpoint dedupes on the Gmail message id, so this is safe to
 * run repeatedly.
 *
 * Runs locally (or on a cron box) — NOT on Vercel, since gws is a CLI binary with
 * local OAuth credentials. Requires `gws auth login` to be current.
 *
 * Usage:
 *   node scripts/fetch-rfpmart.mjs               # fetch + ingest
 *   node scripts/fetch-rfpmart.mjs --dry-run     # parse + print, ingest nothing
 *   node scripts/fetch-rfpmart.mjs --days 60     # widen the lookback window
 *   node scripts/fetch-rfpmart.mjs --digest      # after ingest, queue the owner digest
 *
 * Env (from shell or .env.local): BASE_URL (default http://localhost:3000),
 *   CRON_SECRET (sent as Bearer if set). The query is tuned for RFPMart; adjust
 *   GMAIL_QUERY below if your sender differs.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync } from 'node:fs'

const execFileP = promisify(execFile)
const argv = process.argv.slice(2)
const DRY = argv.includes('--dry-run')
const DIGEST = argv.includes('--digest')
const days = (() => {
  const i = argv.indexOf('--days')
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : 45
})()

// Pull a value from process.env or .env.local (so the script works without a
// loaded shell env, matching scripts/send-outbox.mjs).
function fromEnv(key, fallback) {
  if (process.env[key]) return process.env[key]
  try {
    const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    const m = env.match(new RegExp(`^${key}=(.+)$`, 'm'))
    if (m) return m[1].trim()
  } catch {}
  return fallback
}

const BASE_URL = fromEnv('BASE_URL', 'http://localhost:3000')
const CRON_SECRET = fromEnv('CRON_SECRET', '')
// RFPMart sends from rfpmart.com; also catch forwarded items with an RFP/RFI subject.
const GMAIL_QUERY = `(from:rfpmart.com OR rfpmart OR subject:(RFP OR RFI OR "sources sought")) newer_than:${days}d`

async function gws(args) {
  const { stdout } = await execFileP('gws', args, { maxBuffer: 32 * 1024 * 1024 })
  return JSON.parse(stdout)
}

// Decode a base64url body part to UTF-8 text.
function decodeB64Url(data) {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

// Walk the MIME tree, preferring text/plain; fall back to a tag-stripped text/html.
function extractBody(payload) {
  if (!payload) return ''
  const stack = [payload]
  let plain = ''
  let html = ''
  while (stack.length) {
    const p = stack.pop()
    const mime = p.mimeType || ''
    if (p.body?.data) {
      if (mime === 'text/plain' && !plain) plain = decodeB64Url(p.body.data)
      else if (mime === 'text/html' && !html) html = decodeB64Url(p.body.data)
    }
    if (p.parts) stack.push(...p.parts)
  }
  if (plain) return plain
  if (html) return html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
  return ''
}

function header(headers, name) {
  const h = (headers || []).find(x => x.name?.toLowerCase() === name.toLowerCase())
  return h ? h.value : ''
}

function extractLinks(body) {
  const out = []
  const re = /https?:\/\/[^\s)>"']+/gi
  let m
  while ((m = re.exec(body)) && out.length < 30) out.push(m[0])
  return [...new Set(out)]
}

async function postIntake(item) {
  const res = await fetch(`${BASE_URL}/api/intake/rfpmart`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(CRON_SECRET ? { Authorization: `Bearer ${CRON_SECRET}` } : {}),
    },
    body: JSON.stringify(item),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json
}

async function main() {
  console.log(`Searching Gmail: ${GMAIL_QUERY}`)
  const list = await gws([
    'gmail', 'users', 'messages', 'list',
    '--params', JSON.stringify({ userId: 'me', q: GMAIL_QUERY, maxResults: 50 }),
  ])
  const ids = (list.messages || []).map(m => m.id)
  if (ids.length === 0) {
    console.log('No matching RFPMart emails found.')
    return
  }
  console.log(`${ids.length} message(s) found${DRY ? ' (dry run)' : ''}.`)

  let created = 0, skipped = 0, failed = 0
  for (const id of ids) {
    try {
      const msg = await gws([
        'gmail', 'users', 'messages', 'get',
        '--params', JSON.stringify({ userId: 'me', id, format: 'full' }),
      ])
      const headers = msg.payload?.headers
      const subject = header(headers, 'Subject')
      const from = header(headers, 'From')
      const dateMs = msg.internalDate ? Number(msg.internalDate) : null
      const bodyText = extractBody(msg.payload)
      const item = {
        sourceEmailId: id,
        subject,
        from,
        receivedAt: dateMs ? new Date(dateMs).toISOString() : '',
        bodyText,
        links: extractLinks(bodyText),
      }

      if (DRY) {
        console.log(`\n→ ${subject || '(no subject)'}\n  from: ${from}\n  links: ${item.links.length}  body: ${bodyText.length} chars`)
        continue
      }

      const r = await postIntake(item)
      if (r.created) { created++; console.log(`  ✓ ${r.oppType}  ${r.title}`) }
      else { skipped++; console.log(`  · skipped (${r.reason || 'dupe'})`) }
    } catch (err) {
      failed++
      console.error(`  ✗ ${id}: ${(err && err.message) || err}`)
    }
  }

  if (!DRY) {
    console.log(`\nIngested ${created} new, skipped ${skipped}, failed ${failed}.`)
    if (DIGEST && created > 0) {
      try {
        const res = await fetch(`${BASE_URL}/api/intake/digest`, {
          method: 'POST',
          headers: CRON_SECRET ? { Authorization: `Bearer ${CRON_SECRET}` } : {},
        })
        const j = await res.json().catch(() => ({}))
        console.log(res.ok ? `Digest queued to ${j.to}.` : `Digest skipped: ${j.error}`)
      } catch (e) {
        console.error(`Digest failed: ${e.message}`)
      }
    }
  }
  console.log('Done.')
}

main().catch(e => {
  if (String(e).includes('invalid_grant') || String(e).includes('authError')) {
    console.error('\ngws auth has expired. Run `gws auth login` and try again.')
  }
  console.error(e.message || e)
  process.exit(1)
})
