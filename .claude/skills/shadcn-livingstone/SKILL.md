---
name: shadcn-livingstone
description: Rules and patterns for building UI in the Livingstone Command Center with shadcn/ui components. Use whenever adding, restyling, or composing UI in this Next.js 16 + Tailwind 4 dashboard — buttons, cards, tables, dialogs, dropdowns, forms, tabs, badges, or any new component. Covers how shadcn is wired here, the semantic-token bridge, import paths, and the Next 16 / Tailwind 4 caveats that differ from upstream shadcn docs.
---

# Building UI with shadcn/ui in the Livingstone Command Center

This project uses shadcn/ui for its **functional** UI layer. shadcn gives you
professionally-built, accessible component primitives so you don't hand-roll
tables, dialogs, dropdowns, and forms. This skill is the rulebook for using it
**correctly in this specific project**.

## Golden rules

1. **Prefer a shadcn component over hand-building.** If you need a table,
   dialog, dropdown, tabs, select, popover, tooltip, form field, etc., add the
   shadcn version — don't write raw `<div>`/`<button>` markup for things that
   have a primitive.
2. **Never hardcode brand colors in components.** Use the semantic tokens
   (`bg-primary`, `text-muted-foreground`, `border-border`, `ring-ring`, …).
   They are already mapped to the Livingstone gold/paper palette. A component
   that uses semantic tokens is automatically on-brand.
3. **Match the surrounding code.** The legacy pages use the remapped Tailwind
   scale (`bg-gray-900` = white card, `bg-blue-800` = gold). New shadcn
   components use semantic tokens. Both resolve to the same colors — don't
   "fix" old pages to semantic tokens unless explicitly asked.

## How shadcn is wired in this project

- **Components live in** `app/components/ui/` (NOT the repo-root `components/`).
- **Config:** `components.json` — style `new-york`, icon library `lucide`,
  aliases point into `app/` (`@/app/components/ui`, `@/app/lib/utils`).
- **The `cn()` helper** is at `app/lib/utils.ts`. Import it as
  `import { cn } from "@/app/lib/utils";`
- **Add new components with the CLI** from `livingstone-dashboard/`:
  ```bash
  npx shadcn@latest add <component> [<component> ...]
  ```
  This resolves aliases from `components.json` and drops files into
  `app/components/ui/`. It works on this Next 16 setup — verified.
- **Import in pages** using the `@/app/...` alias, e.g.:
  ```tsx
  import { Button } from "@/app/components/ui/button";
  import { Card, CardHeader, CardTitle, CardContent } from "@/app/components/ui/card";
  ```

## The semantic-token bridge (read this before theming anything)

shadcn components are written against semantic tokens, not the Tailwind scale.
This project defines those tokens in `app/globals.css` inside the `@theme`
block (search for "shadcn/ui SEMANTIC TOKEN BRIDGE"). They map to the
Livingstone palette:

| Token utility                  | Resolves to            | Use for                          |
|--------------------------------|------------------------|----------------------------------|
| `bg-background` / `text-foreground` | warm paper / near-black ink | page surfaces, body text   |
| `bg-card` / `text-card-foreground`  | white / ink            | cards, panels                    |
| `bg-primary` / `text-primary-foreground` | gold #9a7723 / white | primary buttons, active state |
| `bg-secondary` / `text-secondary-foreground` | soft gold chip / bronze | secondary buttons, chips |
| `bg-muted` / `text-muted-foreground` | faint warm / gray ink | subtle surfaces, helper text   |
| `bg-accent` / `text-accent-foreground` | soft gold / bronze   | hover states, highlights         |
| `bg-destructive`               | red #dc2626            | delete / danger                  |
| `border-border` / `border-input` | soft warm border #e7e1d6 | borders, separators           |
| `ring-ring`                    | gold #9a7723           | focus rings                      |
| `bg-chart-1..5`                | gold/berry/green/amber/red | chart series (matches Recharts) |

**To re-theme a token globally, edit the bridge in `globals.css` — never patch
individual components.** One change re-skins everything.

## Typography

- Headings (`h1`–`h3`) automatically render in **Fraunces** (serif) via
  `globals.css`. Don't add a font class to headings.
- Body is **Inter**. Use the `.gold-divider` helper under a section title for
  the signature gold underline (44px gradient bar).

## Next 16 / Tailwind 4 caveats (differs from upstream docs)

- **No `tailwind.config.js`.** This is Tailwind 4 (CSS-first). All theme tokens
  live in `@theme` in `app/globals.css`. Upstream shadcn docs that say "edit
  tailwind.config" do not apply.
- **No `dark:` mode.** The app is light-only. shadcn components ship with
  `dark:` variants — they're harmless no-ops here; leave them, don't strip them.
- **Private route folders:** a folder prefixed with `_` (e.g. `app/_foo/`) is
  NOT routable in Next. Use a normal segment name for any page route.
- **Read `node_modules/next/dist/docs/` before using Next APIs** — per the
  project's AGENTS.md, this Next version has breaking changes vs. training data.
- The `radix-ui` unified package is used (not per-package `@radix-ui/react-*`).

## Recipe: add a new component and use it

```bash
# 1. add from registry
npx shadcn@latest add select
```
```tsx
// 2. import via the app alias and compose — tokens make it on-brand for free
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem }
  from "@/app/components/ui/select";

<Select>
  <SelectTrigger className="w-48"><SelectValue placeholder="Workspace" /></SelectTrigger>
  <SelectContent>
    <SelectItem value="private">Private</SelectItem>
    <SelectItem value="government">Government</SelectItem>
  </SelectContent>
</Select>
```

## Verify your work

A dev server runs on port 3000 (`.claude/launch.json` → `livingstone-dashboard`).
After UI changes, use the preview tools: check `preview_console_logs` for
errors, then `preview_screenshot` to confirm the gold theme rendered. There is
a throwaway smoke-test route pattern you can mirror if you need an isolated
component sandbox.

## Don't

- Don't put components in the repo-root `components/` folder.
- Don't import with bare `@/components/ui/...` — the alias is `@/app/...`.
- Don't hardcode `#9a7723` or other hexes in component files — use tokens.
- Don't add `tailwind.config.js`.
- Don't convert legacy pages to semantic tokens wholesale unless asked.
