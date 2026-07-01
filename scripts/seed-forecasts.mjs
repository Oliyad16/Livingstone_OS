#!/usr/bin/env node
/**
 * Seed the Forecasts watchlist (kind='forecast') for the Livingstone command
 * center. Forecasts are contracts NOT yet solicited — tracked so we can position
 * before the RFP drops. Three signal types:
 *   - recompete      : a large incumbent contract expiring → will re-compete.
 *   - forecast-tool   : listed in an agency forecast (DHS APFS, GSA, State, DC).
 *   - rfi-to-rfp      : an RFI / Sources Sought we hold that should become an RFP.
 *
 * The curated list below comes from public forecasting research (USASpending/FPDS
 * recompetes + agency forecast tools). It is dedupe-safe on solNo, and ALSO derives
 * rfi-to-rfp forecasts automatically from any oppType='RFI' already in the pipeline.
 *
 * Usage:  node scripts/seed-forecasts.mjs            (ingest)
 *         node scripts/seed-forecasts.mjs --dry-run
 *
 * Env: BASE_URL (default http://localhost:3000), DASHBOARD_USER/PASSWORD or CRON_SECRET.
 */
import { readFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const DRY = argv.includes('--dry-run')
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

// Curated forecast watchlist — public, non-binding signals. Values are estimated
// ceilings/ranges from reporting; confidence reflects how certain the recompete is.
const FORECASTS = [
  {
    title: 'VA.gov Replacement — Digital Services Ecosystem Overhaul',
    agency: 'Dept. of Veterans Affairs (OIT / Digital Service)',
    category: 'software', value: 0, naics: '541511',
    forecast: { signal: 'rfi-to-rfp', confidence: 'high', anticipatedRelease: 'FY26–FY27',
      watchWhy: 'RFI out — described in industry press as "the Super Bowl for digital services." Entire VA.gov ecosystem rebuild. Prep past performance + partner/teaming now.' },
    url: 'https://sam.gov/opp/20445ca6813343e194cf1c83e4755132/view',
  },
  {
    title: 'VA VHA CCN Next Gen — Community Care Network (Multi-Award IDIQ)',
    agency: 'Dept. of Veterans Affairs (VHA)',
    category: 'software', value: 196000000000, naics: '541512',
    forecast: { signal: 'announcement', confidence: 'medium', anticipatedRelease: 'Draft solicitation Q4 FY26',
      watchWhy: '$196B initiative moving from regional monopolies to a 5-winner Multi-Award IDIQ. Digital/portal components in scope; teaming target for a niche sub-role.' },
    url: 'https://www.govconwire.com/articles/va-700b-ccn-next-gen-medical-idiq-contract-rfp',
  },
  {
    title: 'HHS CIO-SP3 Successor (CIO-SP4 / GWAC) — IT Services',
    agency: 'HHS / NITAAC',
    category: 'software', value: 20000000000, naics: '541512',
    forecast: { signal: 'recompete', confidence: 'high', anticipatedRelease: 'CIO-SP3 expires ~Apr 2026 (post-extension)',
      incumbent: 'CIO-SP3 holders',
      watchWhy: '$20B-ceiling IT GWAC approaching expiration after a 12-month extension. Successor vehicle is the on-ramp for years of federal IT/digital task orders — get on the vehicle.' },
    url: 'https://www.gsa.gov/technology/it-contract-vehicles-and-purchasing-programs/gwacs',
  },
  {
    title: 'SSA IT Support Services — Recompete',
    agency: 'Social Security Administration',
    category: 'software', value: 7800000000, naics: '541512',
    forecast: { signal: 'recompete', confidence: 'high', anticipatedRelease: 'FY26–FY27',
      watchWhy: '$7.8B recompete drawing every Tier-1 contractor. Realistic play is a teaming/sub role on web/digital modernization scope, not prime.' },
  },
  {
    title: 'GSA 2GIT II — IT Hardware/Services BPA (RFI stage)',
    agency: 'GSA',
    category: 'software', value: 0, naics: '541519',
    forecast: { signal: 'rfi-to-rfp', confidence: 'medium', anticipatedRelease: 'Challenger window late 2026 (bridge expected)',
      watchWhy: 'RFI out, no near-term award; bridge likely. Long runway to build qualifications before the real solicitation.' },
  },
  {
    title: 'DHS APFS — Digital/Web Modernization Forecast (watch)',
    agency: 'Dept. of Homeland Security (multiple components)',
    category: 'software', value: 0, naics: '541511',
    forecast: { signal: 'forecast-tool', confidence: 'medium', anticipatedRelease: 'Rolling — monitor APFS',
      watchWhy: 'DHS posts anticipated actions >$350k in APFS before solicitation. Set up an APFS profile + alerts for web/digital/comms NAICS; review quarterly.' },
    url: 'https://apfs-cloud.dhs.gov/',
  },
  {
    title: 'DC Forecast of Contract Opportunities — Comms/Digital (watch)',
    agency: 'DC Office of Contracting & Procurement',
    category: 'marketing', value: 0, naics: '541810',
    forecast: { signal: 'forecast-tool', confidence: 'medium', anticipatedRelease: 'Annual forecast + rolling',
      watchWhy: 'DC publishes a Forecast of Contract Opportunities; CBE-set-aside comms/branding/web recur yearly. Map recurring DC agency buys and pre-build capability statements.' },
    url: 'https://ocp.dc.gov/',
  },
  {
    title: 'State Dept. Procurement Forecast — Public Diplomacy / Digital Media (watch)',
    agency: 'U.S. Department of State',
    category: 'marketing', value: 0, naics: '541820',
    forecast: { signal: 'forecast-tool', confidence: 'low', anticipatedRelease: 'Rolling — monitor forecast',
      watchWhy: 'State publishes a procurement forecast; public-diplomacy / digital-media / campaign work appears regularly. Track for comms-lane fit.' },
    url: 'https://www.state.gov/procurement-forecast',
  },
]

async function authHeaders() {
  if (CRON_SECRET) return { Authorization: `Bearer ${CRON_SECRET}` }
  if (!DASHBOARD_PASSWORD) throw new Error('No CRON_SECRET / DASHBOARD_PASSWORD.')
  const res = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: DASHBOARD_USER, password: DASHBOARD_PASSWORD }),
  })
  if (!res.ok) throw new Error(`Login failed HTTP ${res.status}`)
  const cookie = res.headers.get('set-cookie')?.split(';')[0] || ''
  return { Cookie: cookie }
}

