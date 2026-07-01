#!/usr/bin/env node
/**
 * SAM.gov federal opportunity intake for the Livingstone command center.
 *
 * Queries the official SAM.gov Contract Opportunities API (v2 search), filters
 * to the NAICS codes Livingstone actually bids (web/digital/IT/comms/training),
 * maps each notice to the `opportunities` schema, and POSTs it into the
 * `government` workspace. Dedupes on the SAM notice id (stored as solNo), so it
 * is safe to run repeatedly — existing notices are skipped, not duplicated.
 *
 * Unlike fetch-rfpmart.mjs this needs no `gws`/OAuth — just a free SAM.gov public
 * API key (SAM_API_KEY). Get one at https://sam.gov → Account Details → API Key.
 * Runs locally or on a cron box; talks to the same intake API as the UI.
 *
 * Usage:
 *   node scripts/fetch-sam.mjs                     # fetch + ingest (last 30 days)
 *   node scripts/fetch-sam.mjs --dry-run           # fetch + print, ingest nothing
 *   node scripts/fetch-sam.mjs --days 60           # widen the posted-date window
 *   node scripts/fetch-sam.mjs --min 250000        # only ingest value >= $250k
 *   node scripts/fetch-sam.mjs --naics 541511,541810
 *   node scripts/fetch-sam.mjs --ptype o,k,r       # notice types (see SAM docs)
 *
 * Env (shell or .env.local): SAM_API_KEY (required), BASE_URL
 *   (default http://localhost:3000), DASHBOARD_USER + DASHBOARD_PASSWORD (used to
 *   log in for a session cookie when CRON_SECRET is unset), CRON_SECRET (sent as
 *   Bearer if set, skips the login step).
 */
import { readFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const DRY = argv.includes('--dry-run')
const numArg = (flag, dflt) => {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : dflt
}
const strArg = (flag, dflt) => {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}
const days = numArg('--days', 30)
const MIN_VALUE = numArg('--min', 0)

// Pull a value from process.env or .env.local (matches fetch-rfpmart.mjs).
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
const SAM_API_KEY = fromEnv('SAM_API_KEY', '')
const DASHBOARD_USER = fromEnv('DASHBOARD_USER', 'Oliyad')
const DASHBOARD_PASSWORD = fromEnv('DASHBOARD_PASSWORD', '')

// NAICS Livingstone bids: custom programming, systems design, web design,
// graphic design, marketing/PR, training. Override with --naics.
const NAICS = strArg('--naics', '541511,541512,541430,541810,541820,611710')
  .split(',').map(s => s.trim()).filter(Boolean)
// Notice types: o=Solicitation, p=Pre-solicitation, r=Sources Sought,
// k=Combined Synopsis/Solicitation, g=Sources Sought (legacy). Override --ptype.
const PTYPES = strArg('--ptype', 'o,p,k,r').split(',').map(s => s.trim()).filter(Boolean)

// Relevance gate. A NAICS like 611710 (training) or 541512 (systems design) also
// catches hardware/license/medical noise (printers, manikins, atomic clocks) that
// is NOT Livingstone's service line. With --relevant, only ingest notices whose
// title matches our capability keywords. On by default; pass --all to disable.
const RELEVANT_ONLY = !argv.includes('--all')
// Stem matches (no trailing \b) so "Marketing"/"Communications"/"Advertising"
// all hit. Medical-device false positives ("retinal camera", "glucometers",
// "i-STAT") are excluded by EXCLUDE_RE below.
const RELEVANT_RE = /\b(web|website|digital|portal|drupal|wordpress|cms|ux|ui|design|content|communicat|outreach|market|brand|public affair|public relation|media|advertis|campaign|graphic|video|social media|e-?learning|courseware|curriculum|instructional|training develop|learning platform|webinar|software develop|application develop|app develop|custom (computer )?programming|systems design|user experience)/i
// Hard excludes — NAICS catches these but they're not Livingstone's service line.
const EXCLUDE_RE = /\b(camera|glucometer|i-?stat|analyzer|manikin|mannequin|printer|cadaver|retinal|reagent|cartridge|specimen|antibody|forklift|vehicle|ammunition|uniform|textile)\b/i

function isRelevant(rec) {
  if (!RELEVANT_ONLY) return true
  const hay = `${rec.title || ''} ${rec.type || ''}`
  return RELEVANT_RE.test(hay) && !EXCLUDE_RE.test(hay)
}

// Rank score: real $ first, then DC-area, then a true set-aside (winnable as a
// small business), then soonest deadline. Used only for display/ingest ordering.
function score(m) {
  const dc = /\[DC-area\]/.test(m.summary) ? 1 : 0
  const sa = m.setAside && !/no set ?aside/i.test(m.setAside) ? 1 : 0
  return m.value * 1000 + dc * 100 + sa * 10
}

const SAM_SEARCH = 'https://api.sam.gov/opportunities/v2/search'

// MM/dd/yyyy — the format the SAM API requires for postedFrom/postedTo.
function mmddyyyy(d) {
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
}

// SAM gives award/estimate value in a few shapes; pull the first usable number.
function valueOf(rec) {
  const a = rec.award
  const candidates = [a?.amount, rec.estimatedValue, rec.baseAndAllOptionsValue]
  for (const c of candidates) {
    const n = Number(String(c ?? '').replace(/[^0-9.]/g, ''))
    if (Number.isFinite(n) && n > 0) return n
  }
  return 0
}

// SAM responseDeadLine is ISO-ish; normalize to YYYY-MM-DD (the schema's shape).
function dueDateOf(rec) {
  const raw = rec.responseDeadLine || rec.responseDeadline || ''
  const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

function typeOf(rec) {
  const t = `${rec.type || ''} ${rec.baseType || ''}`.toLowerCase()
  if (/sources sought|special notice|presolicitation|pre-solicitation/.test(t)) return 'RFI'
  if (/solicitation|combined/.test(t)) return 'RFP'
  return 'unknown'
}

function mapRecord(rec) {
  const setAside = rec.typeOfSetAsideDescription || rec.typeOfSetAside || ''
  const agency = rec.fullParentPathName
    ? rec.fullParentPathName.split('.').slice(-1)[0]
    : (rec.departmentName || rec.organizationType || 'Federal agency')
  const place = rec.placeOfPerformance
  const placeStr = place
    ? [place.city?.name, place.state?.code || place.state?.name].filter(Boolean).join(', ')
    : ''
  const dcFlag = /(washington|district of columbia|\bDC\b)/i.test(placeStr) ? ' [DC-area]' : ''
  return {
    workspace: 'government',
    title: (rec.title || 'Untitled SAM.gov notice').slice(0, 300),
    solNo: rec.noticeId || rec.solicitationNumber || '',
    agency: agency.slice(0, 200),
    naics: rec.naicsCode || (rec.naicsCodes && rec.naicsCodes[0]) || '',
    vehicle: '',
    setAside: setAside.slice(0, 120),
    value: valueOf(rec),
    dueDate: dueDateOf(rec),
    stage: 'identified',
    source: 'sam.gov',
    url: rec.uiLink || (rec.noticeId ? `https://sam.gov/opp/${rec.noticeId}/view` : ''),
    oppType: typeOf(rec),
    verified: 'pending',
    summary: `${rec.type || 'Notice'} from ${agency}${placeStr ? ` — performance ${placeStr}` : ''}${dcFlag}. NAICS ${rec.naicsCode || 'n/a'}${setAside ? `, ${setAside}` : ''}. Pulled from SAM.gov; confirm scope + ceiling on the notice before responding.`,
    notes: `Auto-ingested from SAM.gov ${new Date().toISOString().slice(0, 10)}. Notice id ${rec.noticeId || 'n/a'}. Sol# ${rec.solicitationNumber || 'n/a'}.${dcFlag}`,
    extra: { samNoticeId: rec.noticeId, samType: rec.type, place: placeStr },
  }
}

// Auth: prefer CRON_SECRET bearer; else log in for a session cookie like the UI.
async function authHeaders() {
  if (CRON_SECRET) return { headers: { Authorization: `Bearer ${CRON_SECRET}` }, cookie: '' }
  if (!DASHBOARD_PASSWORD) throw new Error('No CRON_SECRET and no DASHBOARD_PASSWORD — cannot authenticate to the intake API.')
  const res = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: DASHBOARD_USER, password: DASHBOARD_PASSWORD }),
  })
  if (!res.ok) throw new Error(`Login failed: HTTP ${res.status}`)
  const cookie = res.headers.get('set-cookie')?.split(';')[0] || ''
  if (!cookie) throw new Error('Login returned no session cookie.')
  return { headers: {}, cookie }
}

