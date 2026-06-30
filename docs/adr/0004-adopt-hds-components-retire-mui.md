# ADR 0004 — Adopt HDS as the component layer; retire MUI (incrementally)

- **Status:** Accepted (supersedes the "keep MUI" stance of ADR-0001 and the "stay on Vite,
  app-built HDS-shaped components" stance of ADR-0003 re: components)
- **Date:** 2026-06-30
- **Context owner:** Apply Board

## Context

ADR-0001 chose "HDS tokens on MUI" **because HDS wasn't consumer-ready** (types pointed at TS
source, the CSS shipped a base reset that collided with MUI, no optional peers). ADR-0003 then
kept Vite and used app-built HDS-shaped components for the same reason.

**`@hirobius/design-system@0.8.0` removed those blockers** (validated on branch
`claude/hds-adopt`, `?spike=hds`):

- Built `.d.ts` (`exports["."].types → ./dist/types/...`) — `tsc --noEmit` is clean.
- A **vars-only `variables.css`** ("no reset, no preflight, no utilities… cannot restyle host
  elements") — imports safely next to MUI; **no global reset leaks** into any emitted CSS.
- Optional peers (`react-router`, `react-hook-form`, `zod`, `@hookform/resolvers`) — a leaf
  primitive installs without the router/form stack.
- `sideEffects: ["**/*.css"]` — tree-shakeable; component styles ship and render.

So the only remaining reasons to stay on MUI are **migration cost and risk**, not capability.
We choose to retire MUI and adopt HDS as the component layer.

## Decision

**Adopt `@hirobius/design-system` as the component layer and retire MUI — via an incremental
(strangler) migration, not a big-bang.**

1. **Global wiring (once).** Import `@hirobius/design-system/tokens.css` in `main.tsx` (before
   `brand-jade.css` so the jade accent override still wins). **Use `tokens.css`, not the
   vars-only `variables.css`** — `variables.css` ships only CSS custom properties, so HDS
   components render **unstyled** (verified on a local preview); `tokens.css` carries the
   component/utility CSS. Its base reset lives in `@layer base`, and **MUI/emotion are unlayered,
   so they win over it** — the two coexist with no MUI regression (also verified visually).
   `ColorModeProvider` sets `data-theme="dark|light"` on `<html>` (HDS's dark selector) alongside
   the existing `.dark` class, so HDS dark mode tracks the app toggle.
2. **A thin wrapper at the seam.** `src/ui/Button.tsx` re-exports HDS `Button` with the app's
   conventions and a MUI→HDS prop map (`contained→primary`, `outlined→secondary`,
   `text→tertiary`; `startIcon→iconLeft`; `href`/`component={Link}`→`asChild`). Surfaces import
   from `./ui/*`, so a future component swap is one file, not a find-and-replace.
3. **Migrate surface-by-surface, deleting MUI as we go.** Order (leaf → composite):
   Button → Chip/Tag → Card → Tabs / SegmentedControl (ToggleButtonGroup) → Input/Field /
   Select → Menu → Dialog → Disclosure (Collapse) → Text/Typography → layout (Box/Stack/
   Container → Tailwind/`Grid`/`Stack`). See `docs/hds-adoption.md` for the per-component map.
4. **End state.** When the last MUI import is gone: remove `@mui/*` + `@emotion/*` + `theme.ts`,
   fold `theme.contrast.test.ts` onto the HDS tokens, and the coexistence cost (dual CSS, the
   `vendor↔hds` chunk juggling) **disappears** — one system.

## Prerequisites (infra — owner action)

`@hirobius/*` is on a **private GitHub Packages registry**. `NODE_AUTH_TOKEN` (read:packages)
must be set in **GitHub Actions** AND **Vercel** (all environments), or CI/preview/prod installs
fail at `npm ci`. `.npmrc` references it via env var (no secret committed). Until provisioned,
migration branches' CI/preview will be red **by design** — they are not mergeable until then.

## Consequences

**Positive:** one design system (HDS's real components + brand), no token-bridge/`theme.ts`,
simpler styling, and the dual-system complexity is temporary — it ends when MUI does.

**Negative / during the migration window:**
- Both libraries ship until MUI is fully removed — bundle temporarily grows (HDS ~207 kB in its
  own lazy `hds` chunk; one residual `vendor↔hds` circular-chunk **warning**, cosmetic).
- Layout is the real work: every `sx`/`Box`/`Stack` becomes Tailwind/HDS layout.
- **Visual parity (jade accent, hover/pressed states, dark mode) is verified on the Vercel
  preview**, not by the gate — `tsc`/tests can't see rendered styles. Each migrated surface is
  eyeballed on the preview before its PR merges.
- The token deploy-independence of ADR-0001 is intentionally given up (now needs the registry
  token in CI/Vercel) — that is the cost of using HDS's real components.

## Follow-ups

- Once verified, dedupe the token layer (drop generated `hds-tokens.css`; consume the package's
  `variables.css` directly) and retire `tokens:build`.
- Map hover/pressed accent vars precisely to HDS 0.8.0's button token names if states drift.

## References

- ADR-0001 (tokens-on-MUI), ADR-0003 (stay on Vite), `docs/hds-adoption.md`
- Validation: branch `claude/hds-adopt` (`?spike=hds`), `@hirobius/design-system@0.8.0`
- This increment: `src/ui/Button.tsx`, `src/main.tsx`, `src/ColorMode.tsx`, `src/TileGrid.tsx`
