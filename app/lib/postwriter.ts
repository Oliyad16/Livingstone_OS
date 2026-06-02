import Anthropic from '@anthropic-ai/sdk'

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

const FALLBACK = (topic: string) =>
  `Most businesses spent years getting found on Google.

Then the question changed. Customers stopped searching and started asking AI tools who to trust.

The risk is simple. When ChatGPT or Perplexity answers, your business might not be in the answer. Not because you are not good, but because the AI was never taught you exist.

That is what GEO solves. We make sure that when AI describes your industry, your name is in the sentence.

Topic in focus: ${topic}.

If you are curious whether AI mentions your business today, I am running free visibility checks this month. Happy to send you yours.

Oliyad Deyasa
LivingStone Solution`

export async function writePost(topic: string): Promise<{ body: string; source: 'claude' | 'template' }> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { body: FALLBACK(topic), source: 'template' }

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
        content: `Write a LinkedIn post on this topic: "${topic}". Make it specific and useful, not generic.`,
      },
    ],
  })

  const body = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim()

  return { body: body || FALLBACK(topic), source: 'claude' }
}

export const TOPIC_SUGGESTIONS = [
  'If AI can\'t find you, your customers won\'t either',
  'GEO vs SEO: what actually changed',
  'How to tell if ChatGPT recommends your business',
  'Why "we rank on Google" is no longer enough',
  'The 3 things that make AI cite a business',
  'What a free AI visibility check actually reveals',
]
