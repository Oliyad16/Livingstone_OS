import { NextResponse } from 'next/server'
import { authUrl } from '../../../lib/linkedin'

export async function GET() {
  return NextResponse.redirect(authUrl())
}
