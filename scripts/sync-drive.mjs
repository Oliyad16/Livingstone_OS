#!/usr/bin/env node
/**
 * Local Drive deal-room sync for the Livingstone command center.
 *
 * For each government opportunity, ensures a Google Drive folder tree exists:
 *   Government Contracts / <year> / <contract title>
 *     ├── Solicitation Docs
 *     ├── Our Responses
 *     └── Research & Intel
 * then lists the files in those subfolders and posts the folder id/url + cached
 * file list back to the app (/api/opportunities/<id>/documents). The deal-room
 * page reads that cache, so it renders instantly without a live Drive call.
 *
 * Runs locally (or a cron box) — NOT on Vercel, since gws is a CLI binary with
 * local OAuth credentials. Requires `gws auth login` current (with Drive scope).
 *
 * Usage:
 *   node scripts/sync-drive.mjs                 # all gov opps (create missing + refresh)
 *   node scripts/sync-drive.mjs --id 123456     # one opportunity only
 *   node scripts/sync-drive.mjs --dry-run       # show the tree it would build, write nothing
 *   node scripts/sync-drive.mjs --enrich        # also download Solicitation Docs text and
 *                                               #   POST it to /enrich (real summary/budget/dates)
 *
 * Env (shell or .env.local): BASE_URL (default http://localhost:3000),
 *   CRON_SECRET (Bearer, if set), DRIVE_ROOT_FOLDER_ID (optional: put the
 *   "Government Contracts" root under an existing folder; else created at My Drive root).
 *
 * --enrich needs text extractors on PATH: `pdftotext` (poppler) for PDFs and
 * `textutil` (macOS, built-in) for .doc/.docx. Google-native Docs export directly via gws.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const execFileP = promisify(execFile)
const argv = process.argv.slice(2)
const DRY = argv.includes('--dry-run')
const ENRICH = argv.includes('--enrich')
const onlyId = (() => { const i = argv.indexOf('--id'); return i >= 0 ? argv[i + 1] : null })()

// How much solicitation text to gather per opp before handing it to the enrich
// agent (the route itself also slices to ~24k chars, so this is a soft cap).
const MAX_DOCS_PER_OPP = 6
const MAX_TEXT_CHARS = 60000

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const SUBFOLDERS = ['Solicitation Docs', 'Our Responses', 'Research & Intel']
const CACHE_PATH = new URL('../.drive-cache.json', import.meta.url)

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
const ROOT_PARENT = fromEnv('DRIVE_ROOT_FOLDER_ID', '')

// Small on-disk cache of folder ids so we don't re-search Drive every run.
function loadCache() {
  if (existsSync(CACHE_PATH)) { try { return JSON.parse(readFileSync(CACHE_PATH, 'utf8')) } catch {} }
  return { folders: {} } // key -> id
}
function saveCache(cache) { if (!DRY) writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2)) }

async function gws(args) {
  const { stdout } = await execFileP('gws', args, { maxBuffer: 32 * 1024 * 1024 })
  return JSON.parse(stdout)
}

const esc = s => String(s).replace(/'/g, "\\'")

// Find a folder named `name` under `parentId` (or My Drive root if null).
async function findFolder(name, parentId) {
  const parentClause = parentId ? `'${esc(parentId)}' in parents` : `'root' in parents`
  const q = `name = '${esc(name)}' and mimeType = '${FOLDER_MIME}' and ${parentClause} and trashed = false`
  const res = await gws(['drive', 'files', 'list', '--params', JSON.stringify({ q, fields: 'files(id,name,webViewLink)' })])
  return (res.files || [])[0] || null
}

async function createFolder(name, parentId) {
  const body = { name, mimeType: FOLDER_MIME }
  if (parentId) body.parents = [parentId]
  const res = await gws(['drive', 'files', 'create', '--json', JSON.stringify(body), '--params', JSON.stringify({ fields: 'id,name,webViewLink' })])
  return res
}

// Get-or-create a folder, memoized by a cache key.
async function ensureFolder(cache, cacheKey, name, parentId) {
  if (cache.folders[cacheKey]) return cache.folders[cacheKey]
  let folder = await findFolder(name, parentId)
  if (!folder) {
    if (DRY) { console.log(`    [dry] would create folder "${name}"`); return { id: `dry-${cacheKey}`, webViewLink: '' } }
    folder = await createFolder(name, parentId)
    console.log(`    + created "${name}"`)
  }
  cache.folders[cacheKey] = { id: folder.id, webViewLink: folder.webViewLink || '' }
  return cache.folders[cacheKey]
}

async function listFiles(folderId) {
  if (String(folderId).startsWith('dry-')) return []
  const q = `'${esc(folderId)}' in parents and trashed = false and mimeType != '${FOLDER_MIME}'`
  const res = await gws(['drive', 'files', 'list', '--params', JSON.stringify({ q, fields: 'files(id,name,mimeType,webViewLink,size,modifiedTime)' })])
  return res.files || []
}

// ── Solicitation-doc text extraction (for --enrich) ───────────────────────────
// Google-native docs export to text/plain via gws; everything else is downloaded
// to a temp file and run through a local extractor (pdftotext / textutil). Any
// single file that fails is skipped — partial text still helps the agent.

async function exportGoogleDoc(fileId) {
  // export returns the raw text bytes on stdout (format json would wrap it).
  const { stdout } = await execFileP(
    'gws',
    ['drive', 'files', 'export', '--params', JSON.stringify({ fileId, mimeType: 'text/plain' })],
    { maxBuffer: 32 * 1024 * 1024 }
  )
  return stdout
}

async function downloadTo(fileId, outPath) {
  await execFileP(
    'gws',
    ['drive', 'files', 'download', '--params', JSON.stringify({ fileId }), '-o', outPath],
    { maxBuffer: 64 * 1024 * 1024 }
  )
}

async function extractWith(cmd, args) {
  try {
    const { stdout } = await execFileP(cmd, args, { maxBuffer: 64 * 1024 * 1024 })
    return stdout
  } catch {
    return '' // extractor missing or failed — skip this file
  }
}

// Pull readable text from one Drive file. Returns '' if we can't handle the type.
async function extractFileText(file, tmp) {
  const mime = file.mimeType || ''
  const name = (file.name || '').toLowerCase()

  if (mime === 'application/vnd.google-apps.document') {
    try { return await exportGoogleDoc(file.id) } catch { return '' }
  }
  // Skip Google-native sheets/slides/etc. and anything obviously non-text.
  if (mime.startsWith('application/vnd.google-apps.')) return ''

  const isPdf = mime === 'application/pdf' || name.endsWith('.pdf')
  const isWord = mime.includes('wordprocessingml') || mime === 'application/msword' ||
    name.endsWith('.docx') || name.endsWith('.doc')
  const isText = mime.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.rtf')
  if (!isPdf && !isWord && !isText) return ''

  const ext = isPdf ? 'pdf' : isWord ? (name.endsWith('.doc') ? 'doc' : 'docx') : 'txt'
  const out = join(tmp, `doc-${file.id}.${ext}`)
  try {
    await downloadTo(file.id, out)
  } catch {
    return ''
  }
  if (isText) { try { return readFileSync(out, 'utf8') } catch { return '' } }
  if (isPdf) return extractWith('pdftotext', ['-q', '-nopgbrk', out, '-'])
  // Word: textutil (macOS) converts to plain text on stdout.
  return extractWith('textutil', ['-convert', 'txt', '-stdout', out])
}

// Gather solicitation text for one opp from the given files (already filtered to
// the Solicitation Docs subfolder). Caps the count and total length.
async function gatherSolicitationText(files) {
  const tmp = mkdtempSync(join(tmpdir(), 'livingstone-doc-'))
  const chunks = []
  let used = 0
  try {
    for (const f of files.slice(0, MAX_DOCS_PER_OPP)) {
      if (used >= MAX_TEXT_CHARS) break
      const text = (await extractFileText(f, tmp)).trim()
      if (!text) continue
      const slice = text.slice(0, MAX_TEXT_CHARS - used)
      chunks.push(`### ${f.name}\n${slice}`)
      used += slice.length
    }
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }) } catch {}
  }
  return chunks.join('\n\n')
}

async function postEnrich(oppId, docText) {
  const res = await fetch(`${BASE_URL}/api/opportunities/${oppId}/enrich`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(CRON_SECRET ? { Authorization: `Bearer ${CRON_SECRET}` } : {}) },
    body: JSON.stringify({ docText }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
  return j
}

async function getGovOpps() {
  const res = await fetch(`${BASE_URL}/api/opportunities?workspace=government`)
  if (!res.ok) throw new Error(`Could not load opportunities: HTTP ${res.status}`)
  const all = await res.json()
  return onlyId ? all.filter(o => o.id === onlyId) : all
}

async function postDocuments(oppId, payload) {
  const res = await fetch(`${BASE_URL}/api/opportunities/${oppId}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(CRON_SECRET ? { Authorization: `Bearer ${CRON_SECRET}` } : {}) },
    body: JSON.stringify(payload),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
  return j
}

const yearOf = o => String((o.dueDate ? new Date(o.dueDate) : new Date(Number(o.id) || Date.now())).getFullYear())
const safeName = t => (t || 'Untitled Contract').replace(/[\\/:*?"<>|]/g, '-').slice(0, 120)

async function main() {
  const cache = loadCache()
  const opps = await getGovOpps()
  if (opps.length === 0) { console.log('No government opportunities to sync.'); return }
  console.log(`Syncing ${opps.length} opportunit${opps.length === 1 ? 'y' : 'ies'}${DRY ? ' (dry run)' : ''}.`)

  // Root: "Government Contracts" (optionally under DRIVE_ROOT_FOLDER_ID).
  const root = await ensureFolder(cache, `root:${ROOT_PARENT || 'mydrive'}`, 'Government Contracts', ROOT_PARENT || null)

  let synced = 0, failed = 0, enriched = 0
  for (const o of opps) {
    try {
      const year = yearOf(o)
      console.log(`\n→ ${o.title}  [${year}]`)
      const yearFolder = await ensureFolder(cache, `year:${ROOT_PARENT}:${year}`, year, root.id)
      const contractFolder = await ensureFolder(cache, `opp:${o.id}`, safeName(o.title), yearFolder.id)

      const documents = []
      let solicitationFiles = []
      for (const sub of SUBFOLDERS) {
        const subFolder = await ensureFolder(cache, `opp:${o.id}:${sub}`, sub, contractFolder.id)
        const files = await listFiles(subFolder.id)
        if (sub === 'Solicitation Docs') solicitationFiles = files
        for (const f of files) {
          documents.push({
            driveFileId: f.id, name: f.name, url: f.webViewLink || '',
            mimeType: f.mimeType || '', folder: sub,
            sizeBytes: f.size ? Number(f.size) : null,
            modifiedAt: f.modifiedTime || null,
          })
        }
      }

      if (DRY) {
        console.log(`    [dry] ${documents.length} file(s) found; folder url ${contractFolder.webViewLink || '(new)'}`)
        if (ENRICH) console.log(`    [dry] would enrich from ${solicitationFiles.length} solicitation doc(s)`)
      } else {
        await postDocuments(o.id, {
          driveFolderId: contractFolder.id,
          driveFolderUrl: contractFolder.webViewLink || '',
          documents,
        })
        console.log(`    ✓ synced ${documents.length} file(s)`)
        synced++

        // --enrich: feed the real solicitation text to the enrichment sub-agent so
        // summary / key dates / key people / budget come from the document, not the title.
        if (ENRICH) {
          try {
            const docText = await gatherSolicitationText(solicitationFiles)
            if (!docText) {
              console.log('    · enrich skipped (no extractable solicitation text)')
            } else {
              const e = await postEnrich(o.id, docText)
              const b = e.budgetBasis ? `, budget ${e.budgetBasis}` : ''
              console.log(`    ✨ enriched (${e.keyPeople?.length || 0} contact(s)${b})`)
              enriched++
            }
          } catch (err) {
            console.error(`    ✗ enrich failed: ${(err && err.message) || err}`)
          }
        }
      }
    } catch (err) {
      failed++
      console.error(`    ✗ ${(err && err.message) || err}`)
    }
  }

  saveCache(cache)
  const enrichNote = ENRICH ? `, enriched ${enriched}` : ''
  console.log(`\n${DRY ? 'Dry run complete.' : `Synced ${synced}, failed ${failed}${enrichNote}.`}`)
}

main().catch(e => {
  if (String(e).includes('invalid_grant') || String(e).includes('authError')) {
    console.error('\ngws auth has expired. Run `gws auth login` (with Drive scope) and try again.')
  }
  console.error(e.message || e)
  process.exit(1)
})
