import { NextResponse } from 'next/server'
import { sql } from '../../../lib/db'
import { guard, coerceNums } from '../../../lib/handler'

// One opportunity (the "deal room") + its cached Drive document list, grouped by
// subfolder. Mirrors app/api/clients/[id]/route.ts — params is a Promise in
// Next 16 and must be awaited.

const SELECT = `
  SELECT id, title, sol_no AS "solNo", agency, naics, vehicle, set_aside AS "setAside",
         value, due_date::text AS "dueDate", stage, source, url, notes, extra,
         opp_type AS "oppType", verified, verify_notes AS "verifyNotes",
         source_email_id AS "sourceEmailId", intake_at AS "intakeAt",
         summary, drive_folder_id AS "driveFolderId", drive_folder_url AS "driveFolderUrl",
         created_at AS "createdAt"
  FROM opportunities
`

type Row = { value: string | number; [k: string]: unknown }

export const GET = guard(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const rows = (await sql.query(`${SELECT} WHERE id = $1`, [id])) as Row[]
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const docs = (await sql.query(
    `SELECT id, name, drive_file_id AS "driveFileId", url, mime_type AS "mimeType",
            folder, size_bytes AS "sizeBytes", modified_at AS "modifiedAt", synced_at AS "syncedAt"
     FROM opp_documents WHERE opp_id = $1 ORDER BY folder ASC, name ASC`,
    [id]
  )) as Record<string, unknown>[]

  return NextResponse.json({ ...coerceNums(rows, ['value'])[0], documents: docs })
})
