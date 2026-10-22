# Design polish: audit and spec (Redesign P7, #133)

Audit date 2026-10-15 on main (HDS 0.24.1, graphite accent). Evidence: `npm run gallery -- --out=gallery/audit`
(68 shots, 0 page errors; folders light-1440, dark-1440, light-390, dark-390; git-ignored), `npx eslint src`,
and greps of `src/`. Rubric: the HDS design-review skill (hierarchy, type ramp, casing, lockups, rhythm,
fill/hug, padding, alignment, density, color, states, empty, loading, error, motion). Computed-style sweeps
(type pairs, gaps, uppercase, reduced motion) were not run; those rules are marked as unverified below.

## Objective

Make RoleForge look designed, not accreted, on every screen that ships, and stop it from drifting back.
Phase 7 closes #133 (which absorbs #93 and #148) and the in-code half of #146. It adds machine checks so each
fix is held by a test, not by memory. It also produces the portfolio case study (`docs/redesign-2026.md`).
View layer only: no store, sync, backup, route-slug or CSP changes.

## Audit findings, ranked by user impact

Some findings belong to phases that have not shipped (#130 job page, #131 Discover, #132 Templates). They are
listed so P7 knows what is its own work and what it must not redo.

1. **Job page is a form, not a page** (Pipeline > job, all four captures). Title appears twice (h1 plus a link
   title in the card), the card has a heavy left rule, the action row (Use template, Follow up now, Log
   follow-up) shows three treatments, and a 40px blank band follows the Details disclosure. At 390 the title
   wraps in the card and the dark Log follow-up fill is a solid orange block. Fix: owned by #130
   (`PageHeader` + `Tabs`). P7 only fixes the Disclosure-in-card padding gap if #130 leaves it.
   Files: `src/JobCard.tsx`, `src/JobPage.tsx`.
2. **The sync nudge and the sample-data banner stack above every route's first heading** (Today, Pipeline,
   Discover, Templates, job page; all captures). On Pipeline at 390 the first job row starts about 620px down;
   at 1440 the page title sits under a 135px nudge. Two banners with two different treatments (grey and
   blue-tint). Fix: show the nudge once per session in the account area (or as a slim one-line row), and
   move the sample-data notice into the page header meta. Files: `src/account/SyncNudge.tsx`,
   `src/demo/SampleData.tsx`, `src/App.tsx`.
3. **Discover tiles** (light and dark, 1440 and 390). Tile titles use a large heavy step and wrap to 4 lines
   at 1440; tiles sit inside a second padded surface (24px extra inset on both sides, visible at 390 as a
   narrow 296px column); action row mixes a text Open, an outlined Save and a bare icon Set aside with no
   label (touch target about 24px); last row is ragged. "Apply Now" is title case beside "Title search".
   Fix: #131 tile redesign; P7 checks the tile type step and the inset after it lands.
   Files: `src/TileGrid.tsx`, `src/DiscoverView.tsx`.
4. **Templates is a stack of editors** (light and dark). Each snippet repeats a field, four text buttons and a
   collapsed "Snippet text"; the list stops at 760px and leaves 500px of empty page at 1440; "Delete" is red
   on a tinted fill next to neutral siblings. Fix: #132 master/detail. Files: `src/CopyDeckView.tsx`.
5. **Ad-hoc layout and inline style debt** (all screens). 130 `style={{` occurrences in 27 non-test `.tsx` files,
   with no guard test (`hdsOnly.test.ts` has no inline-style check). Top files: ManageTrackDialog 15, JobCard 11,
   ScreenJdDialog 10, LiveFeedPanel 10, DiscoverView 10, TrackerView 9, Onboarding 9. 7 lint warnings from
   `hds/prefer-hds-layout-primitive` in InterviewLog, ManageTrackDialog, ScreenJdDialog, TileGrid,
   UseTemplate (2), SyncNudge. Also `margin: 0` resets on `Text` (App, SyncNudge, FeedFit), raw
   `fontSize: '1.5rem'` in ErrorBoundary, 23 hard-coded `px` values, and one `transition` in JobCard.
   Fix: slice 1 and 2 below. Note #148 lists five files; the current set differs, so re-run eslint rather than
   trusting the issue.
6. **Pipeline cards at 390** (`JobListCard`). Left accent rule appears on some cards and not others (inconsistent
   state encoding), cards with no primary action leave a 40px empty band above the row menu, and a status Badge,
   fit Badge, applied text and follow-up Badge wrap onto a second line unevenly. Fix: one fixed footer row,
   one rule for the accent bar (pinned only), meta on one line that truncates. Files: `src/JobListCard.tsx`,
   `src/JobRowParts.tsx`.
