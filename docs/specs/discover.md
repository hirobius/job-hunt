# Spec: Discover (redesign Phase 5, #131, absorbs #12)

Status: draft, 2026-10-15. Parent: #115. Sibling: `docs/specs/job-sources.md` owns new data sources,
liveness and the By-company view; `docs/specs/role-radar.md` owns the fit engine. This spec owns layout.

## Objective
Discover should read as one calm page: pick a track, say where and how you want to work once, then use
a search tool or browse the track's curated sections. Today the same location and mode controls repeat
in three panels, tools and sections share one clipped tab strip, tiles are ragged, and Live postings
spins forever offline.

## What exists today
- `DiscoverView.tsx`: a `Combobox` track switcher (+ Manage, + New track menu) above one `Tabs` strip that
  mixes fixed tools (Title search, ATS search, Live postings) with the track's groups. No `PageHeader`.
- `where` / `mode` live in `useState` in `DiscoverInner`, so they reset on reload, and each panel renders
  its own `LocationControl`. `Category.location` exists and Manage track edits it, but the panels ignore it.
- At 390px the strip clips after three tabs with no cue (`src/hds-gaps/TabsOverflowFade` exists, used by
  the shell, not here).
- `TileGrid.tsx`: `Grid auto-fill` of `Card`s; `kindOf(url)` gives Search/Lead badges; tap-to-call for the
  first phone in `meta`; Open, Save, and an icon-only archive button whose tooltip says "Set aside". Meta is
  still one string; cards are 160px minimum so titles wrap to 3 lines on a phone. Set-aside tiles sit in a
  `Disclosure`.
- `LiveFeedPanel.tsx` (487 lines): intro, location, search, watch-a-company, evidence, then results. Loading
  is a bare `Spinner` with no timeout; a thrown error is an `Alert`; partial failure is a warning `Alert`
  above the results; all-failed is an `EmptyState`. No retry anywhere. `FeedFit.tsx` renders evidence as a
  `Disclosure panel`, fit as a badge plus a `Disclosure`, and patterns as another `Disclosure panel`.
