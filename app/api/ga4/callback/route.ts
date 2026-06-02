import { NextRequest, NextResponse } from 'next/server'
import { oauthClient, saveConnection } from '../../../lib/google'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })

  const client = oauthClient()
  const { tokens } = await client.getToken(code)

  // Pull the account email from the id_token if present.
  let email: string | null = null
  if (tokens.id_token) {
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token })
    email = ticket.getPayload()?.email ?? null
  }

  await saveConnection({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
    email,
  })

  // Back to the analytics section.
  return NextResponse.redirect(new URL('/analytics?connected=1', req.url))
}
