import { NextResponse } from 'next/server'
import { getConnection } from '../../../lib/linkedin'
import { safe } from '../../../lib/handler'

export const GET = safe(async () => {
  const conn = await getConnection()
  return NextResponse.json({
    connected: !!conn?.access_token && !!conn?.member_urn,
    name: conn?.name || null,
  })
}, { connected: false, name: null })