7. **Today at both widths.** Rows put a trailing action about 380px away from its text at 1440 (long dead
   gutter; "Log follow-up" and "Open job" have different weights, and Open job reads as plain text). Insights
   header "Insights" is caption-sized while its tiles use a display-size value, so the band reads as two
   unrelated objects (lockups rule). Fix: cap the list width and keep the action beside the text; give the
   Insights header a `title` step. Files: `src/TodayView.tsx`, `src/Insights.tsx`, `src/hds-gaps/MetricTilesAutoFit`.
8. **Discover track header.** The Track select runs 640px wide with a filter icon and a "+" icon-only button
   that have no visible label (390 touch targets about 40px, ok, but no names). Live postings: the panel
   stacks five controls (mode, location, term, chips, watch) before any result, and results show a bare
   spinner line ("Pulling live openings") rather than a Skeleton shaped like rows (loading rule).
   Files: `src/DiscoverView.tsx`, `src/LocationControl.tsx`, `src/LiveFeedPanel.tsx`.
9. **Tabs at 390.** Four top tabs show "Temp" clipped; the fade cue exists but cuts mid-word. Discover's tool
   tabs show 3 of 4 with no cue at all. Tab selection is correct (underline shows, the base.css patch works).
   Files: `src/hds-gaps/TabsOverflowFade`, `src/DiscoverView.tsx`.
10. **Manage track at 390.** Title-search terms render as heavy dark filled chips (accent used 14 times on one
    screen; rubric: accent once per view). A red tinted strip peeks under the pinned Done button (delete zone
    clipped). Fix: neutral `Tag` chips; keep the delete section out of the clipped area or add bottom padding.
    File: `src/ManageTrackDialog.tsx`.
11. **Dark mode contrast.** Surfaces separate correctly (cards, table, banner all lifted). Watch items: the
    orange and blue Badge fills on dark (Due, Search, Applied) look saturated against black; the "Add" button
    in dark is a light grey on dark with low-contrast icon. Contrast pairs in `theme.contrast.test.ts` cover
    tokens, not these composed Badges and tones. Not measured with a pixel probe yet.
12. **Casing.** No uppercase CSS found in `src/` (grep for `textTransform`/`uppercase` is empty). Title case
    leaks in copy: "Apply Now" (Discover), "Add job" is fine. Cheap to fix in `jobsData.ts` labels.

Rubric cells not verified here: states (hover/focus/disabled), motion under reduced motion, type-ramp pair
count, computed gap sweep. Slice 5 adds the probe that decides them.

## Guards to add

