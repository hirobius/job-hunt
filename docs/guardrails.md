# Guardrails (redesign-mobile)

Adrian, 2026-10-21: "set some guardrails so this doesn't happen again." These hold the mobile-first
HDS redesign (rev-3 mock: `docs/staging/all-states.html` on `claude/staging-states`) in place.

| Guardrail            | Where                                                                   | Runs in                         | Time  |
| -------------------- | ----------------------------------------------------------------------- | ------------------------------- | ----- |
| HDS freshness        | `src/hdsFreshness.test.ts`, `hds-version.json`, `scripts/hds-check.mjs` | `npm run verify` (Vercel build) | < 1 s |
| Layout rules         | `e2e/layout-rules.spec.ts`                                              | `npm run verify:ui` (local)     | ~25 s |
| Screenshot baselines | `e2e/visual.spec.ts` + `e2e/visual.spec.ts-snapshots/`                  | `npm run verify:ui` (local)     | ~22 s |

`verify:ui` = `hds:check` + both Playwright specs. It is **not** in `npm run verify`: the Vercel
build has no Chromium, and `hds:check` reads the registry. Run it before every redesign push:

```sh
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run verify:ui
```

## 1. HDS freshness

The installed `@hirobius/design-system` may trail the latest published HDS by at most one minor.
"Latest" is the checked-in record `hds-version.json`, so the unit test is offline and deterministic.
`npm run hds:check` reads public npm directly (`registry.npmjs.org`, with a cache-busting query; `npm view`
followed `.npmrc` to GitHub Packages, which stops at 0.26.2, and recorded a stale latest), rewrites the
record when the latest moved, and exits 1 when the app is more than one minor behind. Commit the
record when it changes. Upgrade with `npx @hirobius/design-system@latest upgrade`.

## 2. Layout rules

Every route (`e2e/routes.ts`, plus the job page and Apply mode) at 390 and 1440, light and dark:

- no horizontal page overflow
- every interactive target at least 40px tall on a phone (icon-only: 40 wide too)
- stacked bare links (two or more lines that are each just a link) are tap targets: 40px tall too
- a segmented control (radio row) fits the phone's content box; past it, use a Select or a faded scroller
- no text below the HDS caption size
- one status rule: never two status badges on a title's line
- headings on the HDS type ramp, and no inline font size other than an HDS ramp token
- a 16px page side gutter on a phone
- the page starts 24 under the tab row on every route (the shell owns that space; no per-view top margin)

**Known debt:** none. Slice 1 cleared both entries (the 12px phone gutter is now 16; the job
rail's "Due" moved into one badge row above the title, rev-3 B). The heading ramp includes HDS
0.29's `titleSm`.

## 3. Screenshot baselines

Every route at 390 light + dark; the Pipeline and the job page at 1440 too. Full-page shots with
sample data, a fixed clock (2026-10-21 17:00 UTC), UTC and en-US, external requests refused.
Tolerance (`playwright.config.ts`): `maxDiffPixelRatio: 0.001`, `threshold: 0.2`. A 4px spacing
shift fails (2–5% of pixels differ); three clean runs in a row pass.

**Pinned environment (#485).** Baselines are drawn only in one Playwright image, by digest, with the
Chromium it runs, both in `e2e/visual-env.json` (now `mcr.microsoft.com/playwright:v1.64.1-noble@sha256:2f05f8a7…`,
Chromium 156.0.8078.80). `npm run test:visual` (`scripts/visual-docker.mjs`) runs the spec in that image with
the repo mounted. The spec checks it is in the image: the runner's `RJB_VISUAL_IMAGE` marker,
`PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` with that folder present, Ubuntu noble in `/etc/os-release`, and the
pinned Chromium version. All four must hold. Outside the image the spec skips (so `npm run test:e2e` still runs everywhere) and an
`--update-snapshots` fails, so no other Chromium, font stack or rasterizer can write a baseline. (#476 did:
glyph widths and wrapping changed on every PNG.) Needs Docker; node_modules must be Linux x64 (a cloud
session, or `npm ci` inside the image on a Mac). In a cloud session, start the daemon first:
`dockerd > /var/tmp/dockerd.log 2>&1 &`.

**To bump it:** with each `@playwright/test` bump, take the new image's digest
(`docker pull mcr.microsoft.com/playwright:vX.Y.Z-noble`, then `docker inspect --format '{{index .RepoDigests 0}}'`),
put it and its Chromium version in `e2e/visual-env.json` (`src/visualEnv.test.ts` fails when the tag and the
pin disagree), and re-take every baseline in the same PR.

When a change is meant to move pixels, update them on purpose and review the PNGs in the diff:

```sh
npm run test:visual -- --update-snapshots
```
