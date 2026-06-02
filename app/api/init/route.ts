import { NextResponse } from 'next/server'
import { initSchema } from '../../lib/schema'

export async function POST() {
  await initSchema()
  return NextResponse.json({ ok: true, message: 'Schema initialized.' })
}
