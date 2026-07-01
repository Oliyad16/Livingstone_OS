import Anthropic from '@anthropic-ai/sdk'

// Content pillars — see docs/CONTENT-STRATEGY.md. Monday = ranking,
// Wednesday = news, Friday = education.
export type PostType = 'ranking' | 'news' | 'education'

export const POST_TYPES: { value: PostType; label: string; hint: string }[] = [
  { value: 'ranking', label: 'Industry Ranking', hint: 'Who is winning in AI search (scanner data)' },
  { value: 'news', label: 'AI News Analysis', hint: 'News → what it means for visibility' },
  { value: 'education', label: 'GEO Education', hint: 'Lesson, case study, or experiment' },
]

export function isPostType(t: unknown): t is PostType {
  return t === 'ranking' || t === 'news' || t === 'education'
}

// Voice + brand guidance. Embedded (not read from the AIS-OS repo) so the
// deployed app is self-contained. Sent as a cached system block — it's identical
// on every call, so caching cuts cost/latency after the first request.
const VOICE_SYSTEM = `You write LinkedIn posts for Oliyad Deyasa, founder of LivingStone Solution.

LivingStone Solution helps businesses with GEO (Generative Engine Optimization — getting cited by AI tools like ChatGPT, Perplexity, Gemini), plus software and growth systems. The audience is small and mid-size business owners.

VOICE RULES (follow strictly):
- Warm but professional. Teaching, not selling.
- Short paragraphs. One idea per paragraph. Often one sentence per line.
- Open with a hook that reframes how the reader thinks, not a pitch.
- Concrete and plain-spoken. No jargon dumps, no hype words ("game-changer", "revolutionary", "unlock").
- No em dashes. Use periods or commas.
- No emojis. No hashtags unless asked.
- Exactly one soft call-to-action near the end, never multiple asks.
- Sign off with two lines: "Oliyad Deyasa" then "LivingStone Solution".

STRUCTURE:
- 120 to 220 words.
- A strong one-line opening hook.
- A short body that teaches one useful idea about GEO/AI visibility.
- One memorable contrast or line the reader could repeat.
- A single soft CTA.

Return ONLY the post text. No preamble, no "Here's your post", no quotation marks around it.`

// Per-pillar structure guidance, appended to the user turn.
const TYPE_GUIDES: Record<PostType, string> = {
  ranking: `This is a Pillar 1 INDUSTRY RANKING / VISIBILITY post. Structure: which industry, what we measured, who stands out, what the visible companies have in common, what it means for everyone not named.
HARD RULE: never invent a company name, rank, or score. Only name companies if the topic text itself contains real ranking data. If it does not, write an industry visibility INSIGHT for that industry instead (what separates AI-visible companies from invisible ones) with zero named rankings.`,
  news: `This is a Pillar 2 AI NEWS ANALYSIS post. Structure: the news in one line → what it actually means → impact on business visibility → impact on GEO → one recommended action. Interpret, don't just report. Only reference developments stated in the topic text; never invent announcements, features, or statistics.`,
  education: `This is a Pillar 3 GEO EDUCATION / CASE STUDY post. Structure: one concept → a concrete example → the lesson → one actionable takeaway the reader can apply this week. If the topic includes real case-study results, use them exactly; never invent client results or numbers.`,
}

const FALLBACKS: Record<PostType, (topic: string) => string> = {
  ranking: topic =>
    `In every industry we scan, the same pattern shows up.

A handful of companies get named by AI tools over and over. Everyone else is invisible.

The visible ones are rarely the biggest. They are the ones AI systems can actually read, verify, and cite.

Topic in focus: ${topic}.

We run these visibility scans industry by industry. If you want to know where your company stands in yours, I am happy to send you a check.

Oliyad Deyasa
LivingStone Solution`,
  news: topic =>
    `Most businesses spent years getting found on Google.

Then the question changed. Customers stopped searching and started asking AI tools who to trust.

The risk is simple. When ChatGPT or Perplexity answers, your business might not be in the answer. Not because you are not good, but because the AI was never taught you exist.

That is what GEO solves. We make sure that when AI describes your industry, your name is in the sentence.

Topic in focus: ${topic}.

If you are curious whether AI mentions your business today, I am running free visibility checks this month. Happy to send you yours.

Oliyad Deyasa
LivingStone Solution`,
  education: topic =>
    `SEO taught us to rank. GEO teaches us to be cited.

Those sound similar. They are not.

Ranking means showing up in a list of links. Being cited means an AI tool names you as the answer.

AI systems cite businesses they can read clearly, verify externally, and describe confidently. Most websites fail at least one of the three.

Topic in focus: ${topic}.

If you want to see how readable your business is to AI today, ask me for a visibility check.

Oliyad Deyasa
LivingStone Solution`,
}

export async function writePost(
  topic: string,
  type: PostType = 'news',
): Promise<{ body: string; source: 'claude' | 'template' }> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { body: FALLBACKS[type](topic), source: 'template' }

  const client = new Anthropic({ apiKey: key })
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 700,
    system: [
      { type: 'text', text: VOICE_SYSTEM, cache_control: { type: 'ephemeral' } },
    ],
    messages: [
      {
        role: 'user',
        content: `Write a LinkedIn post on this topic: "${topic}". Make it specific and useful, not generic.\n\n${TYPE_GUIDES[type]}`,
      },
    ],
  })

  const body = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim()

  return { body: body || FALLBACKS[type](topic), source: 'claude' }
}

// Per-pillar topic rotations for the cron fallback and the UI chips.
export const TOPICS_BY_TYPE: Record<PostType, string[]> = {
  ranking: [
    'What the most AI-visible insurance companies have in common',
    'Why the biggest law firms are not the most cited by AI',
    'What separates AI-visible healthcare providers from invisible ones',
    'How AI tools decide which SaaS companies to recommend',
    'Why local service businesses are losing AI visibility to chains',
    'The visibility gap inside the real estate industry',
  ],
  news: [
    'If AI can\'t find you, your customers won\'t either',
    'How to tell if ChatGPT recommends your business',
    'Why "we rank on Google" is no longer enough',
    'What AI browsers mean for how customers find businesses',
    'AI search keeps changing how it cites sources. Here is what stays constant',
  ],
  education: [
    'GEO vs SEO: what actually changed',
    'The 3 things that make AI cite a business',
    'What a free AI visibility check actually reveals',
    'How AI citations work, explained simply',
    'Entity optimization: teaching AI who you are',
    'Authority signals: why AI trusts some businesses more',
  ],
}

export const TOPIC_SUGGESTIONS = [
  ...TOPICS_BY_TYPE.news.slice(0, 2),
  ...TOPICS_BY_TYPE.ranking.slice(0, 2),
  ...TOPICS_BY_TYPE.education.slice(0, 2),
]
