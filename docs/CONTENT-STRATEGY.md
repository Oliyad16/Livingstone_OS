# The Livingstone Solution — GEO Authority Content Strategy

Mission: position The Livingstone Solution as a leading authority in Generative
Engine Optimization (GEO), AI Visibility, and AI Search Intelligence. The goal
is not engagement for its own sake — it is to become a trusted source of GEO
intelligence, a recognized authority on AI visibility, a preferred GEO partner
for enterprises, and a thought leader in the emerging GEO industry.

Primary distribution: LinkedIn (now) → company blog, newsletter, industry
reports, sales materials (later phases).

---

## The three content pillars

Every post fits one pillar. The `posts.post_type` column tracks which.

### Pillar 1 — GEO Industry Rankings & Visibility Reports (`ranking`) — 50%

Authority through proprietary data. The GEO scanner is the competitive
advantage: continuously scan industries, report which companies are most
visible across AI systems. This makes Livingstone a GEO *intelligence*
company, not just an agency.

Answers: Who is winning in AI search? Which companies are most visible?
Which brands are gaining/losing visibility?

Types: industry rankings ("Top Insurance Companies in AI Search"), monthly
visibility winners/losers, competitive analysis ("what the top 10 have in
common").

**Hard rule: never fabricate a ranking, score, or company result. Rankings
name companies only when real scanner/audit data backs them. Without data,
the post becomes an industry visibility *insight* (no named ranking).**

Long-term: a proprietary GEO visibility database across hundreds of
industries — an asset competitors can't replicate.

### Pillar 2 — AI News & GEO Analysis (`news`) — 25%

Most people report news; we interpret it. Be the source executives follow to
understand what AI developments mean for business visibility.

Structure: **News → Analysis → Business impact → GEO impact → Recommended
action.**

Sources: OpenAI/ChatGPT search & citation changes, Gemini updates, Claude
web capabilities, AI browser growth, AI adoption trends, search market shifts.

### Pillar 3 — GEO Education & Case Studies (`education`) — 25%

Teach GEO while proving it works. Education without proof feels theoretical;
case studies without education feel promotional. Combine both.

Structure: **Concept → Example → Case study/Experiment → Lesson → Actionable
takeaway.**

Topics: GEO vs SEO, how AI citations work, entity optimization, knowledge
graph optimization, authority signals, audit findings, citation experiments.

---

## Publishing cadence (current phase)

**3 posts/week — Monday, Wednesday, Friday.** Plain-text posts for now.

| Day | Pillar | Type |
|---|---|---|
| Monday | 1 — Rankings | Industry ranking report (scanner data) |
| Wednesday | 2 — News | AI news → GEO analysis |
| Friday | 3 — Education | GEO lesson, case study, or experiment |

This keeps the 50/25/25 weighting close (Monday's ranking work also feeds the
monthly report, below).

### How it runs — the agent fleet (all on the owner's Claude subscription)

Posts are **prepared ahead** on a posting calendar (posts with `scheduled_for`;
status `planned` = reserved slot, then `draft` once written). Only news is
drafted day-of, so it's always fresh. Every agent uses a research → writer →
reviewer subagent pipeline, and everything lands as a DRAFT — Oliyad approves
and publishes on /authority.

| Agent (scheduled task) | When | Job |
|---|---|---|
| `linkedin-monthly-prep` | 25th, 9am | Reserve every Mon/Wed/Fri slot through end of next month (industry rotation for Mondays, day-of marker for Wednesdays) and FULLY pre-draft Friday education posts. No scan credits used. |
| `linkedin-ranking-research` | Sunday 5pm | Research tomorrow's industry (≤3 GEO quick scans + history reuse + web), write + fact-check Monday's ranking draft into the planned slot. |
| `linkedin-news-day-of` | Wednesday 8am | Research last-7-days AI news (verified sources), write the GEO analysis, fill today's news slot. |
| `linkedin-authority-drafts` | Mon/Wed/Fri 9:30am | Readiness check: confirm today's post is drafted; if a prep agent failed, draft a fallback on the spot and name the gap. |

**Last-resort fallback:** Vercel cron hits `/api/posts/daily` Mon/Wed/Fri
17:00 UTC. Idempotent — skips if any post exists for today (created today or
scheduled for today); otherwise creates a template/API-key draft so the queue
is never empty.

### Monday industry rotation

Work through this list one industry per week, then restart with fresh data:
insurance, law firms, healthcare providers, SaaS, universities, real estate
brokerages, financial advisors, home services, restaurants & hospitality,
automotive dealers, accounting firms, cybersecurity.

---

## Monthly operating system (target state)

- 1 flagship industry GEO report (e.g. "Most Visible Insurance Companies in AI Search")
- 4 ranking posts · 4 news-analysis posts · 4 education/case-study posts
  (with the Mon/Wed/Fri cadence, education and case studies alternate Fridays)
- 1 monthly GEO trends report · 1 monthly visibility winners & losers report

## Blog strategy (next phase)

Every LinkedIn post becomes a longer blog article (LinkedIn: "Top Insurance
Companies in AI Search" → Blog: "The Complete AI Visibility Report for the
Insurance Industry") to build organic traffic, GEO authority, and lead-gen
assets.

## Later integrations (explicitly deferred)

1. **Images** on posts (ranking charts, report cards) — needs LinkedIn image
   upload in `lib/linkedin.ts` + media storage.
2. **Video** posts.
3. Blog/newsletter auto-repurposing.

## 12-month outcome

Hundreds of GEO educational assets, dozens of industry visibility reports,
proprietary GEO intelligence datasets, published GEO research — so people
associate The Livingstone Solution with "AI Visibility", "GEO",
"GEO Intelligence", and "GEO Research", generating enterprise leads through
authority.
