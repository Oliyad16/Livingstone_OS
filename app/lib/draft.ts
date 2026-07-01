// Deterministic follow-up draft generator.
// Mirrors Oliyad's voice (references/voice.md): warm, opens with personal
// reference, short one-idea paragraphs, single soft CTA, signs off full name +
// company, no em dashes, no filler.

const CALENDAR_LINK = process.env.CALENDAR_LINK || 'https://calendar.app.google/mQwXjZ9K2znRbmTy5'
const SIGNATURE = 'Best,\nOliyad Deyasa\nLivingStone Solution'

type Touchpoint = { type: string; notes: string; date: string }

export interface DraftLead {
  name: string
  company?: string
  service?: string
  source?: string
  status?: string
  touchpoints?: Touchpoint[]
}

// One-line description of what the service does, in the voice's register.
const SERVICE_LINE: Record<string, string> = {
  GEO: 'helping your business show up as the answer AI tools recommend',
  SEO: 'improving how easily customers find you in search',
  website: 'the website work we talked through',
  software: 'the software build we discussed',
  other: 'the work we talked about',
}

function firstName(full: string): string {
  return (full || '').trim().split(/\s+/)[0] || 'there'
}

export function buildDraft(lead: DraftLead): { subject: string; body: string } {
  const name = firstName(lead.name)
  const company = (lead.company || '').trim()
  const serviceKey = SERVICE_LINE[lead.service || ''] ? (lead.service as string) : 'other'
  const serviceLine = SERVICE_LINE[serviceKey]
  const hasHistory = (lead.touchpoints || []).length > 0

  // Opening line: reference prior contact if there's history, else the source.
  let opener: string
  if (hasHistory) {
    opener = `I wanted to circle back on our last conversation.`
  } else if (lead.source === 'expo') {
    opener = `I enjoyed meeting you at the expo and wanted to follow up.`
  } else if (lead.source === 'referral') {
    opener = `I was glad to be connected and wanted to reach out.`
  } else {
    opener = `I wanted to follow up on our earlier conversation.`
  }

  const middle = company
    ? `I've been thinking about ${serviceLine}, and where it could fit for ${company}.`
    : `I've been thinking about ${serviceLine}, and where it could fit for you.`

  const context =
    `For context, I'm with LivingStone Solution. We help organizations use AI, software, and growth systems to improve visibility, streamline operations, and create practical business leverage.`

  const cta =
    `If you're open, I'd be glad to continue the conversation. You can use my link here to book a time that works for you:\n${CALENDAR_LINK}`

  const body = [`Hi ${name},`, opener, middle, context, cta, SIGNATURE].join('\n\n')

  const subject = company
    ? `Following up — LivingStone Solution & ${company}`
    : `Following up — LivingStone Solution`

  return { subject, body }
}
