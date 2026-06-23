# ADR 0001 — Adopt the Hirobius Design System via its token layer (on MUI)

- **Status:** Accepted
- **Date:** 2026-06-23
- **Context owner:** Apply Board (consumer of `@hirobius/design-system`)

## Context

Apply Board is built on **MUI v6 + Emotion**. We want it to adopt the **Hirobius
Design System (HDS)** so the two share one design language and the app doubles as a
portfolio piece. HDS, however, is a **different stack**: Tailwind v4 + Radix + CVA
React components, a DTCG token source (`hirobius.tokens.json`), and an "Editorial
Enterprise" identity (electric-blue accent). So "adopt HDS" is not a drop-in — it's
either a re-platform or a token-level integration. Apply Board's brand is **jade**, not
HDS's blue.

Constraints: the live app must stay shippable after every step; the production build and
Vercel deploy must **not** depend on the private GitHub Packages registry or a token; keep
dependencies lean.

## Decision

**Adopt HDS at the token layer and keep MUI as the component layer (Path B).**

1. **Generate the token layer from HDS's DTCG source.** `scripts/build-hds-tokens.mjs`
   (a) uses **Style Dictionary** to emit `src/tokens/hds-tokens.css` — framework-neutral
   CSS variables, light + dark, alias chains preserved, no Tailwind/preflight; and
   (b) resolves the **dark** palette to gamut-safe **hex** in `src/theme/hds-dark-palette.generated.ts`.
2. **Theme MUI from the generated palette** (`src/theme.ts`). MUI's `alpha()`/hover math
   can't operate on `var()`, so the palette uses resolved hex; the CSS-var layer remains
   available for raw CSS and future non-MUI use.
3. **Brand via a single seed, no inversion.** `src/theme/brand-jade.css` supplies one seed
   (jade hue `165.2` + chroma `0.14`); the **lightness comes from the system's contrast
   contract** (accent resolves to `oklch(0.548…)` ≈ `#048560`, dark by design) so
   on-accent text stays HDS's default **white** — we do **not** invert foreground tokens.
   The override is surgical: only the accent remaps to jade; HDS info/feedback stays blue.
4. **Deploy-safe by committing generated artifacts.** HDS + the token JSON are needed only
   to *regenerate* (`npm run tokens:build`, requires `NODE_AUTH_TOKEN`). The deployed app
   imports the committed output, so Vercel needs no private-registry access and no secret.

## Alternatives considered

| Option | What | Why not (now) |
|---|---|---|
| **A — Full re-platform** | Replace MUI with HDS's real React components (Tailwind/Radix), remove MUI | Largest, riskiest change; HDS's CSS ships a Tailwind **preflight/reset** that collides with MUI mid-migration; `react-router` is a hard peer dep; `types` point at source; and it forces `NODE_AUTH_TOKEN` into Vercel/CI. Deferred, **not rejected**. |
| **B — Tokens on MUI** *(chosen)* | Generate HDS tokens; theme MUI from them; jade brand | Ships now, low risk, no component rewrite, no deploy secret. Trade: we get HDS's *language*, not its *components*. |
| **C — Hybrid (end-state)** | B now; adopt select real HDS components later (e.g. Dialog) where they earn it | The likely destination once HDS ships the consumer fixes (see RFC feedback). |

## Consequences

**Positive**
- Live app adopts HDS's design language **today**, fully token-driven (no hardcoded brand hex).
- One source of truth: re-run `tokens:build` when HDS updates; the brand is one seed.
- Production build is decoupled from the private package; deploys stay green without secrets.
- The framework-neutral `hds-tokens.css` is reusable for any future non-MUI surface.

**Negative / tradeoffs foregone**
- **Components aren't HDS's.** We re-skin MUI to HDS tokens, so component visuals can drift
  from HDS; we still own MUI's component styling. (Mitigated later by Path C.)
- **No live `var()` theming inside MUI.** We resolve to hex at build time for MUI
  compatibility; the elegant runtime-variable theming is kept only for the raw-CSS layer.
- **Light theme deferred.** Dark-only for now to preserve the current look; the generated
  vars already carry light, so a toggle is a small follow-up.
- **Surfaces shifted** from the old jade-tinted near-black (`#0a1413`) to HDS's dark
  neutrals (`#000`/`#0a0a0a`) — a deliberate adoption of HDS surfaces.
- **Style Dictionary footprint kept minimal.** We used SD to validate and generate, but
  shipped a lean generator (one devDep, two outputs) rather than HDS's full multi-platform
  pipeline. For multi-product scale, that pipeline belongs in HDS (see the multi-stack RFC).

## Follow-ups
- Light/dark toggle (vars already exist).
- When HDS ships the consumer fixes (vars-only CSS, `.d.ts`, router subpath, `/mui` preset),
  reassess Path C — adopt real HDS components where they add the most value.
- Map HDS feedback hues to MUI `success`/`info`/`warning` (currently app-defined).

## References
- `scripts/build-hds-tokens.mjs`, `src/theme/brand-jade.css`, `src/theme.ts`
- HDS feedback docs: brand-theming, "don't invert foreground", multi-stack RFC.
