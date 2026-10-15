# Spec: Templates master/detail, guided first run, teaching empty states (#132, Redesign P6)

Status: draft for Adrian. Part of #115 (Phase 6). Also closes the small slice of #59 that is left (see Starter packs).

## Objective

A new visitor reaches a useful Today with a track picked in three short steps, and every empty view says what it will hold and offers one next action. Templates become a list-and-editor you can use in a minute: pick a snippet, see it filled for a job, copy it. View layer only.

## What exists today

- `CopyDeckView.tsx` (117 lines): a flat column of cards. Each has a label input, Copy / Pin / Duplicate / Delete text buttons and a `Disclosure` holding the `Textarea`. Delete uses `window.confirm`. Copy shows "Copied" on the button, with no toast. No search, no preview.
- `copyDeckStore.ts`: `Snippet {id, label, body, open?, pillars?, pinned?}`, mutators, sync via `mergeSnippets`. Four seeded defaults using `[Company] [Role] [Contact] [Angle]` plus `[Your name]`.
- `templateFill.ts`: `fillTemplate`, `unfilledTokens`, `valuesFromJob`. `UseTemplate.tsx` is a Dialog on every job card that picks a snippet, fills it from the job and copies.
- `Onboarding.tsx` (159 lines): one screen. Packs as selectable `Card`s, optional location, "Build your own" needs a first title, `TrySampleButton` at the top on Today. The shell gate in `App.tsx` shows it on Today for a first run (no tracks and no jobs) and on Discover with no tracks.
- `curation/starterPacks.ts`: five packs (consulting, servicenow, designsystems, trades, blank); `seedPack` forks into editable rows.
- `EmptyState.tsx`: HDS `EmptyState` plus an action. Teaching empties exist in Today (no jobs), Discover (no links, no titles, no roles) and Pipeline (a hand-built centred Stack with icon, not `EmptyState`). Templates has a one-line empty with no title. Copy and structure differ per view.
- Route: `Route.sub` is free under `copy-deck` (sub means a sub-tab only on Discover). `useAtLeast('lg')` in `hds-gaps/useBreakpoint.ts` picks layouts in JS.

## Design

### Templates master/detail

- **Route:** `#/copy-deck` is the list; `#/copy-deck/<snippetId>` opens one. Reuse `Route.sub` (ids are UUIDs, URL-safe; the `tpl-*` defaults too). No route.ts change beyond a test; an unknown id falls back to the list with `replace`.
- **Desktop (>= `lg`):** HDS `Sidebar` (rail about 20rem). Rail: search `Input`, "New snippet" `Button`, then rows as selectable `Card`s (pinned first with a filled star `Icon`, label, first line of body as caption). With no id in the route the first snippet is shown but the hash is not rewritten. Detail: label `Input`, a row of token chips, then editor and preview in a `Switcher` (two columns).
- **Phone (< `lg`):** the list alone at `#/copy-deck`; tapping a row goes to `#/copy-deck/<id>`, which shows the detail alone with a "Templates" back `InlineLink`. Write and Preview are `Tabs`. Same switch rule as the Pipeline (`useAtLeast`).
- **Token chips:** one `Tag` per token from `TEMPLATE_TOKENS` (+ "Your name"). Click inserts `[Company]` at the cursor in the `Textarea`; a `Tooltip` says which job field fills it. Brackets stay (the existing format and stored bodies are unchanged).
- **Preview:** `fillTemplate` with a job picked from a `Select` ("Fill for: sample values | any saved job"). With no job, tokens stay visible as `[Company]`. Unfilled tokens show as a caption line, using `unfilledTokens`. Preview is plain text in a `Surface`.
- **Actions:** Copy filled text (primary, one per detail; toast "Copied"); Pin, Duplicate, Delete in a `Menu`. Delete becomes an HDS `AlertDialog`, replacing `window.confirm`. Delete is last in the menu.
- **Use with a job:** unchanged entry point (`UseTemplate` on the job page). It gains a "Manage templates" link to `#/copy-deck/<id>` and reuses the same fill and copy helper (one module, `templateCopy.ts`: `copyFilled(text)` that returns a result for the toast). Not a rewrite.

### Guided first run

Shown by the existing shell gate (Today, first run; Discover, no tracks). Three steps in one `Page`-width column (max 560), `Progress` labelled "Step n of 3", `FormActions` footer with Back (secondary) and Continue (primary), plus a "Skip" `InlineLink`-style tertiary button on every step.

