# Overnight UX pass, summary

> **Historical record (2026-06).** This summarises one past work session. The app has moved on
> since: MUI is gone (the UI is HDS), the AI features were removed (#54), and the boards and tabs
> were reorganised (#76). For how the app works today, read the [README](README.md).

Autonomous UX pass on Apply Board. **11 commits, each gated** (`npm run build && npm run
typecheck && npm test`) before landing on **`main`**. Final production deploy
`f4d773f` reached Vercel **READY** (https://job-hunt-jade.vercel.app). MUI kept throughout -
no HDS components, no Tailwind, no re-platform.

## Gate status per commit (all green)

| # | Commit | Gate |
|---|---|---|
| 1 | `7327278` feat(nav): hash-based URL routing for the top-level tab | ✅ |
| 2 | `f441be2` feat(nav): sync Discover sub-tab and active pillar to the URL | ✅ |
| 3 | `075429f` feat(tracker): real Sort menu | ✅ (1 retry, see below) |
| 4 | `52651e7` feat(tracker): Saved filter pill + scrollable filter row | ✅ |
| 5 | `99ac5df` fix(theme): define secondary palette (Interviewing chip) | ✅ |
| 6 | `04e80fb` feat(ux): layout-matched skeletons for lazy views | ✅ |
| 7 | `79eaa53` feat(ux): shared EmptyState | ✅ |
| 8 | `1e4d482` feat(ux): "Saved ✓" autosave flash | ✅ |
| 9 | `32639e5` feat(a11y): tabpanel wiring, filter group label, focus ring | ✅ |
| 10 | `4184816` docs: HDS adoption map | ✅ |
| 11 | `f4d773f` docs: correct FEATURES | ✅ |

The only gate failure all night: commit 3's first run hit a TS error (`Array.at()` not in the
ES2020 lib target) in a new test. Fixed on the first retry (indexing instead of `.at(-1)`);
no revert needed.

## What changed, per work item

### 1) Navigation / routing
- **New `src/route.ts`**, a lightweight `hashchange` external store (no react-router),
  read via `useSyncExternalStore`. Pure `parseHash`/`buildHash` with unit tests.
- Top-level tab, Discover's nested sub-tab, and the active career pillar all serialize to the
  hash: `#/queue`, `#/discover/titles`, `#/discover/ats?pillar=<id>`.
- **Before:** tabs were local `useState`; the `#` on the live URL was dead; refresh/back/forward
  lost the view; default landing was Apprenticeships.
  **After:** refresh and back/forward restore the exact tab + sub-tab + pillar; **Queue is the
  default landing** when the hash has no route; quick-add deep links (`?add`/`?applied`/
  `?status&u`) still ingest and now normalize to `#/queue`.
- Sub-tabs match by **stable key** (tab counts differ per pillar); pillar is reflected only when
  non-default to keep common URLs clean.
- `?case=<slug>` already had a visible "← Apply Board" back button (`CaseStudyView.tsx`); left
  as-is per the hands-off-case-study decision, it returns to the board (now the Queue).

### 2) Sorting (Tracker)
- **New `src/jobSort.ts`** (pure, unit-tested) + a Sort menu in the toolbar.
- **Before:** no real sort, only retired-last → priority → insertion order, though FEATURES.md
  marked sort done.
  **After:** Recently added (default, **newest first**), Follow-up due first, Applied date,
  Status, Salary, A–Z. Invariants in every sort: **retired last, priority floats within its
  group**; default also **floats DUE follow-ups to the top** of the active set. Salary parses the
  largest figure (k expanded), blanks last; status follows the lifecycle order.
- Added a **Saved** filter pill; the filter row is now a single **horizontally-scrollable** row
  so it doesn't wrap raggedly on mobile (Sort + Export stay pinned right).

### 3) Bug, Interviewing chip
- `palette.secondary` was never defined, so the Interviewing chip rendered MUI default purple.
  Added a deliberate **mode-aware violet** (`#a78bfa` dark / `#6d28d9` light), distinct from
  info/success/warning/error/primary, and extended `theme.contrast.test.ts` to assert it clears
  **WCAG AA (≥4.5:1)** on both surfaces in both modes.

### 4) De-clunk
- **Skeletons** (`src/Skeletons.tsx`) shaped like each lazy view (Discover tab-strip + tile grid,
  Copy Deck toolbar + cards, case-study article) replace the centered `CircularProgress`.
- **`src/EmptyState.tsx`** (message + optional action) replaces ad-hoc empty text in Tracker,
  Copy Deck (now offers a "New snippet" action), and the My-apprenticeships group.
- **"Saved ✓" flash** (fading, reserved height → no layout shift) on Job detail-field autosave.

### 5) Accessibility
- Top-level **and** Discover tabs now expose `role="tabpanel"` with `id` + `aria-labelledby`
  paired to each tab's `id` + `aria-controls`.
- The Tracker filter `ToggleButtonGroup` has an accessible name ("Filter jobs by status").
- One shared, visible **`:focus-visible` ring** (primaryMain, AA non-text on both backgrounds)
  across all MUI ButtonBase elements and links.
- New `src/aria.test.tsx` asserts the filter group name and the Discover tab↔panel pairing; the
  axe-core suite stays green.

### 6) HDS adoption map (docs only)
- **`docs/hds-adoption.md`** maps every MUI component in use → its HDS (Tailwind+Radix v0.6.0)
  replacement with prop/behavior gaps, and lists what to contribute back, the **semantic
  feedback colors** (success/warning/info + the Interviewing secondary, with the app's
  AA-verified hex values) **if** HDS's badge/tag variants don't already cover the status set.
  Explicitly excludes TileGrid/EmptyState (HDS already has equivalents).

## Docs updated
- `FEATURES.md`, corrected the sort claim (was marked done before it existed) and added a
  Navigation & UX section (routing, Saved filter, skeletons, empty states, autosave, a11y).

## Deferred / notes
- **Top-level App tabs are ARIA-wired but not unit-tested.** Rendering `App` in a test mounts
  `CloudSync`, which instantiates a Supabase client at module load, out of bounds per the
  hands-off-Supabase decision and a flakiness risk. The safely-renderable pieces (Discover tabs,
  filter group) are unit-tested instead, and axe covers the individual views.
- **Default landing changed Apprenticeships → Queue** per instructions; this intentionally
  reverses the recent "Apprenticeships as default tab" decision. Tab order is unchanged
  (Apprenticeships still first in the strip).
- Untouched per constraints: AI/assistant flow (`api/`, `src/ai/`, `ANTHROPIC_API_KEY`),
  Supabase config/keys, Phase-4 features, and case-study content.
