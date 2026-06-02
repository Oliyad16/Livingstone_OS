import { NextRequest, NextResponse } from 'next/server'
import { exchangeCode } from '../../../lib/linkedin'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')
  if (error) return NextResponse.redirect(new URL(`/authority?linkedin_error=${error}`, req.url))
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })

  await exchangeCode(code)
  return NextResponse.redirect(new URL('/authority?linkedin=connected', req.url))
}
