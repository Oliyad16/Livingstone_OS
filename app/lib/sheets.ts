import { getAccessToken } from './google'

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'

// Lead fields the importer can populate.
export type LeadField = 'name' | 'company' | 'email' | 'phone' | 'source' | 'status' | 'service' | 'notes'
export type ColumnMapping = Partial<Record<LeadField, string>> // field -> sheet header

export interface MappedLead {
  name: string; company: string; email: string; phone: string
  source: string; status: string; service: string; notes: string
}

/** Read a tab as a matrix of strings. Row 0 is the header row. */
export async function readSheet(spreadsheetId: string, tab: string): Promise<string[][]> {
  const token = await getAccessToken()
  const range = encodeURIComponent(tab)
  const res = await fetch(`${SHEETS_API}/${spreadsheetId}/values/${range}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Sheets API: ${await res.text()}`)
  const data = (await res.json()) as { values?: string[][] }
  return data.values || []
}

/** List tab names so the UI can offer a picker. */
export async function listTabs(spreadsheetId: string): Promise<string[]> {
  const token = await getAccessToken()
  const res = await fetch(`${SHEETS_API}/${spreadsheetId}?fields=sheets.properties.title`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Sheets API: ${await res.text()}`)
  const data = (await res.json()) as { sheets?: { properties: { title: string } }[] }
  return (data.sheets || []).map(s => s.properties.title)
}

const VALID_STATUS = ['new', 'contacted', 'qualified', 'proposal', 'closed', 'lost']

/** Turn raw rows + a column mapping into clean lead objects. */
export function mapRows(rows: string[][], mapping: ColumnMapping): MappedLead[] {
  if (rows.length < 2) return []
  const headers = rows[0].map(h => h.trim())
  const idx = (header?: string) => (header ? headers.indexOf(header) : -1)

  const cols: Record<LeadField, number> = {
    name: idx(mapping.name), company: idx(mapping.company), email: idx(mapping.email),
    phone: idx(mapping.phone), source: idx(mapping.source), status: idx(mapping.status),
    service: idx(mapping.service), notes: idx(mapping.notes),
  }

  const get = (row: string[], c: number) => (c >= 0 && row[c] != null ? String(row[c]).trim() : '')

  return rows.slice(1)
    .map(row => {
      const status = get(row, cols.status).toLowerCase()
      return {
        name: get(row, cols.name),
        company: get(row, cols.company),
        email: get(row, cols.email),
        phone: get(row, cols.phone),
        source: get(row, cols.source) || 'sheet',
        status: VALID_STATUS.includes(status) ? status : 'new',
        service: get(row, cols.service),
        notes: get(row, cols.notes),
      }
    })
    .filter(l => l.name || l.company || l.email) // skip blank rows
}
