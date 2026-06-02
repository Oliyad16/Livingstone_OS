import { NextResponse } from 'next/server'
import { getAccessToken, getConnection } from '../../../lib/google'

type PropertySummary = { property: string; displayName: string }
type AccountSummary = {
  account: string
  displayName: string
  propertySummaries?: PropertySummary[]
}

export async function GET() {
  const conn = await getConnection()
  if (!conn?.refresh_token) {
    return NextResponse.json({ connected: false, properties: [] })
  }

  const token = await getAccessToken()
  const properties: { id: string; name: string; account: string }[] = []
  let pageToken: string | undefined

  do {
    const url = new URL('https://analyticsadmin.googleapis.com/v1beta/accountSummaries')
    url.searchParams.set('pageSize', '200')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `GA4 Admin API: ${text}` }, { status: res.status })
    }
    const data = (await res.json()) as { accountSummaries?: AccountSummary[]; nextPageToken?: string }

    for (const acct of data.accountSummaries || []) {
      for (const p of acct.propertySummaries || []) {
        properties.push({
          id: p.property.replace('properties/', ''),
          name: p.displayName,
          account: acct.displayName,
        })
      }
    }
    pageToken = data.nextPageToken
  } while (pageToken)

  properties.sort((a, b) => a.account.localeCompare(b.account) || a.name.localeCompare(b.name))
  return NextResponse.json({ connected: true, email: conn.email, properties })
}
