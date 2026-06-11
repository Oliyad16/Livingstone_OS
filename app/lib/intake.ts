import Anthropic from '@anthropic-ai/sdk'

// Shared intake logic for the government-opportunity agent. Two jobs:
//   1. parseRfpmartEmail() — turn a raw RFPMart email into structured fields
//      using regex/heuristics (works with NO API key).
//   2. classifyOpportunity() — a cheap first-pass with Claude that fills gaps and
//      decides RFI vs RFP. Falls back to the regex parse if ANTHROPIC_API_KEY is
//      unset or the call fails, so intake never hard-depends on the API.
//
// The authoritative verification/research is a separate, in-session step (Claude +
// web against SAM.gov); this module is only the fast triage at ingest time.

export type OppType = 'RFI' | 'RFP' | 'unknown'

export interface RawEmail {
  sourceEmailId: string
  subject: string
  from?: string
  receivedAt?: string
  bodyText: string
  links?: string[]
}

export interface KeyDates {
  release?: string; industryDay?: string; qaDue?: string; proposalDue?: string; award?: string
}
export interface KeyPerson { name: string; role: string; email: string; phone: string }

export interface ParsedOpp {
  oppType: OppType
  title: string
  agency: string
  solNo: string
  naics: string
  dueDate: string | null // YYYY-MM-DD
  url: string
  value: number
  notes: string
  summary: string
  keyDates: KeyDates
  keyPeople: KeyPerson[]
}

// ---- Regex / heuristic parse (no API needed) ----

// RFPMart subjects look like: "RFP - <title> - <state/agency> - <ID>" or carry an
// explicit "RFI"/"RFP"/"RFQ"/"Sources Sought" marker. Classify off the strongest
// signal in subject first, then body.
export function detectType(subject: string, body: string): OppType {
  const hay = `${subject}\n${body}`.toLowerCase()
  // RFI-family signals (information gathering, not yet a bid).
  const rfiSignals = ['request for information', 'rfi', 'sources sought', 'market research', 'request for comment']
  // RFP-family signals (an actual solicitation to bid).
  const rfpSignals = ['request for proposal', 'rfp', 'request for quote', 'rfq', 'invitation to bid', 'itb', 'request for bid', 'solicitation']
  const hasRfi = rfiSignals.some(s => new RegExp(`\\b${s}\\b`).test(hay))
  const hasRfp = rfpSignals.some(s => new RegExp(`\\b${s}\\b`).test(hay))
  // If both appear, prefer the subject's leading token (RFPMart leads with it).
  if (hasRfi && hasRfp) {
    const lead = subject.trim().toLowerCase()
    if (/^\s*(rfi|sources sought)/.test(lead)) return 'RFI'
    if (/^\s*(rfp|rfq|itb|rfb)/.test(lead)) return 'RFP'
  }
  if (hasRfp) return 'RFP'
  if (hasRfi) return 'RFI'
  return 'unknown'
}

// Pull the first plausible future-ish date near a "due"/"closing"/"deadline" cue.
function extractDueDate(body: string): string | null {
  const cues = /(due|closing|deadline|response\s+date|submission|bid\s+date|expires?)[^\n]{0,40}?/i
  const dateRe = /(\d{4})-(\d{2})-(\d{2})|(\d{1,2})\/(\d{1,2})\/(\d{2,4})|([A-Z][a-z]+)\s+(\d{1,2}),?\s+(\d{4})/
  // Prefer a date that sits right after a due-cue; else first date in the body.
  const cued = body.split(/\n/).find(line => cues.test(line) && dateRe.test(line))
  const target = cued ?? body
  const m = target.match(dateRe)
  if (!m) return null
  let y: number, mo: number, d: number
  if (m[1]) { y = +m[1]; mo = +m[2]; d = +m[3] }
  else if (m[4]) { mo = +m[4]; d = +m[5]; y = +m[6] < 100 ? 2000 + +m[6] : +m[6] }
  else {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    mo = months.indexOf(m[7].slice(0, 3).toLowerCase()) + 1
    d = +m[8]; y = +m[9]
  }
  if (!mo || !d || !y) return null
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null
}

