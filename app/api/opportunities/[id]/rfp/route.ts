import { NextRequest, NextResponse } from 'next/server'
import { sql } from '../../../../lib/db'

// Stored RFP / solicitation files for a deal room. These are the actual documents
// we dissect when prepping a bid (uploaded by the user, or downloaded by an agent).
// Bytes are kept in the rfp_documents table (base64) so the deal room serves them
// directly with no Drive/filesystem dependency. Deleting the opportunity deletes
// these too (DELETE /api/opportunities cascades).
//
// Session-gated by proxy.ts like the rest of /api/opportunities/* (browser-only).
//
//   GET    ?               → list file metadata (no bytes)
//   GET    ?download=<id>  → stream one file's bytes
//   POST   {filename, mimeType, contentB64}  → store a file
//   DELETE {fileId}        → remove one file

const MAX_BYTES = 25 * 1024 * 1024 // 25 MB per file — RFP packages are well under this

interface RfpRow {
  id: string; filename: string; mime_type: string; size_bytes: number | null
  uploaded_at: string; content_b64?: string
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const downloadId = req.nextUrl.searchParams.get('download')

    if (downloadId) {
      const rows = (await sql`
        SELECT filename, mime_type, content_b64 FROM rfp_documents
        WHERE id = ${downloadId} AND opp_id = ${id}
      `) as RfpRow[]
      if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const f = rows[0]
      const buf = Buffer.from(f.content_b64 || '', 'base64')
      return new NextResponse(buf, {
        headers: {
          'Content-Type': f.mime_type || 'application/octet-stream',
          'Content-Disposition': `inline; filename="${f.filename.replace(/"/g, '')}"`,
          'Content-Length': String(buf.length),
        },
      })
    }

    const rows = (await sql`
      SELECT id, filename, mime_type AS "mimeType", size_bytes AS "sizeBytes", uploaded_at AS "uploadedAt"
      FROM rfp_documents WHERE opp_id = ${id} ORDER BY uploaded_at DESC
    `) as Record<string, unknown>[]
    return NextResponse.json(rows)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('DATABASE_URL is not set')) return NextResponse.json([])
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = await req.json()
    const filename: string = (body.filename || '').trim()
    const mimeType: string = body.mimeType || 'application/octet-stream'
    const contentB64: string = body.contentB64 || ''
    if (!filename || !contentB64) {
      return NextResponse.json({ error: 'filename and contentB64 are required' }, { status: 400 })
    }
    const sizeBytes = Buffer.byteLength(contentB64, 'base64')
    if (sizeBytes > MAX_BYTES) {
      return NextResponse.json({ error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB)` }, { status: 413 })
    }

    const exists = (await sql`SELECT id FROM opportunities WHERE id = ${id}`) as { id: string }[]
    if (exists.length === 0) return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 })

    const fileId = `${id}-${Date.now()}`
    await sql`
      INSERT INTO rfp_documents (id, opp_id, filename, mime_type, size_bytes, content_b64, uploaded_at)
      VALUES (${fileId}, ${id}, ${filename}, ${mimeType}, ${sizeBytes}, ${contentB64}, now())
    `
    return NextResponse.json({ ok: true, id: fileId, filename, sizeBytes }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const { fileId } = await req.json()
    if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 })
    await sql`DELETE FROM rfp_documents WHERE id = ${fileId} AND opp_id = ${id}`
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
