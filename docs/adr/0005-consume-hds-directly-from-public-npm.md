# ADR 0005 — Consume HDS directly from public npm (retire the token-copy layer)

- **Status:** Accepted
- **Date:** 2026-07-02
- **Context owner:** Apply Board (consumer of `@hirobius/design-system`)
- **Supersedes:** the _mechanism_ of ADR-0001 (its principles — one jade seed, no
  foreground inversion, AA enforced by test — all carry forward). Advances ADR-0003/0004's
  incremental adoption with a real consumption path.

## Context

ADR-0001 consumed HDS as **committed generated artifacts** (a Style-Dictionary script
turned HDS's DTCG source into `hds-tokens.css` + a resolved hex palette) for one reason:
the package lived on a **private registry**, and deploys must not depend on
`NODE_AUTH_TOKEN`. Two things changed in `0.9.0`:

1. **HDS publishes to public npm** — the registry constraint is gone.
2. The upstream consumption gaps we filed are fixed: **`styles.css`** (tokens + component
   styles + utilities, **no global reset** — scoped to `[data-hds]`, cannot restyle host
   elements), a **`/mui` preset** (`hdsMuiThemeOptions()` → palette of HDS token CSS
   variables for MUI v6 `cssVariables` mode), **semantic feedback tokens**
   (`--semantic-color-feedback-{success|warning|info|error|inProgress}` + `bg-` pairs,
   AA-verified light+dark), and **`Button tone` / `Badge tone`** semantic variants.

## Decision

1. **Install `@hirobius/design-system@^0.9.0` from public npm.** Delete the generator
   (`scripts/build-hds-tokens.mjs`), the committed artifacts (`src/tokens/hds-tokens.css`,
   `src/theme/hds-palette.generated.ts`), the `tokens:build` script, and the
   `style-dictionary` devDep.
2. **Import `@hirobius/design-system/styles.css`** at the app root; `<body data-hds>`
   (body, not `#root`, so MUI dialogs/portals stay inside the HDS scope).
   `brand-jade.css` still loads after it and remaps only the accent to jade.
3. **Theme MUI from the `/mui` preset.** Palette values are `var(--semantic-…)` token
   references that flip light/dark via `[data-theme]` on `<html>` (ColorMode sets it;
   the `.dark` class is retired). Every palette color spells out
   `light`/`dark`/`contrastText` because MUI's `augmentColor` throws running color math
   on `var()` strings.
4. **Local status hexes are deleted** — `success`/`warning`/`info` and the Interviewing
   `secondary` now come from HDS feedback tokens, so MUI-themed color and HDS `tone`
   color are identical by construction.
5. **Status/destructive actions render as HDS components**: status + follow-up chips →
   `Badge tone`, Mark-applied / Log-follow-up / Copy / Delete → `Button tone`. The rest
   of MUI migrates surface-by-surface (ADR-0004's strangler) now that there is no
   packaging obstacle.

## Consequences

**Positive:** no more regen step or committed artifacts; upstream token changes arrive
with `npm update`; one source of truth for status colors across both component systems;
the AA contrast test now audits the **shipped** `variables.css` + `brand-jade.css`
(alias chains resolved, oklch gamut-mapped the way browsers do), so an upstream
regression fails our CI before it ships.

**Negative / watchpoints:**

- Importing any HDS component pulls the whole `hirobius-ui.js` (~308 kB: motion, lucide,
  radix) into the vendor chunk — per-component subpath exports remain the one open
  upstream ask (Gap 2 of the consumption brief).
- `vite.config.ts` manualChunks must match react **exactly**
  (`/node_modules\/(react|react-dom|scheduler)\//`) — a loose `includes('react')` also
  catches `@radix-ui/react-*`/`lucide-react` and splits HDS across chunks, which crashes
  at init (hit twice now; there's a comment at the site).
- Mixed-system seams during the strangler: HDS buttons are sentence-case vs MUI's
  uppercase; acceptable while surfaces migrate.

## Addendum — pinned to HDS 0.13.0, the final release (2026-07-14)

Two things changed since this ADR was accepted, both reinforcing the decision:

1. **MUI is fully removed (#11).** The `/mui` preset path (decision points 3–4 above) is
   moot — theming is now pure HDS token CSS vars flipped by `data-theme` on `<html>`, with
   `brand-jade.css` remapping the accent. Points 1–2 and 5 still hold.
2. **HDS is now frozen at `0.13.0` (its final release, published 2026-07-09).** We bumped
   `^0.11.0 → ^0.13.0`; the change is additive (new `./brand`, `./scroll`, `./static.css`
   exports + an _optional_ `lenis` peer we don't use, plus an icon fix and a static-primitive
   CSS layer). No token renames or component-shape changes broke us — the contrast test +
   `tsc` stayed green, so the upgrade touched only `package.json` / `package-lock.json`.

**Decision — do not adopt `HdsThemeProvider`** (new in 0.13's docs). Our theming is a pure
token-CSS-var cascade (`brand-jade.css` override + `ColorMode` flipping `data-theme`,
`data-hds` on `<body>`), which is deliberate and works with zero JS. Adopting the provider
would be a re-architecture with no functional gain and real risk to the `[data-hds]`-on-body
scoping. Since HDS is frozen, `0.13.0` is the durable pin — no further upstream token/shape
drift is expected. Keep the exact-match `manualChunks` react regex regardless.

## Addendum — HDS unfroze; upgrades go through its CLI (2026-10-12)

The 2026-07-14 addendum above is **wrong on one point: 0.13.0 was not HDS's final release.**
HDS resumed publishing, and npm `latest` is `0.24.1` as of this date. This app is still pinned
to `^0.13.0`, which can never resolve to a 0.14+ minor.

- **How to upgrade from here.** HDS now ships a ledger-driven upgrade CLI
  (`npx @hirobius/design-system@latest upgrade`), but it refuses anything below `0.16.0`. The
  path is a hand bump to `0.16.0` (code-free, verified green), then the CLI for the rest, then
  the manual items it lists. All of it is tracked in epic **#89** (#90 upgrade, #91 brand, #92
  layout primitives, #93 inline styles).
- **Dependabot** must not group HDS 0.x minors as "safe": they are breaking (the grouped
  0.13 → 0.20 bump in #84 failed typecheck). The config change is #96.
- **The decision itself stands.** Consume HDS straight from public npm, keep the jade accent as
  the only local override, and keep the exact-match `manualChunks` react regex.

## References

- `docs/hds-upstream-consumption.md` (the brief 0.9.0 closed), `docs/adr/0001`, `0003`, `0004`
- `src/theme.ts`, `src/theme/brand-jade.css`, `src/theme.contrast.test.ts`, `src/main.tsx`
