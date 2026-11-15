# Build, deploy and verify

Build budget, CI, the deploy gate, CSP, guardrails, screenshots and repo notes.

- **Guardrails (redesign-mobile, `docs/guardrails.md`):** HDS freshness (≤ 1 minor behind `hds-version.json`) runs in `verify`; layout rules + screenshot baselines run in `npm run verify:ui` (local; update baselines with `npm run test:visual -- --update-snapshots`). **Baselines are drawn only in the pinned Playwright image** (`e2e/visual-env.json`: image digest + its Chromium, #485): `test:visual` runs the spec there through Docker (`scripts/visual-docker.mjs`); elsewhere the spec skips and an update fails (`src/visualEnv.test.ts`). Bump the digest with `@playwright/test` and re-take every baseline in the same PR.
- **Screenshot gallery (#115 Phase 0):** `npm run gallery` (or `-- --url=<deploy> --out=gallery/x`)
  shoots every route/sub-tab/dialog at 1440+390, light+dark, with sample data → `gallery/`
  (git-ignored). Run it before/after each redesign phase.

## Build / deploy / verify

- ⚠️ **Build budget — Vercel build minutes cost money (Adrian, 2026-10-14). Default to NO cloud
  builds.** Every push to `main` is a production build; every branch commit with `[preview]` is a
  preview build.
  - **Don't add `[preview]` by default.** Only when Adrian asks for a preview link, or when a
    change can't be judged without a deployed URL. One preview per review round, on the last
    commit of the round, never per commit.
  - **Merge:** agents squash-merge after green CI and an independent reviewer's
    "Reviewed: PASS — <sha7>" on the exact head commit. Batch related work into one merge to save
    production builds.
  - **Verify locally instead:** `npm run verify`, `npm run test:e2e`, and `npm run gallery`
    (builds and serves `dist/` locally — no Vercel) for screenshots. Vercel is the deploy, not
    the test runner.

- **CI (GitHub Actions):** `.github/workflows/ci.yml` runs lint, unit (4 shards), build, e2e
  (4 shards, pinned Playwright image), visual and gitleaks on every PR and on `main`. The "main
  checks" ruleset requires verify, visual and gitleaks. Agents never edit `.github/workflows`: write
  the change for Adrian.
- `npm install`, `npm run dev`, `npm run build`, `npm run typecheck`.
- **Deploy gate (#95; moved off Vercel 2026-10-24):** `vercel.json`'s `buildCommand` is `npm run build`
  (Adrian: ~3 min → ~30-60 s per deploy). Vercel does not run the checks. Run **`npm run verify`
  (typecheck → lint → vitest → build)** locally as the fast check before a push; CI is the merge
  gate. `main` is the live production site. `deployGate.test.ts` pins both halves. Branch pushes only
  build a preview when the commit message contains `[preview]`. E2E in cloud sessions: plain
  `npm run test:e2e` (`playwright.config.ts` falls back to the stable `/opt/pw-browsers/chromium`
  link; set `PW_CHROMIUM_PATH` only to use another build).
- **CSP (#97 → enforcing in #106):** `Content-Security-Policy` in `vercel.json`, pinned by
  `src/csp.test.ts`. **Any new fetch host must go in `connect-src`, the test and `legal.ts` `THIRD_PARTIES`, or it's blocked.**
  Fonts are HDS's self-hosted `fonts.css`, so `font-src`/`style-src` are `'self'` only — no font CDN (#115).
- **HDS ESLint (`hds/recommended`)** runs on `src/**/*.tsx` via `eslint.config.js`: raw controls, hex, px spacing
  and px-in-`sx` are errors (use `var(--primitive-space-N)` / t-shirt steps; `thin solid` for hairlines).
- Branch pushes get Vercel **preview deploys** (use a branch for risky work; the
  live app stays on `main`).
- The build/typecheck/test gate does **not** catch visual or runtime-CSS issues. Verify
  renders with headless Chromium (`/opt/pw-browsers/...` + vite preview, screenshots at
  desktop + 390px, and CLICK things — decorative slots can swallow interactions), and
  confirm the Vercel deploy reaches `READY` before claiming it's live.
- Backlog lives in **GitHub Issues** (see Fleet hub below), not local TODO files.
  Upstream HDS gaps + accept criteria: `docs/hds-upstream-asks-0.9.md`.

## Notes

- Supabase redirect URLs must include any new origin for magic-link sign-in:
  `https://roleflame.vercel.app/` is the Site URL and the one production Redirect URL (Supabase Auth → URL
  Configuration); the client side is `src/account/authRedirect.ts` (`PRODUCTION_ORIGIN`). Never list an address this
  Vercel project does not hold (the old `roleforge-app` and `job-hunt-jade` names are free for anyone to claim, and
  a listed address receives the session a sign-in link carries), and no wildcard entries.
- Keep personal contact info OUT of this public repo (letters/snippets ship with a
  "add your name + contact" placeholder).
- **AI is fully removed (2026-07).** The résumé-tailor went first (`TailorDialog`/`tailor-core.ts`/
  `api/tailor.ts`); then **"Add with AI" too (#54)** — `src/ai/` and `api/extract.ts` are gone,
  `@anthropic-ai/sdk` is dropped, and there is no Anthropic key / server AI endpoint anymore. The
  JD screener (#61) is **rules-based, client-side** — no AI. `docs/adr/0002` + `README`/`FEATURES`
  still describe the old AI design as historical context.