async function existingSolNos(auth) {
  const res = await fetch(`${BASE_URL}/api/opportunities?workspace=government`, {
    headers: { ...auth.headers, ...(auth.cookie ? { Cookie: auth.cookie } : {}) },
  })
  if (!res.ok) return new Set()
  const rows = await res.json().catch(() => [])
  return new Set(rows.map(r => r.solNo).filter(Boolean))
}

async function postOpp(item, auth) {
  const res = await fetch(`${BASE_URL}/api/opportunities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth.headers, ...(auth.cookie ? { Cookie: auth.cookie } : {}) },
    body: JSON.stringify(item),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json
}

async function fetchPage(naics, postedFrom, postedTo, offset) {
  const params = new URLSearchParams({
    api_key: SAM_API_KEY,
    limit: '100',
    offset: String(offset),
    postedFrom,
    postedTo,
    ncode: naics,
    ptype: PTYPES.join(','),
  })
  const res = await fetch(`${SAM_SEARCH}?${params}`, { headers: { Accept: 'application/json' } })
  if (res.status === 401 || res.status === 403)
    throw new Error('SAM.gov rejected the API key (401/403). Check SAM_API_KEY in .env.local.')
  if (!res.ok) throw new Error(`SAM.gov HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

async function main() {
  if (!SAM_API_KEY) {
    console.error('SAM_API_KEY is not set. Add it to .env.local:')
    console.error('  SAM_API_KEY=your_public_key_from_sam.gov')
    console.error('Get a free key at https://sam.gov → Account Details → API Key.')
    process.exit(1)
  }
  const to = new Date()
  const from = new Date(to.getTime() - days * 86400000)
  const postedFrom = mmddyyyy(from)
  const postedTo = mmddyyyy(to)
  console.log(`SAM.gov: NAICS [${NAICS.join(', ')}], types [${PTYPES.join(',')}], posted ${postedFrom} → ${postedTo}${MIN_VALUE ? `, min $${MIN_VALUE.toLocaleString()}` : ''}${DRY ? ' (dry run)' : ''}`)

  // Gather records across NAICS codes, de-duped by notice id.
  const byId = new Map()
  for (const naics of NAICS) {
    let offset = 0, total = Infinity
    while (offset < total && offset < 1000) {
      const page = await fetchPage(naics, postedFrom, postedTo, offset)
      total = page.totalRecords ?? 0
      for (const rec of page.opportunitiesData || []) {
        if (rec.noticeId && !byId.has(rec.noticeId) && isRelevant(rec)) byId.set(rec.noticeId, rec)
      }
      offset += 100
      if (!page.opportunitiesData || page.opportunitiesData.length < 100) break
    }
    console.log(`  NAICS ${naics}: ${total} notice(s) in window`)
  }

  const mapped = [...byId.values()].map(mapRecord)
    .filter(m => m.value >= MIN_VALUE)
    .sort((a, b) => score(b) - score(a))
  console.log(`${mapped.length} notice(s) after ${RELEVANT_ONLY ? 'relevance + ' : ''}value filter.\n`)

  if (DRY) {
    for (const m of mapped) {
      console.log(`→ $${m.value.toLocaleString().padStart(12)} | due ${m.dueDate || 'n/a'} | ${m.oppType} | ${m.title.slice(0, 60)}`)
      console.log(`             ${m.agency} | ${m.setAside || 'no set-aside'} | ${m.url}`)
    }
    console.log(`\nDry run — ingested nothing.`)
    return
  }

  const auth = await authHeaders()
  const seen = await existingSolNos(auth)
  let created = 0, skipped = 0, failed = 0
  for (const m of mapped) {
    if (m.solNo && seen.has(m.solNo)) { skipped++; continue }
    try {
      await postOpp(m, auth)
      created++
      console.log(`  ✓ $${m.value.toLocaleString()} ${m.oppType}  ${m.title.slice(0, 60)}`)
    } catch (err) {
      failed++
      console.error(`  ✗ ${m.title.slice(0, 50)}: ${(err && err.message) || err}`)
    }
  }
  console.log(`\nIngested ${created} new, skipped ${skipped} existing, failed ${failed}. Done.`)
}

main().catch(e => {
  console.error(e.message || e)
  process.exit(1)
})
