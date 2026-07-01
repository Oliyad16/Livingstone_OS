import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../lib/db'
import { safe, workspaceOf, normalizeWorkspace, coerceNums } from '../../lib/handler'

const SELECT = `
  SELECT id, title, sol_no AS "solNo", agency, naics, vehicle, set_aside AS "setAside",
         value, due_date::text AS "dueDate", stage, source, url, notes, extra,
         opp_type AS "oppType", verified, verify_notes AS "verifyNotes",
         source_email_id AS "sourceEmailId", intake_at AS "intakeAt",
         summary, drive_folder_id AS "driveFolderId", drive_folder_url AS "driveFolderUrl",
         category, kind,
         created_at AS "createdAt", deleted_at AS "deletedAt"
  FROM opportunities
`

type Row = { value: string | number; [k: string]: unknown }
const coerce = (rows: Row[]) => coerceNums(rows, ['value'])

// Auto-classify an opportunity into the Software or Marketing lane from its title/
// summary/sol-no prefix, so new intake lands in the right tab without manual tagging.
// RFPMart id prefixes are the strongest signal; keyword fallback otherwise.
const MKT_RE = /\b(market|brand|communicat|public relation|public affair|advertis|media|outreach|campaign|graphic|video|content|creative|destination market|social media|press|messaging)\b/i
const SW_RE = /\b(web|website|software|application|app|digital|portal|drupal|wordpress|cms|platform|system|it services|information technology|develop|programming|integration|hosting|seo|data|\bai\b|automation|cyber|api|cloud|modernization)\b/i
function classifyCategory(b: { title?: string; summary?: string; solNo?: string; naics?: string }): 'software' | 'marketing' | 'unknown' {
  const pfx = (b.solNo || '').split('-')[0].toUpperCase()
  if (['MRB', 'SEO'].includes(pfx)) return 'marketing'
  if (['WD', 'SW', 'MOBI', 'ITES', 'DRA'].includes(pfx)) return 'software'
  if (pfx === 'AI') return 'software'
  const hay = `${b.title || ''} ${b.summary || ''}`
  const mkt = MKT_RE.test(hay), sw = SW_RE.test(hay)
  if (mkt && !sw) return 'marketing'
  if (sw && !mkt) return 'software'
  if (mkt && sw) return 'marketing' // comms/brand intent usually dominates ties
  return 'unknown'
}

export const GET = safe(async (req) => {
  const ws = workspaceOf(req)
  // ?trashed=1 returns the recycle bin (soft-deleted rows) instead of the live
  // list, so the UI can offer a Trash view + restore. Default excludes them.
  const trashed = req.nextUrl.searchParams.get('trashed') === '1'
  const rows = (await sql.query(
    `${SELECT} WHERE workspace = $1
       AND deleted_at IS ${trashed ? 'NOT NULL' : 'NULL'}
     ORDER BY ${trashed ? 'deleted_at DESC' : 'due_date ASC NULLS LAST, created_at DESC'}`,
    [ws]
  )) as Row[]
  return NextResponse.json(coerce(rows))
}, [])

export async function POST(req: NextRequest) {
  const b = await req.json()
  // Opportunities are a government-capture artifact, so they default to the
  // 'government' workspace when none is supplied (govDefault=true).
  const ws = normalizeWorkspace(b.workspace, true)
  const id = Date.now().toString()
  // Category: respect an explicit value, else auto-classify into software/marketing.
  const category = b.category || classifyCategory(b)
  // Kind: 'forecast' (anticipated, not yet solicited) or 'opportunity' (live).
  const kind = b.kind === 'forecast' ? 'forecast' : 'opportunity'
  await sql`
    INSERT INTO opportunities (id, title, sol_no, agency, naics, vehicle, set_aside, value, due_date, stage, source, url, notes, extra, workspace, opp_type, verified, source_email_id, summary, category, kind)
    VALUES (${id}, ${b.title}, ${b.solNo || ''}, ${b.agency || ''}, ${b.naics || ''}, ${b.vehicle || ''},
            ${b.setAside || ''}, ${b.value || 0}, ${b.dueDate || null}, ${b.stage || 'identified'},
            ${b.source || 'manual'}, ${b.url || ''}, ${b.notes || ''}, ${JSON.stringify(b.extra || {})}::jsonb, ${ws},
            ${b.oppType || 'unknown'}, ${b.verified || 'pending'}, ${b.sourceEmailId || null}, ${b.summary || ''}, ${category}, ${kind})
  `
  const rows = (await sql.query(`${SELECT} WHERE id = $1`, [id])) as Row[]
  return NextResponse.json(coerce(rows)[0], { status: 201 })
}