function firstUrl(email: RawEmail): string {
  if (email.links?.length) {
    // Prefer a .gov / known portal link over a tracking/unsubscribe link.
    const gov = email.links.find(u => /\.(gov|mil)\b/i.test(u))
    return gov || email.links.find(u => !/unsubscribe|mailto:/i.test(u)) || email.links[0]
  }
  const m = email.bodyText.match(/https?:\/\/[^\s)>"']+/i)
  return m ? m[0] : ''
}

export function parseRfpmartEmail(email: RawEmail): ParsedOpp {
  const subject = email.subject || ''
  const body = email.bodyText || ''
  const oppType = detectType(subject, body)

  // Title: subject with a leading "RFP -"/"RFI:" marker stripped.
  const title = subject
    .replace(/^\s*(rfp|rfi|rfq|itb|rfb|sources sought)\s*[-:|–]\s*/i, '')
    .trim() || subject.trim() || '(untitled opportunity)'

  // Agency: a "State of X" / "City of X" / "Department of X" mention, else blank.
  const agencyM = body.match(/\b(State of [A-Z][a-zA-Z ]+|City of [A-Z][a-zA-Z ]+|County of [A-Z][a-zA-Z ]+|[A-Z][a-zA-Z ]*Department[A-Za-z ]*|Department of [A-Z][a-zA-Z ]+)\b/)
  const agency = agencyM ? agencyM[1].trim() : ''

  // Solicitation number: common "Bid/RFP/Solicitation #: ABC-123" shapes.
  const solM = body.match(/\b(?:solicitation|bid|rfp|rfi|reference|project)\s*(?:no\.?|number|#|id)?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-_/]{3,})/i)
  const solNo = solM ? solM[1].trim() : ''

  // NAICS: 6-digit code, optionally labelled.
  const naicsM = body.match(/\bNAICS\b[^0-9]{0,12}(\d{6})/i) || body.match(/\b(\d{6})\b(?=[^\d])/)
  const naics = naicsM ? naicsM[1] : ''

  const dueDate = extractDueDate(body)
  return {
    oppType,
    title,
    agency,
    solNo,
    naics,
    dueDate,
    url: firstUrl(email),
    value: 0,
    notes: '',
    summary: '',
    // Regex pass can only place the parsed due date as the proposal deadline.
    keyDates: dueDate ? { proposalDue: dueDate } : {},
    keyPeople: [],
  }
}

// ---- Claude first-pass (optional enrichment over the regex parse) ----

const SYSTEM = `You triage US government contracting emails (from aggregators like RFPMart). For one email, return STRICT JSON only — no prose, no markdown fences.

Classify oppType:
- "RFI" for Request for Information, Sources Sought, market research, requests for comment (information-gathering, pre-solicitation).
- "RFP" for Request for Proposal, RFQ, Invitation to Bid, or any active solicitation to submit a bid/quote.
- "unknown" only if genuinely unclear.

Extract what is present; use "", null, or [] when absent. Never invent a solicitation number, NAICS, agency, date, dollar value, or person that is not in the text.

Also write:
- "summary": 1-3 plain-language sentences on what the project is and what the buyer needs. No hype.
- "keyDates": any dates you can find, as YYYY-MM-DD — release (when posted), industryDay, qaDue (questions deadline), proposalDue (response deadline), award. Omit keys you can't find.
- "keyPeople": contacts to respond to, each {name, role, email, phone}. Empty array if none.
- "value": estimated dollar value as a number if stated, else 0.

Return exactly: {"oppType":"RFI|RFP|unknown","title":"","agency":"","solNo":"","naics":"","dueDate":"YYYY-MM-DD or null","value":0,"notes":"one-line gist","summary":"","keyDates":{},"keyPeople":[]}`

export async function classifyOpportunity(email: RawEmail): Promise<ParsedOpp> {
  const base = parseRfpmartEmail(email)
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return base

  try {
    const client = new Anthropic({ apiKey: key })
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 900,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: `Subject: ${email.subject}\nFrom: ${email.from || ''}\n\n${email.bodyText.slice(0, 6000)}`,
      }],
    })
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text).join('').trim()
    const parsed = JSON.parse(stripFences(text)) as Partial<ParsedOpp>

    // Merge: trust Claude's classification + fields, but keep regex values where
    // Claude left a blank (defense against an over-eager empty response).
    const oppType: OppType = parsed.oppType === 'RFI' || parsed.oppType === 'RFP' ? parsed.oppType : base.oppType
    return {
      oppType,
      title: parsed.title?.trim() || base.title,
      agency: parsed.agency?.trim() || base.agency,
      solNo: parsed.solNo?.trim() || base.solNo,
      naics: parsed.naics?.trim() || base.naics,
      dueDate: normalizeDate(parsed.dueDate) ?? base.dueDate,
      url: base.url,
      value: typeof parsed.value === 'number' && parsed.value > 0 ? parsed.value : base.value,
      notes: parsed.notes?.trim() || base.notes,
      summary: parsed.summary?.trim() || base.summary,
      // Merge Claude's dates over the regex-derived proposalDue; keep only valid ISO dates.
      keyDates: cleanDates({ ...base.keyDates, ...(parsed.keyDates || {}) }),
      keyPeople: Array.isArray(parsed.keyPeople) && parsed.keyPeople.length
        ? parsed.keyPeople.map(p => ({ name: p?.name || '', role: p?.role || '', email: p?.email || '', phone: p?.phone || '' }))
        : base.keyPeople,
    }
  } catch {
    // Any API/parse failure → fall back to the regex parse. Intake must not break.
    return base
  }
}

function stripFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
}

function normalizeDate(v: unknown): string | null {
  if (typeof v !== 'string') return null
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

// Keep only valid YYYY-MM-DD date fields, dropping blanks/garbage.
function cleanDates(d: Record<string, unknown>): KeyDates {
  const out: KeyDates = {}
  for (const k of ['release', 'industryDay', 'qaDue', 'proposalDue', 'award'] as const) {
    const v = normalizeDate(d[k])
    if (v) out[k] = v
  }
  return out
}
