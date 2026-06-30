# ADR 0003 — Stay on Vite; adopt HDS incrementally; Astro only for static content

- **Status:** Accepted
- **Date:** 2026-06-30
- **Context owner:** Apply Board

## Context

Two questions were raised: (1) move the app to **Astro**, and (2) adopt the **Hirobius Design
System (HDS)** components (not just its tokens). Both are framework-level, hard-to-reverse changes
on a **live production site**, so we assessed fit and ran a small spike before committing.

What Apply Board actually is: a **stateful single-page app**, not a content site. Everything is
interconnected client state — shared `useSyncExternalStore` stores (jobs, pillars, copydeck,
triage, userTiles), `CloudSync` mounted once app-wide (Supabase auth + the sync blob), hash
routing + the pillar↔URL bridge, and lazy AI dialogs.

ADR-0001 already chose "HDS via the token layer on MUI (Path B)," deferring (not rejecting) real
HDS components (Path C) and a full re-platform (Path A). This ADR adds the **Vite-vs-Astro** axis
and records how/whether to pursue Path C.

## Decision

1. **Keep Vite for the app.** Astro's value is content/MPA + isolated islands; islands do **not**
   share the app-wide React state this app is built on. Putting the SPA on Astro means either one
   giant client island (Astro's pipeline, none of its benefits, extra complexity) or decomposing
   the shared store across islands (a large rework that fights the architecture). Low ROI, real
   risk.
2. **Adopt HDS incrementally on Vite (ADR-0001 Path C), component-by-component, behind the
   committed token layer.** Tailwind v4 is imported **without preflight** (theme + utilities
   layers only) so its base reset can't collide with MUI/emotion. App-built components use HDS's
   actual public stack — **Tailwind + Radix + CVA** — driven by the same committed
   `--component-button-*` / `--semantic-*` tokens that feed the MUI theme.
3. **Astro only for static content** (the `?case=` portfolio/case-study surface) if/when that
   content grows — as a separate static build, never the app.

### The registry constraint (decides what "adopt HDS" can mean)

The real `@hirobius/design-system` package is on a **private GitHub Packages registry** requiring
`NODE_AUTH_TOKEN`. ADR-0001 requires the Vercel build to **not** depend on that registry/token.
Therefore:

- **(a) Default — token layer + app-built HDS-shaped components** (Tailwind+Radix+CVA on the
  committed tokens). Deploy-safe, no private dep. This is what the spike does.
- **(b) Real HDS package** — would force `NODE_AUTH_TOKEN` into Vercel (revisiting ADR-0001's
  deploy constraint) or vendoring HDS source. Only pursue (b) with a concrete reason.

We choose **(a)** until there's a reason for (b).

## Spike (branch `claude/hds-spike`, PR #5 — draft, not merged)

A reachable, deploy-safe spike (`src/hds-spike/`, `?spike=hds`) wired Tailwind v4 + Radix Slot +
CVA into the app and built an HDS-style `Button` from the committed tokens. Findings:

- **No MUI collision.** Preflight excluded → MUI renders unchanged; 133 tests pass, axe clean,
  and the MUI `Button` is unaffected next to the HDS one.
- **Isolated CSS.** Tailwind output **code-splits into the spike chunk** (`HdsSpike-*.css` ~10 kB
  gzip 2.5 kB); the main `index` CSS is unchanged — no main-bundle bloat.
- **One token source, two systems.** The HDS-style button is driven by the same
  `--component-button-*` / `--semantic-color-surface-accent` (jade) tokens as the MUI theme,
  confirming Path C's premise.
- **Registry confirmed blocking for the real package.** `@hirobius/design-system` 404s without an
  `.npmrc` scope + token; wiring it would break Vercel per ADR-0001.

## Alternatives considered

| Option | Why not (now) |
| --- | --- |
| **Astro re-platform of the app** | Islands don't share the app-wide store; forces one big island (no benefit) or a large state rework. Low ROI on a logged-in SPA. |
| **Full HDS-component re-platform now** | Largest/riskiest (Path A); registry/deploy constraint + Tailwind/MUI coexistence cost. Do it incrementally instead. |
| **Astro + HDS together** | The biggest hard-to-reverse change on record (Path A + framework swap). Rejected as one leap. |
| **Do nothing (tokens-on-MUI only)** | Fine and shipping, but gives HDS's *language* not its *components*; incremental Path C raises fidelity without a big bang. |

## Consequences

**Positive:** clear, low-risk, deploy-safe path; no big-bang; the spike proves the mechanics
(preflight-off coexistence, code-split CSS, shared tokens). **Negative / watch:** two styling
systems coexist during migration — preflight must stay off and CSS specificity watched; app-built
HDS-shaped components are not the canonical HDS package unless we later choose (b).

## Follow-ups

- Migrate **leaf components first** (Button → Card → Tag/Chip) using the spike's pattern; retire
  the MUI equivalents per surface.
- Decide **(a) vs (b)** for the real HDS package if pixel-parity with HDS becomes a requirement.
- Revisit **Astro for the portfolio/case-study** content only, as a separate static surface.

## References

- `src/hds-spike/` (HdsButton, HdsSpike, tailwind.css — no preflight), `vite.config.ts`
- `docs/adr/0001-consume-hds-via-tokens-on-mui.md`, `docs/hds-adoption.md`
- `src/tokens/hds-tokens.css`, `src/theme/brand-jade.css`
