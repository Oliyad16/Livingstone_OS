#!/usr/bin/env node
/**
 * RFPMart DIGEST exploder for the Livingstone command center.
 *
 * RFPMart's "Daily RFP Notification" emails are not one opportunity each — they
 * bundle dozens of line-items in a fixed shape:
 *
 *   *<ID> - USA (<Location>) - <Title> - Deadline <Month Day,Year>*
 *   ( New RFP )
 *   https://files.rfpmart.com/document/<category>/<ID>_....zip
 *
 * fetch-rfpmart.mjs ingests the whole email as a single row, which floods the
 * deal rooms with digest containers. This script instead PARSES each line-item,
 * keeps only the ones in Livingstone's service line (web/digital/IT/comms/
 * training), and POSTs each as its own opportunity into the government workspace.
 * Dedupes on the RFPMart item id (stored as solNo), so it is safe to re-run.
 *
 * Usage:
 *   node scripts/fetch-rfpmart-digest.mjs                 # parse + ingest (45d)
 *   node scripts/fetch-rfpmart-digest.mjs --dry-run       # parse + print, no write
 *   node scripts/fetch-rfpmart-digest.mjs --days 30
 *   node scripts/fetch-rfpmart-digest.mjs --all           # skip the relevance gate
 *
 * Env (shell or .env.local): BASE_URL (default http://localhost:3000),
 *   DASHBOARD_USER + DASHBOARD_PASSWORD (login for session cookie) OR CRON_SECRET.
 *   Reading Gmail uses the local `gws` CLI (must be authed: `gws auth login`).
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync } from 'node:fs'

const execFileP = promisify(execFile)
const argv = process.argv.slice(2)
const DRY = argv.includes('--dry-run')
const RELEVANT_ONLY = !argv.includes('--all')
// --top ingests only the high-signal slice: DC/DMV-located items, plus the premium
// service prefixes everywhere. Keeps the deal rooms focused instead of dumping 400+.
const TOP_ONLY = argv.includes('--top')
const days = (() => { const i = argv.indexOf('--days'); return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : 45 })()

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
const DASHBOARD_USER = fromEnv('DASHBOARD_USER', 'Oliyad')
const DASHBOARD_PASSWORD = fromEnv('DASHBOARD_PASSWORD', '')

// RFPMart encodes the category in the id prefix. Gate primarily on prefix:
//   ALWAYS_IN  → squarely Livingstone's service line, keep regardless of wording.
//   KEYWORD_IN → broad tech buckets (SW/ITES) that hold both real dev work AND
//                pure license/product renewals; keep only if the title reads like
//                a build/design/dev/integration SERVICE, not a product purchase.
// Everything else (CSE security guards, NET cabling, EQU hardware, FOOD, FIRE…)
// is dropped.
const ALWAYS_IN = new Set(['WD', 'SEO', 'MOBI', 'AI', 'MRB', 'ANIM', 'DRA', 'MB'])
const KEYWORD_IN = new Set(['SW', 'ITES'])
// Title must read like a service we deliver (web/app/digital/design/dev/integration).
const SERVICE_RE = /\b(web|website|digital|portal|drupal|wordpress|cms|ux|ui|content|communicat|outreach|market|brand|media|advertis|campaign|graphic|video|social|e-?learning|courseware|curriculum|instructional|learning platform|webinar|seo|hosting|redesign|application develop|app develop|develop(ment|er)|programming|software develop|systems? (design|integration|develop)|integration|modernization|user experience|custom (software|application))/i
// Strong negatives — license renewals & product purchases masquerading as "software".
const EXCLUDE_RE = /\b(license|licenses|licensing|renewal|subscription|maintenance|upgrade|support services for|product|reseller|camera|printer|scanner|hardware|appliance|firewall|server licens|antivirus|backup|storage array|oracle|cisco|microsoft exchange|vmware|sailpoint|palo alto|check point|zoom|sap |ibm |adobe (acrobat|reader)|wayfinding|signage|sign fabrication|fabrication|framing|installation service|graphics card|materials-tools)\b/i
// Premium service prefixes — the work Livingstone most directly delivers.
const PREMIUM = new Set(['WD', 'SEO', 'MOBI', 'AI', 'MRB', 'ITES'])

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
function toIso(monthDayYear) {
  // "July 13,2026" / "July 13, 2026" → 2026-07-13
  const m = monthDayYear.match(/([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/)
  if (!m) return null
  const mo = MONTHS[m[1].slice(0, 3).toLowerCase()]
  if (!mo) return null
  return `${m[3]}-${String(mo).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}`
}

// Parse a digest body into line-items. The id prefix encodes the category
// (WD=Website Design, IT/NET/SW=tech, MK/PR/AD=marketing, TR/EDU=training…).
function parseDigest(body) {
  const items = []
  // Each item starts with *<ID> - ... - Deadline <date>* then a files.rfpmart URL.
  const re = /\*\s*([A-Z]{2,4}-\d+)\s*-\s*([\s\S]*?)\s*-\s*Deadline\s+([A-Za-z]+\s+\d{1,2},?\s*\d{4})\s*\*[\s\S]*?(https:\/\/files\.rfpmart\.com\/\S+\.zip)?/g
  let m
  while ((m = re.exec(body))) {
    const id = m[1].trim()
    // Collapse \r\n and runs of whitespace first — line wraps split the title.
    let rest = m[2].replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
    // rest is usually "USA (Location) - Title" or "Country (Location) - Title".
    let location = '', title = rest
    const loc = rest.match(/^[A-Za-z]+\s*\(([^)]*)\)\s*-\s*([\s\S]+)$/)
    if (loc) { location = loc[1].trim(); title = loc[2].trim() }
    // Trim RFPMart's trailing "- INFO ONLY, RFP NOT INCLUDED" marker off the title.
    const infoOnly = /INFO ONLY|RFP NOT INCLUDED/i.test(title)
    title = title.replace(/\s*-\s*INFO ONLY.*$/i, '').trim()
    items.push({ id, prefix: id.split('-')[0].toUpperCase(), title, location, infoOnly, dueDate: toIso(m[3]), url: (m[4] || '').trim() })
  }
  return items
}

function isRelevant(it) {
  if (!RELEVANT_ONLY) return true
  if (EXCLUDE_RE.test(it.title)) return false
  if (ALWAYS_IN.has(it.prefix)) return true
  if (KEYWORD_IN.has(it.prefix)) return SERVICE_RE.test(it.title)
  return false
}

// DC proper (and the immediate DMV ring) — used only for ranking, on the location
// string which is now parsed cleanly. Word-boundaried so it doesn't over-match.
function isDc(it) {
  return /\b(washington,?\s*d\.?c\.?|district of columbia|d\.?c\.?)\b/i.test(it.location)
}
function isDmv(it) {
  return isDc(it) || /\b(maryland|virginia)\b/i.test(it.location)
}

function mapItem(it) {
  const dc = isDc(it) ? ' [DC]' : (isDmv(it) ? ' [DMV]' : '')
  return {
    workspace: 'government',
    title: it.title.slice(0, 280),
    solNo: it.id,
    agency: it.location ? `RFPMart — ${it.location}` : 'RFPMart listing',
    naics: '',
    setAside: '',
    value: 0,
    dueDate: it.dueDate,
    stage: 'identified',
    source: 'rfpmart-digest',
    url: it.url || '',
    oppType: 'RFP',
    verified: 'pending',
    summary: `RFPMart-listed RFP${it.location ? ` (${it.location})` : ''}${dc}. ${it.id}. Download the solicitation zip and enrich to pull submission requirements + budget.`,
    notes: `Exploded from an RFPMart daily digest ${new Date().toISOString().slice(0, 10)}.${dc} Doc: ${it.url || 'n/a'}`,
    extra: { rfpmartId: it.id, location: it.location, docUrl: it.url },
  }
}

async function gws(args) {
  const { stdout } = await execFileP('gws', args, { maxBuffer: 64 * 1024 * 1024 })
  return JSON.parse(stdout)
}
function decodeB64Url(d) { return Buffer.from(d.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8') }
function extractBody(payload) {
  const stack = [payload]; let plain = '', html = ''
  while (stack.length) {
    const p = stack.pop(); const mime = p.mimeType || ''
    if (p.body?.data) {
      if (mime === 'text/plain' && !plain) plain = decodeB64Url(p.body.data)
      else if (mime === 'text/html' && !html) html = decodeB64Url(p.body.data)
    }
    if (p.parts) stack.push(...p.parts)
  }
  if (plain) return plain
  return html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
}

async function authHeaders() {
  if (CRON_SECRET) return { Authorization: `Bearer ${CRON_SECRET}` }
  if (!DASHBOARD_PASSWORD) throw new Error('No CRON_SECRET / DASHBOARD_PASSWORD — cannot authenticate.')
  const res = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: DASHBOARD_USER, password: DASHBOARD_PASSWORD }),
  })
  if (!res.ok) throw new Error(`Login failed HTTP ${res.status}`)
  const cookie = res.headers.get('set-cookie')?.split(';')[0] || ''
  if (!cookie) throw new Error('No session cookie returned.')
  return { Cookie: cookie }
}

async function main() {
  const q = `subject:("Daily RFP Notification") newer_than:${days}d`
  console.log(`Gmail: ${q}${DRY ? ' (dry run)' : ''}`)
  const list = await gws(['gmail', 'users', 'messages', 'list', '--params', JSON.stringify({ userId: 'me', q, maxResults: 50 })])
  const ids = (list.messages || []).map(m => m.id)
  if (!ids.length) { console.log('No digest emails found.'); return }
  console.log(`${ids.length} digest email(s).`)

  const byId = new Map()
  for (const id of ids) {
    const msg = await gws(['gmail', 'users', 'messages', 'get', '--params', JSON.stringify({ userId: 'me', id, format: 'full' })])
    for (const it of parseDigest(extractBody(msg.payload))) {
      if (it.id && !byId.has(it.id)) byId.set(it.id, it)
    }
  }
  const all = [...byId.values()]
  let kept = all.filter(isRelevant)
  if (TOP_ONLY) kept = kept.filter(it => isDmv(it) || PREMIUM.has(it.prefix))
  // DC first, then the DMV ring, then soonest deadline.
  const rank = it => (isDc(it) ? 2 : isDmv(it) ? 1 : 0)
  kept.sort((a, b) => rank(b) - rank(a) || String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')))
  const byPrefix = kept.reduce((acc, it) => ((acc[it.prefix] = (acc[it.prefix] || 0) + 1), acc), {})
  console.log(`Parsed ${all.length} line-items → ${kept.length} relevant${RELEVANT_ONLY ? '' : ' (gate off)'}.`)
  console.log(`  by category: ${Object.entries(byPrefix).map(([p, c]) => `${p}:${c}`).join('  ')}\n`)

  if (DRY) {
    for (const it of kept) console.log(`  ${isDc(it) ? 'DC ' : isDmv(it) ? 'DMV' : '   '} ${it.dueDate || 'n/a   '} | ${it.id.padEnd(12)} | ${it.title.slice(0, 58)}`)
    console.log('\nDry run — ingested nothing.'); return
  }

  const headers = await authHeaders()
  // Dedupe vs existing solNos.
  const existing = await fetch(`${BASE_URL}/api/opportunities?workspace=government`, { headers })
    .then(r => r.ok ? r.json() : []).then(rows => new Set(rows.map(r => r.solNo).filter(Boolean)))
  let created = 0, skipped = 0, failed = 0
  for (const it of kept) {
    if (existing.has(it.id)) { skipped++; continue }
    try {
      const res = await fetch(`${BASE_URL}/api/opportunities`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(mapItem(it)),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      created++; console.log(`  ✓ ${it.id}  ${it.title.slice(0, 56)}`)
    } catch (e) { failed++; console.error(`  ✗ ${it.id}: ${e.message}`) }
  }
  console.log(`\nIngested ${created} new, skipped ${skipped} existing, failed ${failed}. Done.`)
}

main().catch(e => { console.error(e.message || e); process.exit(1) })
