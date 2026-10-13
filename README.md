# Apply Board

A job-hunt tracker with a curated discovery board. **Live → https://job-hunt-jade.vercel.app**

Paste a job link and it lands in your **Tracker**. Screen it (fit, work mode, travel, blockers,
your angle), mark it applied, and it leaves the active queue with a follow-up countdown.
**Discover** holds your own tracks of saved searches, company pages and job boards, and
**Templates** keeps reusable outreach copy one click from the clipboard. Everything works
signed-out in the browser; an optional email sign-in syncs it across devices.

## What's in it

- **Tracker** (`#/queue`, the default tab) — statuses Saved → Applied → Interviewing → Offer →
  Rejected, filters (Active, All, per-status, Retired), search, and seven sorts (recently added,
  follow-up due first, best fit, applied date, status, salary, A–Z). The follow-up loop:
  "Follow up in Nd" → "Follow up now" → "Log follow-up" resets the clock. Per-job details,
  to-dos and notes, and an interviews & calls log with **Add to calendar** (`.ics`). Above the
  list: a **This week** agenda, a **pipeline stats** band (applied, response and interview rates,
  median reply time, weekly bars) and a collapsible funnel.
- **Your data** — full-account **Back up / Restore** (versioned JSON, validated on restore) and a
  formula-safe **CSV export** of every job field.
- **Try with sample data** — an empty tracker offers a one-click fictional pipeline (every
  status, due follow-ups, upcoming interviews) with a banner to clear it. Sample records never
  sync, export or back up.
- **Screening** — per-job fit verdict (match / stretch / reach), work mode, travel %, applicant
  count, dealbreaker tags and a positioning angle, shown as card badges. **Screen a JD** pastes a
  job description and suggests mode / blockers / verdict from deterministic keyword rules — no
  AI, nothing leaves the browser.
- **Discover** (`#/discover`) — per-account **tracks** (categories) of sections and links, picked
  from starter packs on first run and edited in place (create / rename / delete tracks, sections
  and links). Tiles can be pinned or set aside; saving one sends it to the Tracker with its
  details. **Title search** and **ATS search** build live job-board queries from your terms plus a
  location and work mode (Any / Remote / Hybrid / On-site). Board rule: no one-off postings — only
  live searches and durable company or board pages, so tiles don't go stale. **Live postings**
  pulls real openings at view time from HN "Who is hiring", Remotive and the Greenhouse / Lever /
  Ashby boards of companies you watch.
- **Templates** (`#/copy-deck`) — pinned-first outreach snippets with copy buttons;
  `[Company]` / `[Role]` / `[Contact]` / `[Angle]` fill from a job via **Use template**.
- **Quick-add links** — `?add=<url>`, `?applied=<url>`, `?status=<Status>&u=<url>` (optional
  `&t=` / `&title=` label) power a bookmarklet or phone shortcut.
- **Cloud sync** — Supabase magic-link sign-in; jobs sync as one row per user and tracks live in
  normalized tables, all behind row-level security. One-time setup of the `tracker` table:
  [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) (the curation tables have no setup doc yet).

## How it's built

- **Vite · React 18 · TypeScript**, deployed on **Vercel** (`main` is production; branch
  pushes build a preview only when the commit message contains `[preview]`).
- **UI is `@hirobius/design-system` (HDS)**, installed from public npm. Theming is HDS token CSS
  variables: `src/theme/brand-jade.css` remaps the accent to jade, and light/dark is a
  `data-theme` flip on `<html>`. Layout and type are HDS too (`Box`, `Stack`, `Grid`, `Text`, HDS
  fonts); the old local layout layer is gone and `src/hdsOnly.test.ts` keeps it out.
- **Accessibility and contrast are tested, not asserted.** Component tests run axe-core WCAG A/AA
  checks, and `src/theme.contrast.test.ts` computes AA contrast for both themes from the shipped
  HDS token file plus the jade override.
- **State without a framework.** A shared external store (`useSyncExternalStore`) persisted to
  `localStorage`; URL state (tab, Discover sub-tab, track) lives in the hash via a tiny route
  store, with no router dependency.
- **Bundle.** Discover, Templates and the dialogs load on demand. Production build as of 2026-10: app
  75 kB (27 kB gzip), react 142 kB (46 kB), supabase 205 kB (53 kB), vendor 901 kB (221 kB gzip).
  Most of the vendor chunk is HDS's single entry point; per-component imports are an open
  upstream ask.
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

Domain vocabulary is in [`CONTEXT.md`](CONTEXT.md). The backlog lives in GitHub Issues.
