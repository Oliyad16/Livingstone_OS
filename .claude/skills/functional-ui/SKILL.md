---
name: functional-ui
description: Design principles for the FUNCTIONAL UI layer of the Livingstone Command Center — the screens operators use to get work done (dashboards, tables, forms, pipelines, settings), as opposed to public marketing pages. Use when building or refining any interactive working surface in this app. Keeps the UI calm, consistent, fast, and usable instead of flashy. This is NOT a landing-page / marketing skill.
---

# Functional UI design (Livingstone Command Center)

This app is a **tool**, not a brochure. The goal is not to impress on first
glance — it's to let an operator do repeated work quickly without friction. That
demands a different discipline than marketing design: consistency, restraint,
predictability, and speed over novelty and animation.

> Use the marketing/landing-page playbook (bold art direction, scroll
> storytelling, heavy GSAP animation) ONLY if/when building a public-facing
> Livingstone site. For the command center, follow the rules below.

## Core principles

1. **Consistency beats cleverness.** The same action looks the same everywhere.
   A primary action is always a gold `Button` (default variant). A destructive
   action is always `variant="destructive"`. A status is always a colored
   badge. Operators build muscle memory — don't break it for variety.

2. **Restraint.** Calm surfaces, generous whitespace, one accent (gold) used
   sparingly for what matters (primary actions, active nav, key numbers). If
   everything is emphasized, nothing is. Avoid gradients-as-decoration,
   competing colors, and ornament that doesn't carry meaning.

3. **Speed and feedback.** Every action gives immediate feedback: hover states,
   focus rings (gold), loading skeletons, optimistic UI where safe, clear
   success/error states. Never leave the operator wondering if a click worked.

4. **Legibility first.** Inter for body, Fraunces for headings (already wired).
   Strong ink on white cards over warm paper. Don't sacrifice contrast or text
   size for aesthetics — people read this all day.

5. **Predictable interaction.** Standard patterns from shadcn (dialogs,
   dropdowns, selects, tabs) behave the way users expect. Don't reinvent a
   custom modal or a bespoke dropdown when the primitive exists.

## Component discipline

- Build with the vendored shadcn set in `app/components/ui/` (see the
  `shadcn-livingstone` skill). Reach for the primitive before hand-rolling.
- Use semantic tokens so everything stays on-brand automatically.
- Reuse the existing shell: `Sidebar`, `TopBar`, `WorkspaceContext`,
  `ChartFrame`. Don't introduce a parallel layout system.
- Forms: label every field (`Label` + `Input`), show validation inline near the
  field, disable submit while pending, confirm on success. Keep forms short;
  group related fields.

## Animation policy (deliberately minimal)

- **Micro-interactions only.** The app uses CSS transitions: `.card-hover`
  (subtle lift), button hovers, focus rings. That is the correct amount.
- **No scroll-reveal, no parallax, no entrance choreography** on functional
  pages — it slows operators down and adds nothing to a work tool.
- Motion should communicate state change (a panel opening, a row updating), not
  decorate. If an animation doesn't help the operator understand what happened,
  cut it.
- Keep transitions short (~150ms) and use transform/opacity (cheap to render),
  never animate layout-affecting properties on large lists.

## States are mandatory, not optional

Every data surface ships with all four:
- **Loading** — skeletons (`animate-pulse`), not spinners-on-blank.
- **Empty** — a helpful message + the primary action to fill it.
- **Error** — a clear, calm message (light red banner token) + a retry path.
- **Populated** — the normal case.

A page that only handles the happy path is incomplete.

## Accessibility (non-negotiable for a daily tool)

- Real semantic elements (shadcn primitives are accessible — keep their props).
- Every interactive element is keyboard reachable with a visible focus ring.
- Color is never the *only* signal — pair status color with text/icon.
- Sufficient contrast on the warm-paper theme (the tokens are tuned for this).

## How this differs from marketing UI (so you don't mix them up)

| Functional UI (this app)              | Marketing UI (a future public site)   |
|---------------------------------------|---------------------------------------|
| Consistency, muscle memory            | Distinct art direction, surprise      |
| Minimal, meaningful motion            | Scroll storytelling, GSAP             |
| Density tuned for repeated work       | Spacious, one message per viewport    |
| Calm single accent                    | Bold, expressive palette              |
| Speed + feedback                      | Emotional impact + brand              |

## Checklist before calling a functional view done

- [ ] Uses shadcn primitives + semantic tokens (no hardcoded hexes)
- [ ] Clear hierarchy (see `dashboard-arrangement` skill)
- [ ] Loading / empty / error / populated states all handled
- [ ] Primary action is obvious; destructive action is clearly marked
- [ ] Keyboard accessible, visible gold focus rings
- [ ] No gratuitous animation; transitions are subtle and purposeful
- [ ] Verified in preview (console clean + screenshot) and at mobile width
