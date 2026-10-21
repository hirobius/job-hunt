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
`npm run hds:check` reads the registry (via `.npmrc`, needs `HDS_PACKAGES_TOKEN`), rewrites the
record when the latest moved, and exits 1 when the app is more than one minor behind. Commit the
record when it changes. Upgrade with `npx @hirobius/design-system@latest upgrade`.

## 2. Layout rules

Every route (`e2e/routes.ts`, plus the job page and Apply mode) at 390 and 1440, light and dark:

- no horizontal page overflow
- every interactive target at least 40px tall on a phone (icon-only: 40 wide too)
- no text below the HDS caption size
- one status rule: never two status badges on a title's line
- headings on the HDS type ramp, and no inline font size other than an HDS ramp token
- a 16px page side gutter on a phone

**Known debt** (`KNOWN_DEBT` in the spec) is tolerated only in its exact form, and the test fails
once it is gone, so the list only shrinks: the 12px HDS phone gutter (the mock sets 16), and the
job rail's "Due" beside a status badge at 1440 (rev-3 B).

## 3. Screenshot baselines

Every route at 390 light + dark; the Pipeline and the job page at 1440 too. Full-page shots with
sample data, a fixed clock (2026-10-21 17:00 UTC), UTC and en-US, external requests refused.
Tolerance (`playwright.config.ts`): `maxDiffPixelRatio: 0.001`, `threshold: 0.2`. A 4px spacing
shift fails (2–5% of pixels differ); three clean runs in a row pass.

Baselines are from the cloud session's Chromium on Linux (`*-chromium-linux.png`). When a change is
meant to move pixels, update them on purpose and review the PNGs in the diff:

```sh
npm run test:visual -- --update-snapshots
```