export async function PUT(req: NextRequest) {
  const b = await req.json()

  // Restore from trash: { restore: true, ids: string[] }. Clears deleted_at so
  // the rows reappear in the live list. Powers Undo + the Trash "Restore" action.
  if (b.restore && Array.isArray(b.ids) && b.ids.length > 0) {
    await sql.query(
      `UPDATE opportunities SET deleted_at = NULL WHERE id = ANY($1::text[])`,
      [b.ids]
    )
    return NextResponse.json({ ok: true, restored: b.ids.length })
  }

  // Bulk stage move: { bulk: true, ids: string[], stage }. Used by the
  // multi-select "Move to Qualified" action on the opportunities list — one
  // round-trip instead of N. Stage-only so it can't clobber other fields.
  if (b.bulk && Array.isArray(b.ids) && b.ids.length > 0 && typeof b.stage === 'string') {
    await sql.query(
      `UPDATE opportunities SET stage = $1 WHERE id = ANY($2::text[])`,
      [b.stage, b.ids]
    )
    return NextResponse.json({ ok: true, updated: b.ids.length })
  }

  const existing = (await sql.query(`${SELECT} WHERE id = $1`, [b.id])) as Row[]
  if (existing.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const cur = existing[0] as Record<string, unknown>

  await sql`
    UPDATE opportunities SET
      title     = ${b.title    ?? cur.title},
      sol_no    = ${b.solNo    ?? cur.solNo},
      agency    = ${b.agency   ?? cur.agency},
      naics     = ${b.naics    ?? cur.naics},
      vehicle   = ${b.vehicle  ?? cur.vehicle},
      set_aside = ${b.setAside ?? cur.setAside},
      value     = ${b.value    ?? cur.value},
      due_date  = ${b.dueDate  ?? cur.dueDate},
      stage     = ${b.stage    ?? cur.stage},
      source    = ${b.source   ?? cur.source},
      url       = ${b.url      ?? cur.url},
      notes     = ${b.notes    ?? cur.notes},
      opp_type  = ${b.oppType  ?? cur.oppType},
      verified  = ${b.verified ?? cur.verified},
      verify_notes = ${b.verifyNotes ?? cur.verifyNotes},
      summary   = ${b.summary  ?? cur.summary},
      drive_folder_id  = ${b.driveFolderId  ?? cur.driveFolderId},
      drive_folder_url = ${b.driveFolderUrl ?? cur.driveFolderUrl},
      category  = ${b.category ?? cur.category},
      kind      = ${b.kind     ?? cur.kind},
      extra     = ${b.extra !== undefined ? JSON.stringify(b.extra) : JSON.stringify(cur.extra ?? {})}::jsonb
    WHERE id = ${b.id}
  `
  const rows = (await sql.query(`${SELECT} WHERE id = $1`, [b.id])) as Row[]
  return NextResponse.json(coerce(rows)[0])
}

export async function DELETE(req: NextRequest) {
  const body = await req.json()

  // Deletes are SOFT by default: set deleted_at so the row drops out of the live
  // list but stays recoverable from Trash / Undo. Pass { purge: true } to hard-
  // delete permanently (only the Trash "delete forever" action does this).
  const purge = body.purge === true

  // Hard-purge dependent doc rows + the opp itself (no FK cascade). Used only
  // when permanently emptying trash — an RFP must never outlive its contract.
  async function hardDelete(ids: string[]) {
    if (ids.length === 0) return
    await sql.query(`DELETE FROM opp_documents WHERE opp_id = ANY($1::text[])`, [ids])
    await sql.query(`DELETE FROM rfp_documents WHERE opp_id = ANY($1::text[])`, [ids])
    await sql.query(`DELETE FROM opportunities WHERE id = ANY($1::text[])`, [ids])
  }

  // Bulk "delete expired": { deleteExpired: true, workspace }. Soft-deletes every
  // not-already-trashed opportunity whose deadline is past OR whose status is
  // closed/expired/archived — the same rule the list uses to grey them out.
  if (body.deleteExpired) {
    const ws = normalizeWorkspace(body.workspace, true)
    const ids = (await sql.query(
      `SELECT id FROM opportunities
        WHERE workspace = $1
          AND deleted_at IS NULL
          AND (
            (due_date IS NOT NULL AND due_date < CURRENT_DATE)
            OR lower(coalesce(extra->>'status','')) ~ 'closed|expired|archived'
          )`,
      [ws]
    )) as { id: string }[]
    const list = ids.map(r => r.id)
    if (purge) await hardDelete(list)
    else if (list.length > 0) {
      await sql.query(`UPDATE opportunities SET deleted_at = now() WHERE id = ANY($1::text[])`, [list])
    }
    // Return the ids so the client can offer a single Undo for the whole batch.
    return NextResponse.json({ ok: true, deleted: list.length, ids: list })
  }

  // Bulk by id list: { ids: string[] } — soft-delete (or purge) several at once.
  if (Array.isArray(body.ids) && body.ids.length > 0) {
    if (purge) await hardDelete(body.ids)
    else await sql.query(`UPDATE opportunities SET deleted_at = now() WHERE id = ANY($1::text[])`, [body.ids])
    return NextResponse.json({ ok: true, deleted: body.ids.length, ids: body.ids })
  }

  // Single delete: { id }.
  const { id } = body
  if (purge) await hardDelete([id])
  else await sql`UPDATE opportunities SET deleted_at = now() WHERE id = ${id}`
  return NextResponse.json({ ok: true, ids: [id] })
}