- `ManageTrackDialog.tsx`: Done and Delete share the footer; they overlap at 390px (#115 audit).
- No `AsyncState` helper exists yet (named in #115). No Discover route test file besides `LiveFeed*.test.tsx`.

## Design

### Track header (one place for track, location, mode)
- `PageHeader` (from `/patterns`): title is the track name; the `Combobox` switcher sits above or inside it;
  actions are Manage track (secondary) and the New track `Menu`. Under it, one context line: a `Popover`
  trigger button "Spokane, Hybrid" (or "Anywhere, Any mode") opening location `Input` + work-mode
  `SegmentedControl` (Any / Remote / Hybrid / On-site, the existing `LocationControl` body, moved).
- Location is `Category.location` (written through `updateCategory`, so Manage track edits the same value).
  Work mode is per device, `rjb_ui_mode:<categoryId>`, read in try/catch, default `any`. No schema or backup
  change. Remote still disables the location input and shows the competition hint.
- Title search, ATS search and Live postings take `where` / `mode` from the header; the per-panel
  `LocationControl` and the `onWhere` / `onMode` props are deleted. Each tool shows a one-line caption
  "Searching in Spokane, Hybrid" so the inherited setting is visible where it is used.

### Tools vs sections
- Tools are a `SegmentedControl` row: Apply now, Title search, ATS search, Live postings (4 options, fits
  at 390px with short labels "Apply", "Titles", "ATS", "Live"). Apply now stays first and default.
- The track's own groups are `Tabs` (wrapped in `TabsOverflowFade`) under a "Your sections" heading. They
  show when the tool is Apply now (the default view); choosing another tool replaces them. Route:
  `#/discover/<sub>` keeps working; sub is a tool key or a group id (slugs unchanged).
- Room is left in the tool row for a fifth entry, "By company", owned by the job-sources spec; the control
  is data-driven (an array of tools) so adding it is one line.

### Tile grid (absorbs #12)
- `Grid auto-fill`, `minItemWidth` about 240px (one column at 390px), `align="stretch"`, equal height cards.
- Card anatomy: title (one line, ellipsis, full name in expanded detail); kind badge slot (Search, Lead,
  and later Portal, Employer, Live, from `kindOf` for now, structured `kind` once meta is migrated); a row of
  meta chips (pay, place, contact) parsed from `meta` by a pure `parseMeta` that falls back to the raw
  string; footer: Open (`InlineLink` style), Save, and a labelled "Set aside" `Button tertiary sm`
  (icon plus text; Restore when aside) instead of the icon-only archive.
- Tap-to-expand: the card body toggles an inline detail (full meta, tap-to-call `tel:` links for every phone,
  host line, source note). Use `Disclosure` inside the card so it works by keyboard and without JS state;
  no new dialog. Expansion never changes the grid's equal heights for siblings in other rows.
- No data migration in this phase: structure comes from parsing, per #12's "mock first" option. A one-way
  migration of ~250 tile metas to structured fields stays a separate decision (Open question 2).

### Live postings states (through a new `src/hds-gaps/AsyncState.tsx`)
`AsyncState` takes `status` (loading / error / empty / ready), `onRetry`, and slots; it renders:
- loading: `Skeleton` rows shaped like postings (3 rows), plus after 10 s the caption "Still trying: slow
  sources are skipped after 15 s"; a hard timeout of 15 s per source in `fetchFeed` marks that source failed.
- error (all sources failed or thrown): `Alert danger` "Couldn't reach any source" + Retry button. Offline
  (`navigator.onLine === false`) says so and offers Retry.
- partial failure: results show; a compact `Alert warning` above them lists failed sources by name with a
  per-source Retry (re-runs only those), collapsed to one line with a `Disclosure` when more than two failed.
- empty: `EmptyState` with the term, plus a sibling action "Try a broader term" (focus the search input).
- Never an unbounded spinner. The fetch layer change (timeout and retry-one-source) is small and lives in
  `src/feed/`; the source list itself is job-sources territory.
- Page order in Live postings: search (term + chips) first, then results; "Watch a company" and Your evidence
  move into a collapsed "Refine" `Disclosure` below the search, so postings lead. Evidence starts open only
  while empty and no postings are showing.

### Evidence and fit consistency
- One pattern: a posting row shows at most one fit `Badge` (tier), signal badges after it, then one
  `Disclosure` "Fit and gap". Same wording and order wherever fit appears (Live rows, saved Job page).
- The evidence editor, fit details and patterns roll-up all use `Disclosure` with the same trigger style
  (drop the `panel` variant on two of the three, or use it on all three); counts in labels use the same
  format "Label (n)". Secondary text uses the HDS caption idiom from CLAUDE.md.
- "Strong fit" filter only appears with evidence (kept). With no evidence, a single caption under the row
  list says "Add evidence to see fit" linking to the Refine disclosure, not a badge on every row.

### Phone layout
- Header stacks: switcher full width, then context button and Manage on one row. Tools `SegmentedControl`
  scrolls inside an overflow wrapper with the same fade cue. Sections `Tabs` use `TabsOverflowFade`.
- Posting rows: title owns a full row, Save moves under the meta (not beside it), 40px targets.
- Manage track footer: `Dialog.Footer` stacks on phone with Done (primary) first and Delete track in a
  separate `DestructiveSection` at the end of the body, so they cannot overlap.

## HDS components and gaps
Used: `PageHeader`, `Combobox`, `Popover`, `SegmentedControl`, `Tabs`, `Grid`, `Card`, `Badge`, `Tag`,
`Disclosure`, `Skeleton`, `Alert`, `EmptyState`, `Button`, `InlineLink`, `Dialog`, `Switcher`, `Stack`.
Gaps (local stand-ins in `src/hds-gaps/`, each naming its ask): `TabsOverflowFade` (exists; also needed for
SegmentedControl overflow: ask for an overflow prop); `AsyncState` (new); `EmptyState` has no action slot
(hds#654, keep our composition); no tone prop on `Text` (hds#655). No sheet or drawer, so the location
control is a `Popover`.

## Testing
- Route seam through `App` at `#/discover`, by role and text, in jsdom: changing mode in the header changes
  the Title search URLs and the Live search call; Manage track location edit changes the header line;
  `rjb_ui_mode:<id>` survives remount; old `#/discover/<groupId>` and `#/discover/live` still resolve.
- `LiveFeedPanel.test.tsx` extended with injected `FetchJson`: loading skeleton, timeout, all-failed + Retry,
  partial failure naming sources, empty state. No network.
- Tile tests: `parseMeta` table test (pay/place/phone, raw fallback); expand shows `tel:` links; Set aside
  is a labelled button.
- axe (jsdom) mounted via `App` for each tool; axe-in-Playwright on gallery routes locally.
- `npm run gallery` before and after, 1440 and 390, light and dark; check the Discover shots and Manage track.
- `npm run verify` green per slice; no `[preview]` unless Adrian asks.

## Slices (each at most 5 files, ships behind verify)
1. Track context, no UI move. `src/discoverContext.ts` (+test), `DiscoverView.tsx`, `LocationControl.tsx`,
   `LiveFeedPanel.tsx`, `src/discover.test.tsx`. Done when: location comes from `Category.location`, mode
   from `rjb_ui_mode:<id>`, one `LocationControl` rendered in the view, panels have no location props.
2. Header and tools. `DiscoverView.tsx`, `src/DiscoverHeader.tsx`, `src/hds-gaps/TabsOverflowFade.tsx`
   (extend for the segmented row), `src/discover.test.tsx`, `ManageTrackDialog.tsx` (footer fix). Done when:
   PageHeader and context Popover work, tools are a SegmentedControl, sections are Tabs with a fade cue,
   Manage footer does not overlap at 390px.
3. Tiles. `TileGrid.tsx`, `src/tileMeta.ts` (+test), `src/TileGrid.test.tsx`, `DiscoverView.tsx`. Done when:
   equal-height grid, meta chips, kind badge, expand with tap-to-call, labelled Set aside; raw-meta
   fallback proven.
4. AsyncState and fetch timeouts. `src/hds-gaps/AsyncState.tsx` (+test), `src/feed/fetchFeed.ts`,
   `LiveFeedPanel.tsx`, `LiveFeedPanel.test.tsx`. Done when: no state spins forever offline, each failure
   has a Retry, partial failure lists sources.
5. Live postings layout and fit consistency. `LiveFeedPanel.tsx`, `FeedFit.tsx`, `LiveFeedFit.test.tsx`,
   `LiveFeedPanel.test.tsx`. Done when: results lead, Refine disclosure holds watch and evidence, one fit
   pattern, phone rows stack.
6. Gallery and guards. `scripts/gallery` routes if needed, `src/hdsOnly.test.ts` (no new inline style
   counts), docs note in `docs/redesign-2026.md`. Done when: before/after Discover shots are captured.

## Boundaries
- Always: HDS only; sentence case; try/catch around storage; keep route slugs and quick-add params.
- Ask first: migrating tile metas to structured fields; changing the Supabase schema or backup format.
- Never: new data sources, liveness checks or a By-company view (job-sources spec); AI features; GitHub
  Actions; merging to `main` without Adrian.

## Open questions (recommended default in bold)
1. Where do the sections go when a tool is active? **Hide them; Apply now is the only view that shows
   sections, and a "Your sections" tab row appears there.** Alternative: always show both.
2. Migrate ~250 tile metas to structured fields now? **No: parse at render, migrate only after Adrian
   approves one mocked tile (#12's "mock first").**
3. Work mode per device only? **Yes, per #115; promote to a column later if cross-device is wanted.**
4. Tool labels at 390px: **"Apply, Titles, ATS, Live"**; full names in the desktop row.
5. Live fetch timeout: **15 s per source, 10 s before the "still trying" caption.**
6. Move Watch a company out of Live postings into Manage track? **Keep it in Live under Refine; revisit
   when the By-company view lands.**
