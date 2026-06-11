import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../../../lib/db'
import { safeEqual } from '../../../../lib/auth'

// Cached Drive document list for one opportunity's deal room.
//
// POST: the local sync-drive script sends the contract's Drive folder id/url + the
// flattened file list (per subfolder). We upsert opp_documents and stamp the folder
// id/url on the opportunity. Replaces the prior cache for this opp so deletions in
// Drive disappear here too.
//
// GET: returns the cached documents (the deal-room page also gets these embedded in
// GET /api/opportunities/[id], so this is mainly for the script / debugging).
//
// Auth: CRON_SECRET bearer like the intake routes (the script has no session).
// proxy.ts exempts /api/opportunities/*/documents from the session gate.

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  return !!token && safeEqual(token, secret)
}

interface IncomingDoc {
  driveFileId: string
  name: string
  url?: string
  mimeType?: string
  folder?: string
  sizeBytes?: number | null
  modifiedAt?: string | null
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { id } = await ctx.params
    const body = await req.json()
    const docs: IncomingDoc[] = Array.isArray(body.documents) ? body.documents : []

    const exists = (await sql`SELECT id FROM opportunities WHERE id = ${id}`) as { id: string }[]
    if (exists.length === 0) return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 })

    // Stamp the folder id/url on the opportunity if the script supplied them.
    if (body.driveFolderId || body.driveFolderUrl) {
      await sql`
        UPDATE opportunities
        SET drive_folder_id  = COALESCE(${body.driveFolderId ?? null}, drive_folder_id),
            drive_folder_url = COALESCE(${body.driveFolderUrl ?? null}, drive_folder_url)
        WHERE id = ${id}
      `
    }

    // Replace the cached file list for this opp (full refresh each sync).
    await sql`DELETE FROM opp_documents WHERE opp_id = ${id}`
    for (const d of docs) {
      if (!d.driveFileId || !d.name) continue
      const docId = `${id}-${d.driveFileId}`
      await sql`
        INSERT INTO opp_documents (id, opp_id, name, drive_file_id, url, mime_type, folder, size_bytes, modified_at, synced_at)
        VALUES (${docId}, ${id}, ${d.name}, ${d.driveFileId}, ${d.url || ''}, ${d.mimeType || ''},
                ${d.folder || ''}, ${d.sizeBytes ?? null}, ${d.modifiedAt || null}, now())
        ON CONFLICT (opp_id, drive_file_id) DO UPDATE SET
          name = EXCLUDED.name, url = EXCLUDED.url, mime_type = EXCLUDED.mime_type,
          folder = EXCLUDED.folder, size_bytes = EXCLUDED.size_bytes,
          modified_at = EXCLUDED.modified_at, synced_at = now()
      `
    }
    return NextResponse.json({ ok: true, count: docs.length }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { id } = await ctx.params
    const docs = (await sql.query(
      `SELECT id, name, drive_file_id AS "driveFileId", url, mime_type AS "mimeType",
              folder, size_bytes AS "sizeBytes", modified_at AS "modifiedAt", synced_at AS "syncedAt"
       FROM opp_documents WHERE opp_id = $1 ORDER BY folder ASC, name ASC`,
      [id]
    )) as Record<string, unknown>[]
    return NextResponse.json(docs)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('DATABASE_URL is not set')) return NextResponse.json([])
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
