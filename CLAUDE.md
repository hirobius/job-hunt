# CLAUDE.md — Apply Board

Project memory for future Claude Code sessions in this repo.

## What this is

**Apply Board** — a job-application tracker + discovery board, live at
**https://job-hunt-jade.vercel.app** (repo `hirobius/job-hunt`). Rebuilt from a
single static `index.html` into a React app (the old file is in git history at
commit `f15fd52`).

## Stack & conventions

- **Vite + React 18 + TypeScript + HDS (`@hirobius/design-system`). MUI is fully removed
  (issue #11 done).** Every component is **real HDS** (Buttons, Cards, Tag/Badge,
  SegmentedControl, icon-only `Button` + `Icon`/lucide, Input, Textarea, Tabs, Menu, Dialog, Tooltip, Alert,
  Spinner, Skeleton, Combobox). The gap HDS leaves — a generic `Box` and an `sx` escape hatch
  for one-off layout — is filled by a small, MUI/emotion-free primitive set in **`src/ui/`**,
  written to be routable upstream to HDS:
  - **`src/ui/box.tsx`** — a token-aware `sx` engine (spacing shorthands, HDS token color map,
    responsive `{xs,sm,md}` objects, nested `&` selectors → cached injected CSS classes) plus
    the `Box`/`Stack`/`Typography`/`Container`/`Link`/`Divider` primitives on top.
  - **`src/ui/Reveal.tsx`** — the MUI-free `<Collapse>` (CSS grid-rows 0fr↔1fr animation).
  - **The MUI-shaped adapters are retired (2026-07).** `ui/Button`, `ui/Dialog`, `ui/Tooltip`,
    `ui/Alert`, `ui/TextField` — thin shims that once let the MUI→HDS cutover proceed by
    import-swap — were **deleted** once MUI was gone; every call site now uses the real HDS
    component directly (Button `variant`/`tone`, HDS compound `Dialog`, `Tooltip` (imported as
    `HdsTooltip`), `Alert tone` + a dismiss icon-only `Button`, `Input`/`Textarea`). **`src/ui` is now purely the layout gap:**
    `box.tsx` (Box/Stack/Typography/Container/Link/Divider + the `sx` engine) and `Reveal`.
  - **These layout primitives are the ONLY remaining non-HDS UI.** HDS now ships its own `Box`
    (a token-only `sx` subset), `Stack`, `Text`, `Reveal`, `Container` and `InlineLink`, so this
    layer is being retired — epic #89, step #92. ⚠️ The dialects differ: local `sx` spacing is
    MUI-style 8px units, HDS `sx` numbers are 4px units (prefer its t-shirt keys), and colour keys
    differ (`text.secondary` → `content.secondary`). Translate deliberately, never by import swap.
  - ⚠️ **No MUI `sx` on HDS components** — HDS takes semantic token props, not `sx`. Use the
    `src/ui` primitives (which DO take `sx`) for ad-hoc layout, HDS components for everything else.
- **Design language:** jade dark theme; headlines **Clash Display**, body **Satoshi**
  (loaded via Fontshare CDN in `index.html`). Uppercase is reserved for
  eyebrows/buttons/labels only.
- **Design system:** `@hirobius/design-system` (HDS) is consumed **directly from public
  npm** (`^0.24.1`, no auth) — see `docs/adr/0005` and `docs/adr/0007`. Upgrade with
  `npx @hirobius/design-system@latest upgrade` (codemods + a to-do list; `--check` to verify).
  `main.tsx` imports `@hirobius/design-system/styles.css` (reset-free, scoped to `[data-hds]` —
  set on `<body>` in `index.html`) and `fonts.css`, then `src/theme/brand-jade.css` (jade accent
  override, incl. white on-accent text), then
  `src/theme/base.css` (the border-box + body reset/chrome MUI's `CssBaseline` used to give,
  now that MUI is gone). Theming is pure HDS token CSS vars — **no MUI theme object**; `ColorMode`
  just flips `data-theme` on `<html>` (light/dark) and HDS's variables cascade. Status colors are
  HDS feedback tokens; status/destructive actions use HDS `Button tone` / `Badge tone`. AA contrast
  is enforced by `src/theme.contrast.test.ts` against the shipped `variables.css`.
  ⚠️ `vite.config.ts` manualChunks must match react EXACTLY — a loose
  `includes('react')` catches HDS's radix/lucide deps → circular-chunk startup crash.
