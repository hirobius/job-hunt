# Roleforge

_Working name, formerly Apply Board. The name is set in one place, `src/brand.ts` (#55)._

A job-hunt tracker with a curated discovery board. **Live → https://job-hunt-jade.vercel.app**

Paste a job link and it lands in your **Pipeline**. Screen it (fit, work mode, travel, blockers,
your angle), mark it applied, and it leaves the active queue with a follow-up countdown. **Today**
opens each visit on what's due: follow-ups, the week's interviews and how the search is going.
**Discover** holds your own tracks of saved searches, company pages and job boards, and
**Templates** keeps reusable outreach copy one click from the clipboard. Everything works
signed-out in the browser; an optional email sign-in syncs it across devices.

## What's in it

- **Today** (`#/today`, the home tab) — follow-ups due now, each with one-tap **Log follow-up**;
  the next 7 days of interviews and calls; one quick-add field for a job link; and a collapsible
  **Insights** band (applied in the last 7 days against the week before, response and interview
  rates, median reply time, a Saved → Applied → Interviewed → Offer funnel and a fit summary).
  A first visit opens on setup (pick a track, or try the sample data) instead.
- **Pipeline** (`#/queue`) — every saved job in one list: a sortable table on a desktop, compact
  cards on a phone, each row with one next step (Mark applied or Log follow-up) and a menu for the
  rest. Statuses Saved → Applied → Interviewing → Offer → Rejected, filters (Active, All,
  per-status, Retired), search, and seven sorts (recently added, follow-up due first, best fit,
  applied date, status, salary, A–Z). The follow-up loop: "Follow up in Nd" → "Follow up now" →
  "Log follow-up" resets the clock. Each job has its own page (`#/queue/<jobId>`) with details,
  to-dos and notes, and an interviews & calls log with **Add to calendar** (`.ics`).
- **Your data** — full-account **Back up / Restore** (versioned JSON, validated on restore) and a
  formula-safe **CSV export** of every job field.
- **Try with sample data** — first-run setup and an empty Pipeline offer a one-click fictional
  pipeline (every status, due follow-ups, upcoming interviews) with a banner to clear it. Sample
  records never sync, export or back up.
- **Screening** — per-job fit verdict (match / stretch / reach), work mode, travel %, applicant
  count, dealbreaker tags and a positioning angle, shown as card badges. **Screen a JD** pastes a
  job description and suggests mode / blockers / verdict from deterministic keyword rules — no
  AI, nothing leaves the browser.
- **Discover** (`#/discover`) — per-account **tracks** (categories) of sections and links, picked
  from starter packs on first run and edited in place (create / rename / delete tracks, sections
  and links). Tiles can be pinned or set aside; saving one sends it to the Pipeline with its
  details. **Title search** and **ATS search** build live job-board queries from your terms plus a
  location and work mode (Any / Remote / Hybrid / On-site). Board rule: no one-off postings — only
  live searches and durable company or board pages, so tiles don't go stale. **Live postings**
  pulls real openings at view time from HN "Who is hiring", Remotive and the Greenhouse / Lever /
  Ashby boards of companies you watch.
- **Templates** (`#/copy-deck`, one template at `#/copy-deck/<id>`) — a searchable list of
  pinned-first outreach snippets beside an editor with token chips and a preview filled for a
  saved job; **Copy** puts the filled text on the clipboard. `[Company]` / `[Role]` / `[Contact]` /
  `[Angle]` also fill from a job via **Use template**.
- **First run** — three steps (pick a track, where you want to work, add your first job), each
  with Back and Skip; **Today** then shows a Getting started card until you dismiss it.
- **Quick-add links** — `?add=<url>`, `?applied=<url>`, `?status=<Status>&u=<url>` (optional
  `&t=` / `&title=` label) power a bookmarklet or phone shortcut.
- **Cloud sync** — Supabase magic-link sign-in; jobs sync as one row per user and tracks live in
  normalized tables, all behind row-level security. One-time setup of the `tracker` table:
  [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) (the curation tables have no setup doc yet).

## How it's built

- **Vite · React 18 · TypeScript**, deployed on **Vercel** (`main` is production; branch
  pushes build a preview only when the commit message contains `[preview]`).
- **UI is `@hirobius/design-system` (HDS)**, installed from public npm. Theming is HDS token CSS
  variables with HDS's default graphite accent (no local colour override), and light/dark is a
  `data-theme` flip on `<html>`. Layout and type are HDS too (`Box`, `Stack`, `Grid`, `Text`, HDS
  fonts); the old local layout layer is gone and `src/hdsOnly.test.ts` keeps it out.
- **Accessibility and contrast are tested, not asserted.** Component tests run axe-core WCAG A/AA
  checks, and `src/theme.contrast.test.ts` computes AA contrast for both themes from the shipped
  HDS token file.
- **State without a framework.** A shared external store (`useSyncExternalStore`) persisted to
  `localStorage`; URL state (tab, Discover sub-tab, track) lives in the hash via a tiny route
  store, with no router dependency.
- **Bundle.** Discover, Templates and the dialogs load on demand. Run `npm run build` for the
  current chunk sizes. The redesign story is in [`docs/redesign-2026.md`](docs/redesign-2026.md). Most of the vendor chunk is HDS's single entry point; per-component
  imports are an open upstream ask.
- **Security headers** (HSTS, nosniff, frame-deny, referrer and permissions policies) ship from
  `vercel.json`, plus an enforcing Content-Security-Policy (#106).

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # Vitest + Testing Library + axe-core
npm run typecheck
npm run lint
npm run build
npx playwright test  # e2e happy path (first time: npx playwright install chromium)
```

**Verify before you push.** Nothing runs on GitHub Actions, by choice. One command runs the whole
gate, and Vercel's build runs the same command, so a red check blocks the deploy:

```bash
npm run verify       # typecheck → lint → tests → build, stops at the first failure
npm run test:e2e     # in cloud sessions: PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
```

Visual changes also get a headless-Chromium look at desktop and 390px wide; the checks can't
see layout.

No secrets are needed to develop. The Supabase URL and publishable key in `src/config.ts` are
public by design, with access controlled by row-level security.

## Decisions

The architecture decision records explain how the app got here:

- [`docs/adr/0001`](docs/adr/0001-consume-hds-via-tokens-on-mui.md) — first HDS adoption, at the
  token layer (superseded by 0005).
- [`docs/adr/0002`](docs/adr/0002-ai-features-grounded-structured-output.md) — the AI features
  (historical: removed in #54).
- [`docs/adr/0003`](docs/adr/0003-stay-on-vite-adopt-hds-incrementally.md) — stay on Vite, adopt
  HDS incrementally.
- [`docs/adr/0005`](docs/adr/0005-consume-hds-directly-from-public-npm.md) — consume HDS directly
  from public npm (see its addenda for the current upgrade path).
- [`docs/adr/0006`](docs/adr/0006-pivot-to-agnostic-pillar-driven-product.md) — pivot from a
  personal board to an agnostic, track-driven product.
- [`docs/adr/0007`](docs/adr/0007-track-hds-latest-with-the-upgrade-tool.md) — track the latest
  HDS with its upgrade tool (exact-pinned; bumped only through the tool).
- [`docs/adr/0008`](docs/adr/0008-sync-user-edited-stores-in-blob-v5.md) — every user-edited
  store (targets, saved searches, evidence, work mode) syncs in blob v5.

Domain vocabulary is in [`CONTEXT.md`](CONTEXT.md). The backlog lives in GitHub Issues.
