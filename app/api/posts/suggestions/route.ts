import { NextResponse } from 'next/server'
import { TOPIC_SUGGESTIONS } from '../../../lib/postwriter'

export async function GET() {
  return NextResponse.json({ topics: TOPIC_SUGGESTIONS })
}
