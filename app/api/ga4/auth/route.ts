import { NextResponse } from 'next/server'
import { oauthClient, GA4_SCOPES } from '../../../lib/google'

export async function GET() {
  const url = oauthClient().generateAuthUrl({
    access_type: 'offline',     // get a refresh_token
    prompt: 'consent',          // ensure refresh_token is returned
    scope: GA4_SCOPES,
  })
  return NextResponse.redirect(url)
}