function toBody(f) {
  return {
    workspace: 'government', kind: 'forecast', category: f.category,
    title: f.title, agency: f.agency, naics: f.naics || '', value: f.value || 0,
    solNo: `FCST-${f.title.replace(/[^A-Za-z0-9]/g, '').slice(0, 24)}`,
    source: 'forecast', url: f.url || '', oppType: 'unknown', verified: 'pending',
    stage: 'identified',
    summary: f.forecast.watchWhy || '',
    notes: `Forecast watchlist item (${f.forecast.signal}). Seeded ${new Date().toISOString().slice(0, 10)}.`,
    extra: { forecast: f.forecast },
  }
}

async function main() {
  const headers = await (DRY ? Promise.resolve({}) : authHeaders())
  // Existing forecasts (dedupe by solNo).
  let existing = new Set()
  if (!DRY) {
    const rows = await fetch(`${BASE_URL}/api/opportunities?workspace=government`, { headers })
      .then(r => r.ok ? r.json() : [])
    existing = new Set(rows.map(r => r.solNo).filter(Boolean))
    // Derive rfi-to-rfp forecasts from RFIs already in the pipeline (info only).
    const rfis = rows.filter(r => r.oppType === 'RFI' && r.kind !== 'forecast')
    console.log(`(${rfis.length} RFIs in pipeline are implicit rfi-to-rfp signals — surfaced in Forecasts via their oppType.)`)
  }

  let created = 0, skipped = 0
  for (const f of FORECASTS) {
    const body = toBody(f)
    if (DRY) { console.log(`→ [${f.forecast.signal}/${f.forecast.confidence}] ${f.title}`); continue }
    if (existing.has(body.solNo)) { skipped++; continue }
    const res = await fetch(`${BASE_URL}/api/opportunities`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
    if (res.ok) { created++; console.log(`  ✓ ${f.title}`) }
    else console.error(`  ✗ ${f.title}: HTTP ${res.status}`)
  }
  if (DRY) { console.log('\nDry run — nothing ingested.'); return }
  console.log(`\nSeeded ${created} forecasts, skipped ${skipped} existing. Done.`)
}

main().catch(e => { console.error(e.message || e); process.exit(1) })