- **Inline-style ratchet** in `src/hdsOnly.test.ts` (from #93 and #133): count `style={{` in non-test
  `src/**/*.tsx`; fail if the count exceeds a stored number (start at 130, lower as slices land; never raise).
  Allow a style whose only keys are `--` custom properties. A short allowlist, each entry with a reason.
- **Zero lint warnings**: change `npm run lint` to `eslint src --max-warnings=0` once warnings hit zero.
- **No raw type or px**: extend the guard to fail on `fontSize:`/`fontWeight:` in inline styles and `margin: 0`
  on `Text` (use the HDS prop or a stack gap).
- **Axe in Playwright** (`e2e/a11y.spec.ts`): read routes from `gallery/manifest.json` or share the route list
  from `scripts/gallery.mjs`; run `@axe-core/playwright` on every route and dialog, light and dark, 1440 and 390,
  fail on any violation. Run locally only (no Actions).
- **Contrast pairs** added to `theme.contrast.test.ts`: Badge tones (success, warning, error, info, in
  progress) text on fill, both themes; selected Tag, hover on tertiary and secondary Button, focus ring on
  surface.raised and surface.page.
- **Touch target probe** inside the Playwright pass: at 390, every `button, a, [role=tab], [role=menuitem]`
  visible in a gallery route has a box at least 40 by 40 (icon-only included), allowlist for inline text links.
- **Computed-style sweep** in the same pass: no `text-transform: uppercase`; at most six distinct
  font-size/weight pairs besides mono; row-gap and column-gap of layout containers on the 8/16/24/32/48 scale.
  Report only for the first run, then enforce.
- **Reduced motion**: probe with `reducedMotion: 'reduce'`; elements with a running transition or animation are
  only Spinner or Skeleton.

## Portfolio case study (from #115 Phase 7)

File: `docs/redesign-2026.md`, linked from README. It tells the story in this order: problem (the 2026-10-13
audit, 8 bullet findings), constraints (pure HDS, no local UI layer, no colour override), decisions (top
tabs, Today as home, job page as its own view, graphite accent over jade, track-level location, one AsyncState,
ratcheting guards), before/after gallery (before set from `gallery/` at `f15fd52`-era v1 and the 2026-10-13
audit; after set from this slice; 4 captures for Today, Pipeline, job page, Discover, Templates), what HDS
gained (the filed upstream asks with issue numbers, from #146), and measurements (inline styles 130 to the
final count, lint warnings 7 to 0, axe violations, bundle size from the build output, test count). Images
live in `docs/redesign-2026/` as compressed JPEG (under 300 KB each); the page is Markdown for the repo
and may be re-published as an Artifact later. Written last, after slice 6.

## Vertical slices

Each is at most 5 files, ships behind `npm run verify`, and needs no Vercel build.

1. **Guards first** (red tests): add the inline-style ratchet at today's count and the `--max-warnings=0` flag
   commented as pending. Files: `src/hdsOnly.test.ts`, `package.json`. Done when: ratchet passes at 130 and
   fails if a style is added.
2. **Lint warnings to zero** (#148): convert the 7 warnings to `Stack`/`Grid`; remove `margin: 0` on `Text`.
   Files: `InterviewLog.tsx`, `ScreenJdDialog.tsx`, `UseTemplate.tsx`, `TileGrid.tsx`, `SyncNudge.tsx`
   (ManageTrackDialog in slice 4). Done when: `npx eslint src` is clean for those files, before/after
   screenshots equal at 390 and 1440, ratchet lowered.
3. **Shell banners** (finding 2): one nudge treatment, sample-data note into the page header meta, first
   heading within 200px of the tabs at 390. Files: `SyncNudge.tsx`, `SampleData.tsx`, `App.tsx`, `TodayView.tsx`,
   `shell.test.tsx`. Done when: shell tests pass; screenshot shows page title above any banner; nudge still
   dismissible and remembered.
4. **Pipeline cards and Today rows** (findings 6, 7, 9): consistent card footer, accent-bar rule, row action
   placement, Insights title step, Discover tab fade cue. Files: `JobListCard.tsx`, `JobRowParts.tsx`,
   `TodayView.tsx`, `Insights.tsx`, `hds-gaps/TabsOverflowFade`. Done when: `pipeline.test.tsx` and
   `today.test.tsx` pass, 40px targets at 390, no clipped half-word in tabs.
5. **Axe, touch and style sweep** (Playwright): the a11y spec, touch probe, computed-style sweep, new contrast
   pairs. Files: `e2e/a11y.spec.ts`, `scripts/gallery.mjs` (export routes), `theme.contrast.test.ts`,
   `package.json`. Done when: `npm run test:e2e` passes on all routes and both themes; the first sweep report
   is saved to the PR text (not the repo).
6. **Density toggle, motion, inline-style burn-down** (#133): Account menu density radio (`data-density`,
   `rjb_ui_density`), HDS duration tokens for the one transition, burn the remaining inline styles down to the
   allowlist and ratchet to it, flip lint to zero warnings, bundle size recorded in README, `docs/redesign-2026.md`.
   Over 5 files; split into 6a (density plus motion) and 6b (burn-down plus case study) when it grows.

Order: 1, 2 and 5 can run at any time. 3 and 4 must go after #128/#129 (already on main). Findings 1, 3, 4
and 8 land in #130, #131, #132; run slice 5 after each of them and fix what it reports there, not here.
Slice 6 goes last.

## Boundaries

- No new data fields, store changes, sync or backup format changes, route slug changes, or CSP hosts.
- HDS only: no local UI primitive layer, no MUI-style `sx` engine, no colour override, no ALL CAPS.
- No GitHub Actions; verification is local (`npm run verify`, `test:e2e`, `gallery`). No `[preview]` commits
  and no merge to `main` unless Adrian asks.
- Do not redo work scheduled in #130, #131, #132 (job page, Discover, Templates); P7 verifies it after.
- Workarounds keep their issue number comment (#146). Upstream asks are filed, not patched here.
- Fix by file type in small steps; no bulk lint fix.

## Open questions (with recommended default)

1. Should the sync nudge move into the Account menu only? Default: keep one slim dismissible row on Today
   only, and show an unsynced dot on the Account trigger elsewhere.
2. Is the sample-data banner permanent while sample data exists? Default: yes, but as a one-line meta item in
   the page header, not a full-width band.
3. Density toggle: default comfortable or compact? #115 says compact spacing already shipped by default
   (#149). Default: keep current as "Compact", add "Comfortable" as the toggle option.
4. Axe: fail on `moderate` or only `serious` and above? Default: fail on every violation, per #133 ("zero").
5. Case study format: Markdown in repo, or also an Artifact? Default: Markdown now, Artifact later when
   Adrian asks for a link.
6. Weekly bars (#133 "revisit or drop"). Default: drop; MetricTiles plus the funnel carry the story and HDS
   still has no chart primitive.
7. Case study "before" source: the old v1 UI is gone from main. Default: use the 2026-10-13 artifact
   screenshots linked in #115 plus the git-history commit named in CLAUDE.md.