1. **Pick a track.** The pack `Card` grid as today. First line: "Just looking? Try with sample data" (hidden when signed in, as now). Trying sample data fills the pipeline, which ends the first run (the gate falls through to Today) with no tracks. Continue needs at least one pack; "Build your own" asks for a first title inline.
2. **Where do you want to work?** Location `Input` (blank means anywhere). Work mode is not asked here (it is per device and per track, set in Discover, #131).
3. **Add your first job.** A single link field (the same quick-add handler as Today) and "I'll do it later". Finish seeds the packs (`seedPack` with the location), saves the job if given, and navigates to `#/today`. Today then shows the job in its first-run state.
- Step state is component state only (no new store). Skip seeds nothing at step 1 and, from step 2 or 3, seeds the packs already picked. Skipping all three leaves the gate in place (no tracks, no jobs): Today keeps showing step 1, which is acceptable and tested.
- **After the first job:** Today shows a three-item "Getting started" card (Save a job - done; Log a follow-up date or mark applied; Back up or sign in to sync) with `Checkbox` rows computed from state, dismissed per device (`rjb_ui_getting_started_done`). Optional (slice 5).

### Teaching empty states: one pattern

Shape: icon (optional) + title (what this will hold) + one sentence (what to do) + one primary action, plus at most one quiet secondary. Built on the existing `EmptyState` composition (title, message, action); the hand-built Pipeline empty folds into it (keeps its icon via a new optional `icon` prop on the local composition, hds#654 for upstream).

| View | Title | Sentence | Action |
|---|---|---|---|
| Today (no jobs) | Nothing to do yet | Save a job and its follow-ups and interviews show up here. | Add a job (focus quick-add) + Try with sample data |
| Today (jobs, nothing due) | You're caught up | Follow-ups fall due 7 days after you apply or last follow up. | Open Pipeline |
| Pipeline (no jobs) | Track your first job | Paste a link to save it, then screen it, apply and follow up. | Add job + Try with sample data |
| Discover (no tracks) | Pick a track to search | A track holds your job titles, location and saved links. | Choose a track (opens the first-run steps) |
| Discover section (empty) | No links here yet | Add links you trust, or use Title and ATS search for live ones. | Manage this track |
| Templates (none) | No templates yet | Keep cover letters, outreach notes and call scripts here, with tokens that fill from a job. | New snippet + Restore the starter set |
| Templates search (no match) | No matches | Nothing is named or says "<q>". | Clear search |

Copy is sentence case, no ALL CAPS. "Restore the starter set" re-adds missing `tpl-*` defaults by id (no overwrite).

### Starter packs (#59)

Most of #59 shipped (catalog, fork-on-pick, custom track with a title). Left in scope: the lead default. Order the grid by `STARTER_PACKS` order (consulting first) and mark the first as "Suggested" with a `Badge`. No new packs, no content work; the trades pack stays optional. Deeper catalog work stays out.

### HDS components and gaps

Use: `Sidebar`, `Card selectable`, `Input`, `Textarea`, `Tag`, `Tooltip`, `Tabs`, `Switcher`, `Surface`, `Select`, `Menu`, `AlertDialog`, `useToast`, `Progress`, `FormActions` (patterns), `Checkbox`, `Badge`, `InlineLink`. Verify each name against the 0.24.1 `llms.txt` while building (Sidebar, Progress, Surface, Checkbox, EmptyState are listed).
Gaps (file under the existing asks; stand-ins in `src/hds-gaps/` only if needed): `EmptyState` action and icon slot (hds#654); no Stepper (use `Progress`); `Textarea` has no insert-at-cursor API, so a small ref helper `insertAtCursor` lives in `templateEditor.ts`; `Sidebar` does not collapse on mobile (JS switch via `useAtLeast`).

## Testing

- Route seam through `App`, driven by role and text (prior art `shell.test.tsx`, `today.test.tsx`, `jobRoute.test.tsx`): `#/copy-deck` lists, `#/copy-deck/<id>` opens that snippet, unknown id returns to the list; search filters; pinned first; token chip inserts; preview fills for a picked job; Copy writes the filled text and toasts; delete asks first.
- First run: empty stores at `#/today` shows step 1 of 3; picking a track and Continue reaches step 2; Finish lands on `#/today` with the track and, if entered, the job; Back and Skip work on each step; sample data from step 1 ends the first run.
- Empty states: each row of the table, by title text and its action.
- `a11y.test.tsx` (jsdom axe) gains `#/copy-deck`, `#/copy-deck/<id>` and the three first-run steps. Colour contrast and layout: `npm run gallery` before and after, 1440 and 390, light and dark; add Templates (list, detail, phone detail) and first-run steps to its route list.
- Keep `Onboarding.test.tsx`, `UseTemplate.test.tsx` and `TrackerView.test.tsx` green; update only copy that changed.

## Slices (each at most 5 files, each leaves `npm run verify` green)

1. **Empty-state pattern.** `EmptyState.tsx` (optional icon), `TodayView.tsx`, `TrackerView.tsx`, `DiscoverView.tsx`, `today.test.tsx`/`pipeline.test.tsx`. Done when: the table copy above renders in Today, Pipeline and Discover with one primary action each; the hand-built Pipeline stack is gone; existing tests updated and passing.
2. **Templates list and detail (desktop + phone).** `CopyDeckView.tsx` (split into list and detail in the same file or `TemplatesList.tsx`/`TemplateDetail.tsx`), `route.test.ts` case, new `copyDeck.test.tsx`, gallery route entry. Done when: `#/copy-deck/<id>` works at both widths, search and pin-first work, delete uses `AlertDialog`, the empty states for none and no-match render.
3. **Token chips, preview, copy.** `templateEditor.ts` (`insertAtCursor`), `templateCopy.ts`, `TemplateDetail.tsx`, `UseTemplate.tsx` (use the shared copy helper, add the manage link), tests. Done when: chips insert at the cursor; preview fills from a chosen job and lists unfilled tokens; side by side at `lg`, Write/Preview tabs below; Copy toasts; `UseTemplate` still passes.
4. **Guided first run.** `Onboarding.tsx` (three steps, `Progress`, Back/Skip), `App.tsx` (Finish navigates to `#/today`), `curation/starterPacks.ts` (suggested badge only), `Onboarding.test.tsx`, `shell.test.tsx`. Done when: a first run shows "Step 1 of 3", reaches Today with the track picked, Back and Skip are always present, the sample path still works, the `MarkFirstRun` notice behaviour is unchanged.
5. **Getting started card (optional).** `GettingStarted.tsx`, `TodayView.tsx`, `today.test.tsx`. Done when: it appears after the first job, ticks from real state, and a dismissed card stays gone (`rjb_ui_*` key, ignored when absent).
6. **Gate and a11y sweep.** `a11y.test.tsx`, gallery routes, `CLAUDE.md` and `README`/`FEATURES` lines for Templates and first run, `status.json`. Done when: axe passes on the new routes; gallery before and after is attached to #132.

Order: 1, 2, 3, 4, then 5 and 6. Slices 1 and 4 are independent of 2 and 3 (can run in parallel).

## Boundaries

- No changes to sync, the blob (v4), backup format, `Snippet` shape, curation tables or `copyDeckStore` mutators beyond a "restore starter set" helper that only calls existing mutators.
- No AI. No new dependencies. No local UI primitives (`hdsOnly.test` stays green); HDS only. No `[preview]` build or merge to `main` without Adrian.
- Product name only from `src/brand.ts`. Stored ids stay (`rjb_copydeck_v1`, `apply-board`).

## Open questions (recommended default first)

1. Does the first run need step 3 (add a first job), or end after location? Default: keep it, skippable, since the acceptance line says "track pick, location, land on Today" and a job makes Today non-empty; if Adrian wants exactly the two content steps, "Step n of 3" becomes track, location, review.
2. Where does the sample-data path sit? Default: step 1 only, and it skips the rest (the sample brings its own data); tracks stay unset so Discover still onboards later.
3. Snippet routes by id or by index? Default: id (stable, survives reorder and sync).
4. Preview data when no job is chosen: placeholders or sample values? Default: leave the `[Token]` text visible; it teaches the token system and avoids fake names being copied.
5. Should the template list filter by pillar/track (the `pillars` field)? Default: no. The track tagging is dead in the UI since #99; leave the field alone.
6. Delete: `AlertDialog` confirm or toast with Undo? Default: `AlertDialog` (HDS `Toast` has no action button).
7. Ship the Getting started card (slice 5)? Default: yes but last, cut first if scope tightens.
