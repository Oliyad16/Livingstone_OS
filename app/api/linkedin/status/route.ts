import { NextResponse } from 'next/server'
import { getConnection, orgUrn } from '../../../lib/linkedin'
import { safe } from '../../../lib/handler'

export const GET = safe(async () => {
  const conn = await getConnection()
  return NextResponse.json({
    // Org mode needs no member URN (CMA-only apps don't grant openid).
    connected: !!conn?.access_token && (!!conn?.member_urn || !!orgUrn()),
    name: conn?.name || null,
    // 'company' when LINKEDIN_ORG_ID is set (posts go to the company page),
    // otherwise 'member' (posts go to the connected personal profile).
    postingAs: orgUrn() ? 'company' : 'member',
  })
}, { connected: false, name: null, postingAs: 'member' })
