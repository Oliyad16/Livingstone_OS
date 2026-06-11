import Anthropic from '@anthropic-ai/sdk'
import type { KeyDates, KeyPerson } from './intake'

// Deal-room enrichment sub-agent. Given the text of a solicitation (and/or the
// fields already known about an opportunity), it returns a structured enrichment:
// a plain-language summary, key dates, key people (with emails), and a BUDGET
// estimate. The budget is the agency's likely contract value (for bid/no-bid):
//   - basis 'disclosed'  → the dollar figure is stated in the document
//   - basis 'estimated'  → not stated; inferred from scope + term + comparable
//     gov awards, returned as a range with a one-line rationale
// The UI MUST label estimated budgets so a guess is never mistaken for a real one.

export interface BudgetEstimate {
  amount: number          // single best-point value (midpoint for estimates)
  low: number             // range low (0 if a single disclosed figure)
  high: number            // range high
  basis: 'disclosed' | 'estimated' | 'unknown'
  rationale: string       // one line: where the number came from
}

export interface Enrichment {
  summary: string
  keyDates: KeyDates
  keyPeople: KeyPerson[]
  budget: BudgetEstimate
  fit: string             // one line: how well it fits Livingstone (GEO/web/software)
}

const EMPTY: Enrichment = {
  summary: '', keyDates: {}, keyPeople: [],
  budget: { amount: 0, low: 0, high: 0, basis: 'unknown', rationale: '' },
  fit: '',
}

const SYSTEM = `You are a US government contracting analyst enriching an opportunity record for a digital agency (Livingstone Solution: GEO / generative-engine optimization, web development, custom software, growth systems). Return STRICT JSON only — no prose, no markdown fences.

From the provided solicitation text + known fields, produce:
- "summary": 2-4 plain-language sentences on what the project is and what the buyer needs. No hype.
- "keyDates": YYYY-MM-DD where present — release, industryDay, qaDue (questions deadline), proposalDue (response deadline), award. Omit keys not found.
- "keyPeople": contacts to respond to, each {name, role, email, phone}. Include EVERY named contact with an email. [] if none.
- "budget": the AGENCY'S likely contract value (what they will pay), as:
    {"amount": <number>, "low": <number>, "high": <number>, "basis": "disclosed|estimated|unknown", "rationale": "<one line>"}.
    If a dollar value/budget IS stated, basis="disclosed", amount=that figure (low/high = same or stated range), rationale cites where.
    If NOT stated, basis="estimated": infer a realistic range from the scope, contract term, and comparable US state/federal awards for this kind of work; amount = midpoint; rationale names the comparable basis (e.g. "typical mid-size gov WordPress rebuild + 1yr hosting"). Be realistic, not optimistic.
    If there is genuinely nothing to estimate from, basis="unknown", all zeros.
- "fit": one sentence on how well this fits a GEO/web-dev/software agency.

Never invent a person, email, date, or a DISCLOSED dollar figure that is not in the text. Estimated budgets are explicitly allowed and must be marked basis="estimated".

Return exactly: {"summary":"","keyDates":{},"keyPeople":[],"budget":{"amount":0,"low":0,"high":0,"basis":"unknown","rationale":""},"fit":""}`

export async function enrichFromText(text: string, context = ''): Promise<Enrichment> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return EMPTY

  try {
    const client = new Anthropic({ apiKey: key })
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1400,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: `${context ? `Known fields:\n${context}\n\n` : ''}Solicitation text:\n${text.slice(0, 24000)}`,
      }],
    })
    const raw = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text).join('').trim()
    const j = JSON.parse(stripFences(raw)) as Partial<Enrichment>
    return normalize(j)
  } catch {
    return EMPTY
  }
}

function normalize(j: Partial<Enrichment>): Enrichment {
  const b = j.budget || ({} as Partial<BudgetEstimate>)
  const basis: BudgetEstimate['basis'] =
    b.basis === 'disclosed' || b.basis === 'estimated' ? b.basis : 'unknown'
  const num = (v: unknown) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0)
  return {
    summary: typeof j.summary === 'string' ? j.summary.trim() : '',
    keyDates: cleanDates(j.keyDates || {}),
    keyPeople: Array.isArray(j.keyPeople)
      ? j.keyPeople.map(p => ({
          name: p?.name || '', role: p?.role || '', email: p?.email || '', phone: p?.phone || '',
        })).filter(p => p.name || p.email)
      : [],
    budget: {
      amount: num(b.amount), low: num(b.low), high: num(b.high),
      basis, rationale: typeof b.rationale === 'string' ? b.rationale.trim() : '',
    },
    fit: typeof j.fit === 'string' ? j.fit.trim() : '',
  }
}

function stripFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
}

function isoDate(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}
function cleanDates(d: Record<string, unknown> | KeyDates): KeyDates {
  const rec = d as Record<string, unknown>
  const out: KeyDates = {}
  for (const k of ['release', 'industryDay', 'qaDue', 'proposalDue', 'award'] as const) {
    const v = isoDate(rec[k])
    if (v) out[k] = v
  }
  return out
}