- **State:** a shared external store via `useSyncExternalStore` in `src/store.ts`
  (no Redux). Jobs persist to `localStorage` key **`rjb_shortlist`** and sync to
  **Supabase** (table `tracker`, one JSON blob per user; keys in `src/config.ts`,
  publishable + RLS-protected). Cloud sync UI in `src/CloudSync.tsx`. Per-account curated
  content (the Discover/Apprenticeships board) lives separately in normalized RLS tables
  `categories`/`groups`/`tiles` — the curation data layer, `src/curation/`.
- **Structure:** `src/App.tsx` — tabbed shell with four tabs: **Trades** (tab label; slug
  is still `apprenticeships` for URL back-compat) → `ApprenticeshipsView.tsx` +
  `apprenticeships.ts`, the curated Spokane board. **Trades pivot (2026-07):** hands-on
  metal leads — the live order is set by `VISIBLE_GROUP_ORDER` (apply-first → welding/fab
  shops → foundry/casting → union JATCs → programs → live searches → veteran → finders);
  groups flagged `archived: true` on the `Group` type (healthcare, remote programs, AI/expert,
  SaaS) stash under a collapsed "Archived tracks" disclosure at the bottom (board-wide search
  still spans them). Then **Queue** (`TrackerView.tsx`), **Copy Deck** (`CopyDeckView.tsx`,
  incl. seeded call sheet + cold-call script; pillar-scoping removed — flat pinned-first list),
  **Discover** (`DiscoverView.tsx` + `jobsData.ts` groups and Title/ATS generators; the generators
  take a **user-set location + work-mode** (#58, no baked-in Spokane), and the trade/pillar switcher
  lives at the top of this view, not the header). `types.ts` for the Job model. Board rule: **NO
  static one-off job postings** —
  live searches or durable portals/company pages only, so tiles never go stale.
- **Pillars = trades** (`pillars.ts`): built-ins are **Sheet Metal & Fab** (default),
  **Welding & Machining**, **Construction Trades** — each drives Discover's title/ATS search
  terms + a curated "Apply Now" featured group. The old IT Support / Design Engineering
  pillars are gone. `PillarsDialog` (relabeled "Trades") still lets users add custom pillars.
  Header cleanup: the global pillar combobox + separate manage/feedback icon buttons were
  replaced by a single overflow menu (theme toggle stays inline); the tab bar is sized for
  readability and horizontal-scrolls on narrow screens.
- **Quick-add URL params** (handled in `App.tsx`): `?add=<url>`, `?applied=<url>`,
  `?status=<Status>&u=<url>`, optional `&t=<label>` — power the iOS shortcut /
  bookmarklet / Gmail-scan one-tap links.
- **Tracker model:** default "Active" filter = not-yet-applied (Saved) + pinned;
  applying drops a job out of the active queue. Follow-up loop: "Follow up in Nd" →
  "Follow up now" → "Log follow-up" resets the clock. Weak titles auto-derive from
  the URL. Board triage (pin / set-aside) lives in `tileTriage.ts` + `tileState.ts`;
  planned consolidation: saving also floats the tile (issue #13).

## Build / deploy / verify

- **Do NOT use GitHub Actions (owner preference, 2026-07).** There is no Actions CI — the
  `.github/workflows/ci.yml` workflow was removed. **Verification is local** (`npm run typecheck`
  / `lint` / `test` / `build` + headless Chromium) **plus the Vercel deploy**. Never add or rely on
  an Actions workflow; don't treat Actions checks as a merge gate.
- `npm install`, `npm run dev`, `npm run build`, `npm run typecheck`.
- `vercel.json` builds this as Vite. **`main` is the live production site** — always
  `npm run build` (and ideally `tsc --noEmit`) before pushing to `main`.
- Branch pushes get Vercel **preview deploys** (use a branch for risky work; the
  live app stays on `main`).
- The build/typecheck/test gate does **not** catch visual or runtime-CSS issues. Verify
  renders with headless Chromium (`/opt/pw-browsers/...` + vite preview, screenshots at
  desktop + 390px, and CLICK things — decorative slots can swallow interactions), and
  confirm the Vercel deploy reaches `READY` before claiming it's live.
- Backlog lives in **GitHub Issues** (see Fleet hub below), not local TODO files.
  Upstream HDS gaps + accept criteria: `docs/hds-upstream-asks-0.9.md`.

## Skills — the architecture skill set

Vendored from github.com/mattpocock/skills into `.claude/skills/` (the container is ephemeral;
committed files are what survive). When asked for **"the architecture skill"**, an **"architecture
review"**, or to **improve/design the architecture**, invoke the **whole set as one workflow** —
not just the entry skill:

- **`/improve-codebase-architecture`** — the entry point. Scans for shallow modules / deepening
  opportunities, writes a visual HTML report to the OS temp dir (never the repo), then drives the
  grilling loop on the chosen candidate.
- **`/codebase-design`** — the shared architecture vocabulary (**module, interface, depth, seam,
  adapter, leverage, locality**) + principles (deletion test; "the interface is the test surface";
  "one adapter = hypothetical seam, two = real"; depth-as-leverage). Use these terms exactly.
  Companions: `DEEPENING.md`, `DESIGN-IT-TWICE.md` (parallel design-it-twice sub-agents).
- **`/grilling`** — interview the user one question at a time to stress-test the chosen design.
- **`/domain-modeling`** — keep `CONTEXT.md` (glossary only, no impl) + `docs/adr/` current as
  decisions crystallize. Companions: `CONTEXT-FORMAT.md`, `ADR-FORMAT.md`. Offer an ADR only when
  it's hard to reverse + surprising + a real trade-off.

Use `CONTEXT.md` for domain vocabulary and `/codebase-design` for architecture vocabulary; don't
re-litigate decisions already in `docs/adr/`.

## Notes

- Supabase redirect URLs must include any new origin for magic-link sign-in
  (production `job-hunt-jade.vercel.app` is already allowed).
- Keep personal contact info OUT of this public repo (letters/snippets ship with a
  "add your name + contact" placeholder).
- **AI is fully removed (2026-07).** The résumé-tailor went first (`TailorDialog`/`tailor-core.ts`/
  `api/tailor.ts`); then **"Add with AI" too (#54)** — `src/ai/` and `api/extract.ts` are gone,
  `@anthropic-ai/sdk` is dropped, and there is no Anthropic key / server AI endpoint anymore. The
  JD screener (#61) is **rules-based, client-side** — no AI. `docs/adr/0002` + `README`/`FEATURES`
  still describe the old AI design as historical context.

## 2026-07 — agnostic-product pivot + screening pipeline

The app is pivoting from a personal Spokane-trades board to an **agnostic, pillar-driven job-hunt
product** (design: `docs/agnostic-product-redesign.md`, decision: `docs/adr/0006`). Execution is
tracked under epic #30; the self-driving build backlog lives in `docs/loop-queue.md`. Shipped so
far this cycle:

- **Search is location-agnostic (#58).** `BOARDS` in `jobsData.ts` no longer hard-code Spokane —
  `build(term, { where, mode })` takes a user-set location + work-mode (Any/Remote/Hybrid/On-site).
  There is **no remote default** (remote roles draw ~5× the applicants); a shared `LocationControl`
  (`src/LocationControl.tsx`) drives the Title, ATS and Live postings panels.
- **Screening pipeline on jobs (#60).** Additive `Job` fields — `verdict` (match/stretch/reach),
  `mode`, `travelPct`, `applicants`, `blockers[]`, `angle`, `screenedAt` — normalized on read in
  `src/screening.ts`. Edited via `ScreeningEditor`; shown as card badges; new "Best fit" sort; a
  collapsible **Funnel** summary (`FunnelSummary` + `funnel.ts`).
- **Rules-based JD screener (#61).** `src/jdScreener.ts` + `ScreenJdDialog` — paste a JD → suggested
  mode/blockers/verdict from deterministic keyword rules, one-click apply.
- **Board↔Queue interop (#57).** Saved tiles leave the board (`partitionTiles`); enriched save
  carries a tile's meta into the job; a save toast; "Find more like this" seeds Discover.
- **Implementation Consulting** built-in pillar; simplified Trades board nav; top-level
  **error boundary** (#46).
- **Supabase provisioned (#31).** `tracker` + `categories`/`groups`/`tiles` tables now exist with
  RLS (the DB had been empty — cloud sync never had a backing table until now).
- **#30 IA/curation chain COMPLETE (B1→B5), live on `main`.** Discover now reads the per-account
  **curation store** (`useCategories`/`useGroups`/`useTiles`), not hardcoded pillars — a `Category`
  *is* a track. Shipped via per-area PRs: **#75 B1** (wire Discover→curationStore + first-run
  `Onboarding` picking starter packs, D1) · **#76 B2/B3** (strip hardcoded content, retire the Trades
  tab, tabs → Discover/Tracker/Templates, slugs kept for back-compat) · **#78 B4** (in-app curation
  controls — `ManageTrackDialog` creates/edits/deletes tracks + sections + links; D2 pin/set-aside
  triage on Discover tiles) · **#79 B5** (teaching `EmptyState`s across Discover; retired the
  now-consumerless `Divider` primitive; #38 layout cleanup). The starter-pack list
  (`src/curation/starterPacks.ts`) is deliberately trivial to edit (v1 provisional).
- **Open:** one deferred, non-user-facing piece of B2/#34 — **fully retiring `pillarStore` +
  `pillars.ts`.** They're load-bearing for cloud sync (`CloudSync`/`syncBlob`/`curationStore`/
  `copyDeckStore` import them; user-pillars ride in the sync blob), so deletion needs the sync layer
  untangled first — its own PR. ⚠️ GitHub Actions CI is non-functional org-wide AND disabled by owner
  preference (`.github/workflows/ci.yml` removed); merges rely on local verify + Vercel.

## 2026-10 — Live postings feed (Discover → "Live postings", `#/discover/live`)

Real openings pulled **at view time** from public, keyless, CORS-open APIs — no server, no keys, no
new deps — then phrase-matched and ranked. Nothing is stored until the user saves one (it becomes a
`Job` via `addJobDetailed`, which now also takes `mode`). Built for finding design-systems work
(contract/fractional and first-hire roles), but driven by the active track's terms, so it is
track-agnostic like everything else in Discover.

- **`src/feed/`** is the whole data layer, pure + table-tested: `types.ts` (Posting / RankedPosting),
  `match.ts` (phrase matching — "system design" is NOT "design system" — filters, signals
  `contract` + `founding`, scoring, dedupe), `fetchFeed.ts` (parallel sources, per-source failure
  isolation with actionable messages, 1h **in-memory** cache — board payloads are 2–3 MB, far too big
  for browser storage), `toJob.ts` (Posting → saved Job fields), `watchlist.ts`, `html.ts`, `format.ts`.
  Domain words: a **Posting** is the live, unsaved opening; saving one makes a **Job** (CONTEXT.md).
- **Sources** (`src/feed/sources/`): HN "Who is hiring?" via Algolia (latest 2 monthly threads),
  Remotive (its terms: link to the Remotive URL + credit it — the row's source label does — and
  **at most ~4 requests a day**: enforced per browser in localStorage, `rjb_feed_remotive`, 6h per-term
  cache, 4 calls per rolling 24h; over budget it says so), and
  **Greenhouse / Lever / Ashby company boards**. All take an injected `FetchJson` (tests never hit
  the network).
- **Watched companies = curated tiles.** Any tile on the track whose URL is a Greenhouse/Lever/Ashby
  board is pulled live (cap 25 per search). "Watch a company" files a tile into a `Watched companies`
  group (synced like all curation; removable in Manage track); that group is never the featured
  "Apply Now" tab. This keeps the board rule: durable portals in, fresh openings out.
- Key-backed aggregators (Adzuna, TheirStack) would need a serverless function for the secret —
  deliberately not built yet.
- ⚠️ **CSP (#41):** when a Content-Security-Policy lands, `connect-src` must allow `hn.algolia.com`,
  `remotive.com`, `boards-api.greenhouse.io`, `api.lever.co`, `api.eu.lever.co`, `api.ashbyhq.com`
  or the feed goes silent (each source would report "couldn't connect").

## Fleet hub

This repo is part of the Hirobius fleet. The operations hub is the
hirobius/ops repo: fleet state at /api/projects, consolidated tasks at
/ops/tasks (this repo's GitHub Issues sync there), current cross-project
state in docs/ai/HANDOFF.md (in ops). Conventions for every session here:
(a) track new work as GitHub Issues in THIS repo — never a local TODO
file; (b) before ending any session that changed project state, update
root status.json (updatedAt, phase, headline, next, blocked) — the ops
dashboard renders it; (c) read the ops HANDOFF before cross-project
decisions.
