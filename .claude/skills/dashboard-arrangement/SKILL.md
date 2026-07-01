---
name: dashboard-arrangement
description: How to arrange information on dashboard and analytics pages in the Livingstone Command Center so they read like a real operations tool, not a wall of cards. Use BEFORE writing any new dashboard, analytics view, KPI page, pipeline board, or report — and when an existing page feels cluttered, flat, or hard to scan. Forces a layout decision (what to show, what to group, what to cut, what hierarchy) before any code is written.
---

# Dashboard information arrangement (Livingstone Command Center)

A dashboard succeeds or fails on **arrangement**, not component polish. The hard
question is never "how do I make a card?" — it's "what belongs on this screen,
in what order, grouped how, and what gets cut." Reason through that FIRST.

## The rule: decide the layout before you code

Before writing JSX for any data view, answer these in order. Write the answers
down (in your response or a comment) — don't skip to code.

1. **Who is looking and what decision are they making?**
   Each Livingstone workspace has a different operator and job:
   - **Private** (SMB · GEO · Web): "who do I follow up with, what's my MRR?"
     → lead/followup urgency, pipeline, revenue.
   - **Government** (Capture · RFPs): "what's due soon, what can I win?"
     → deadlines, set-aside eligibility, stage, value.
   - **Client** (delivery · GA4): "how are my clients' sites performing?"
     → per-client health, traffic, conversions.
   - **Media** (LinkedIn · content): "is content shipping and landing?"
     → publishing pipeline, reach, pillar mix.
   The page's #1 element should answer that operator's first question.

2. **What is the single most important number/state?** Make it the largest,
   top-left-most thing. One hero metric or one "needs attention" list — not
   five equal-weight tiles competing.

3. **Group by decision, not by data source.** Things the operator looks at
   together should sit together. Don't scatter "due dates" across three cards.

4. **What can be cut or collapsed?** If a number doesn't change a decision,
   demote it (smaller, lower) or remove it. A cluttered dashboard hides signal.

## Information hierarchy (top → bottom of every page)

1. **Page header** — title (Fraunces serif), one-line context with the key
   count inline (e.g. "Government capture pipeline · 8 total"), primary action
   button on the right. Add the `.gold-divider` accent.
2. **KPI strip** — 3–5 summary stats max, in a single row. More than 5 = you
   haven't decided what matters. Most important leftmost.
3. **Primary working surface** — the table / board / chart the operator
   actually acts on. This gets the most vertical space.
4. **Secondary / supporting** — breakdowns, trends, recent activity. Below the
   fold is fine; these inform, they don't drive the primary action.

## Density and grouping heuristics

- **One screen, one job.** If a page is doing two unrelated jobs, it's two
  pages (the workspace switcher exists for exactly this reason).
- **Scannable rows over dense grids.** A long tracked list (leads, opps, posts)
  belongs in a `Table` with clear status pills, not a grid of cards.
- **Cards are for grouped, glanceable summaries** (a KPI, a chart, a small
  related cluster) — not for list items.
- **Limit columns to what drives action.** In the opportunities table the
  operator needs: title/agency, due, value, stage, set-aside eligibility,
  source. Anything else is detail for the deal-room page, not the list.
- **Status must be instantly readable.** Use color-coded pills/badges
  (green = good/active, amber = attention, red = overdue/lost). Don't make the
  operator read text to learn urgency.
- **Empty and loading states are part of the layout**, not an afterthought.
  Every data surface needs a deliberate empty state and a skeleton.

## Charts (this project uses Recharts)

- Wrap every chart in `app/components/charts/ChartFrame.tsx` (title, subtitle,
  explainer, empty state) — never drop a bare chart onto a page.
- Use the shared palette in `app/components/charts/theme.ts` (gold/berry/green/
  amber/red), which matches the `--color-chart-1..5` bridge tokens.
- **Pick the chart for the question:** trend over time → line/area; part-to-
  whole → donut (with center total + legend); comparison across categories →
  bars. Don't use a donut for a time series.
- One chart should answer one question. A chart that needs a paragraph to
  explain it is the wrong chart or the wrong arrangement.

## Responsive

- KPI strip: collapse to 2-up then 1-up on narrow widths.
- Tables: keep the identity column + status, allow horizontal scroll for the
  rest rather than wrapping into mush.
- Verify with `preview_resize` (mobile/tablet) after building.

## Anti-patterns to reject

- A grid of 8+ equal-weight cards with no hierarchy ("card soup").
- KPI tiles that restate the same number three ways.
- Burying the time-sensitive thing (a due date, a stale lead) below the fold.
- A chart with no frame, no title, no empty state.
- Identical layout reused across workspaces when the operators' jobs differ.

## Output expectation

When asked to build a dashboard view, first emit a short **layout plan**
(hero metric, KPI strip contents, primary surface, secondary surfaces, what was
cut), then build it with shadcn components (see the `shadcn-livingstone` skill)
and ChartFrame-wrapped Recharts.
