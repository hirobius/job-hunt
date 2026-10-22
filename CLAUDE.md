# CLAUDE.md — Roleforge (formerly Apply Board)

Project memory for future Claude Code sessions in this repo.

## What this is

**Roleforge** (working name, formerly Apply Board) — a job-application tracker + discovery board, live at
**https://job-hunt-jade.vercel.app** (repo `hirobius/job-hunt`). Rebuilt from a
single static `index.html` into a React app (the old file is in git history at
commit `f15fd52`).

**Product name = `src/brand.ts` only (#55).** Header wordmark, `<title>`/meta (index.html
`%BRAND_*%` placeholders via the `brand-html` Vite plugin), toasts and download filenames read it;
`src/brand.test.ts` fails on a hard-coded name. Stored identifiers stay fixed on purpose: the backup
format id `app: 'apply-board'` and calendar UIDs `@apply-board`.

## Stack & conventions

- **Vite + React 18 + TypeScript + HDS (`@hirobius/design-system`) — and nothing else for UI
  (epic #89, 2026-10).** Every element is real HDS: layout (`Box` with HDS's token-only `sx`,
  `Stack`, `Switcher`, `Grid`, `Container`), type (`Text` on the HDS ramp: display / title / body
  / ui / caption / mono), and components (Button incl. icon-only `Button iconOnly` + `Icon`, Card,
  Tag/Badge, SegmentedControl, Input, Textarea, Tabs, Menu, Dialog, `Tooltip` (imported as
  `HdsTooltip`), Alert, Spinner, Skeleton, Combobox, `Disclosure`, `EmptyState`, `InlineLink`).
  The old local `src/ui` layer (a MUI-style `sx` engine + Box/Stack/Typography/Reveal) is
  **deleted**, and `src/hdsOnly.test.ts` fails if a local UI primitive layer or an import of one
  comes back.
  - **HDS `sx` dialect** (`Box sx`): spacing numbers are **4px** units — prefer the t-shirt keys
    (`'xs'` 8 · `'sm'` 16 · `'md'` 24 · `'lg'` 32 · `'xl'` 48); colours are token keys
    (`content.secondary`, `surface.raised`, `border.default`, `feedback.error`, `accent`);
    `border` needs a style (`'1px solid'`). Prefer named primitives (Stack/Switcher/Grid) over
    `Box sx`, and parent gaps over child margins.
  - **Responsive `sx` takes a `base` key (HDS 0.26.2, hds#652):** `{ flexDirection: { base:
'column', sm: 'row' } }`; `xs` means min-width 375, so never use it as the base. For a row of
    peer fields prefer `Switcher`. The old nested `'&'` override is gone (`hdsOnly.test.ts`).
  - **Secondary text** is `<Text variant="caption" tone="secondary">` (HDS 0.26, hds#655);
    `hds-gaps/tone` is gone (slice 4): use `Text tone`, never an inline colour. Bold is
    `Text weight="bold"` (HDS 0.28).
  - **Empty states** import `src/hds-gaps/EmptyState` (HDS `EmptyState` + `not-italic`: HDS 0.30
    sets the title in italic; `centered` / `framed` draw rev-3's centred teaching empty with an
    icon tile). `e2e/layout-rules.spec.ts` fails on any italic text.
  - **HDS gap registry (#146):** every local workaround (`src/hds-gaps/`, the
    `base.css` patches) is listed with its upstream ask in `docs/hds-upstream-asks-0.9.md`. Delete
    a workaround in the HDS upgrade PR that ships its fix, and update the table.
- **Design language (pure HDS, Adrian 2026-10-12; graphite 2026-10-15):** HDS typography
  (`fonts.css`, Plus Jakarta Sans, the HDS type ramp), surfaces and the default **graphite
  accent**. There is **no local colour override** — the jade `brand-jade.css` was removed, and
  `hdsOnly.test.ts` fails if a `src/theme/brand-*.css` or an accent-token remap comes back. No ALL CAPS anywhere (HDS never sets it; `hdsOnly.test.ts` checks).
- **Design system:** `@hirobius/design-system` (HDS) is consumed **directly from public
  npm** (exact-pinned `0.30.0`; `hdsOnly.test.ts` enforces the exact pin) — see `docs/adr/0005` and `docs/adr/0007`.
  The HDS ESLint plugin comes from the private `@hirobius/hds-toolkit` (GitHub Packages, hirobius/ops#691):
  `.npmrc` maps `@hirobius` there, so installs need `HDS_PACKAGES_TOKEN` (classic, `read:packages`). GitHub
  Packages stops at design-system 0.26.2, so the lockfile resolves it from registry.npmjs.org and `.npmrc` sets
  `replace-registry-host=never` to keep that URL (install a new HDS with `--@hirobius:registry=https://registry.npmjs.org`).
  **Compact density is the app's only density** (`data-density="compact"` on `<html>` in `index.html` and
  `theme-init.js`; HDS 0.30: space 4/8/12/16/24/32, body 15, caption 13, ui 14, title 24; no toggle). Upgrade with
  `npx @hirobius/design-system@latest upgrade` (codemods + a to-do list; `--check` to verify).
  `main.tsx` imports `@hirobius/design-system/styles.css` (reset-free, scoped to `[data-hds]` —
  set on `<body>` in `index.html`) and `fonts.css`, then
  `src/theme/base.css` (border-box + body chrome from HDS tokens — what reset-free `styles.css`
  leaves to the host). Theming is pure HDS token CSS vars — **no MUI theme object**; `ColorMode`
  just flips `data-theme` on `<html>` (light/dark) and HDS's variables cascade. Status colors are
  HDS feedback tokens; status/destructive actions use HDS `Button tone` / `Badge tone`. AA contrast
  is enforced by `src/theme.contrast.test.ts` against the shipped `variables.css`.
  ⚠️ `vite.config.ts` manualChunks must match react EXACTLY — a loose
  `includes('react')` catches HDS's radix/lucide deps → circular-chunk startup crash.
- **State:** a shared external store via `useSyncExternalStore` in `src/store.ts`
  (no Redux). Jobs persist to `localStorage` key **`rjb_shortlist`** and sync to
  **Supabase** (table `tracker`, one JSON blob per user; keys in `src/config.ts`,
  publishable + RLS-protected). **Blob v10 (ADR 0008 + addenda)** adds Documents (`src/documents.ts`, `rjb_documents`, #226: Versions,
  one locked Sent per kind per Job, dropped by Delete forever) on top of v9's dream companies (`rjb_dreams`) on top of
  v8's Recently removed (`src/trash.ts`, `rjb_trash`, 30 days; also in backups), v7's wide-sweep titles and
  v6's Application kit; v5 carries jobs, snippets, set-aside tiles **and the
  user-edited per-browser stores: outreach targets (`rjb_targets`), saved searches (`rjb_feed_filters`),
  the evidence text (`rjb_radar_evidence`), work mode per track (`rjb_ui_mode:<id>`, `src/trackModes.ts`),
  the Application kit (v6), sweep titles (v7, #220), the trash (v8, #214) and dream companies
  (`rjb_dreams`, v9)**
  — rule: whatever the user manipulates is persistent; each store has `getAll*/replace*/merge*/use*`.
  Caches and device UI prefs (`rjb_liveness`, `rjb_probe`, `rjb_gh_*`, `rjb_feed_remotive`, `rjb_ui_*`, pins)
  stay local. Deletes stay deleted across devices: the seed merge runs on every load and is three-way against the device-local `rjb_sync_base` (`src/syncBase.ts`, #219). Sign-out flushes the blob first (confirms if the push fails); evidence is capped at 20,000
  chars; per-track data is dropped when its track is deleted (`src/trackData.ts`; no sweep after sync, orphans are harmless). Cloud sync lives in `src/account/` (see the account seam below). Per-account curated
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
  incl. five starter templates, one of them the generic "Intro call script" (`tpl-intro-call`; `restoreStarterSnippets` adds any missing `tpl-*`, never touches existing snippets); pillar-scoping removed — flat pinned-first list),
  **Discover** (`DiscoverView.tsx` + `jobsData.ts` groups and Title/ATS generators; the generators
  take a **user-set location + work-mode** (#58, no baked-in Spokane), and the trade/pillar switcher
  lives at the top of this view, not the header). `types.ts` for the Job model. Board rule: **NO
  static one-off job postings** —
  live searches or durable portals/company pages only, so tiles never go stale.
- **Pillars = trades** (`pillars.ts`): built-ins are **Sheet Metal & Fab** (default),
  **Welding & Machining**, **Construction Trades** — each drives Discover's title/ATS search
  terms + a curated "Apply Now" featured group. The old IT Support / Design Engineering
  pillars are gone. `PillarsDialog` (relabeled "Trades") still lets users add custom pillars.
  **Shell (#115 Phase 1; rev-3 mobile slice 1):** slim header = the body-size wordmark at every width (the one `h1`, `Text variant="body"` semibold, so the
  page title is always the biggest text) · top tabs (**Companies · Pipeline**; they scroll on a phone; HDS TabsList fades the hidden edge) · the
  **Account** button: an HDS `Avatar` (initial signed in, person icon signed out, a warning dot while jobs are unsynced; named "Account" / "Account, not synced"; it holds account, data, display and feedback). Phone page gutter is 16 (`--semantic-space-fixed-sm`), HDS's region gutter from `sm`. `src/account/` is the account
  seam: `CloudSyncProvider` + `DataToolsProvider` own sync / backup / restore / CSV and expose
  `useCloudSync` / `useDataTools` (`accountContext.ts`); `AccountMenu` holds sign-in/out, Documents, Back up,
  Restore…, Export CSV, theme and feedback; there is no sync banner (the Avatar dot says it, rev-3 P);
  `SignInDialog` is the magic-link form. Errors are HDS **Toasts** (`ToastProvider` in `main.tsx`;
  tests wrap App in one). Shell behaviour is pinned at the route seam in `src/shell.test.tsx`, incl. the Account menu order
  (signed out: device-only line, Sign in | data | display; signed in: "Signed in as <email>" + sync
  line as non-item labels | data | display | Sign out, Delete my data last in the danger colour;
  data = Documents, Back up, Restore…, Export CSV).
- **Guardrails (redesign-mobile, `docs/guardrails.md`):** HDS freshness (≤ 1 minor behind `hds-version.json`) runs in `verify`; layout rules + screenshot baselines run in `npm run verify:ui` (local, needs Chromium; update baselines with `npm run test:visual -- --update-snapshots`).
- **Screenshot gallery (#115 Phase 0):** `npm run gallery` (or `-- --url=<deploy> --out=gallery/x`)
  shoots every route/sub-tab/dialog at 1440+390, light+dark, with sample data → `gallery/`
  (git-ignored). Run it before/after each redesign phase.
- **Job routes (#127):** every saved job has a page at `#/queue/<jobId>` (`Route.jobId`; the second
  segment is a job under `queue`, a sub-tab elsewhere). `store.jobIdOf(url)` derives the id (hash
  of `dedupKey`, never stored); `findJobById` resolves it; `route.openJob(id | null)` navigates.
  **Job page (#130; rev-3 mobile slice 2):** `JobPage.tsx` = `JobHeader` ("← Pipeline", one
  `JobBadges` row above the title (fit first, status, Follow-up due), company · location, then one
  row: 40px icon Star ("Star"/"Starred"), the one primary next step, the menu, which holds Remove)
  over **three** `Tabs` (rev-3 F): Overview (`JobOverview`: `PipelinePanel` panels — Details, the
  `jobFacts` `MetadataList` that turns into its fields on Edit: title, company, location, pay, link
  (saves on blur, the page follows the new id), contact, with seniority and résumé under More
  fields; starts in edit for a job without title and company; research links under the facts ·
  To-dos (a quiet "Add a to-do" line opens the field; "Add starter tasks" while empty) and Notes (`TodosNotes`; the one Notes field: `notes`, else the older `note`) · Documents
  (count, Sent line, Use template, every document behind one "All documents" Disclosure row)) ·
  Screening (`JobScreening`: Fit panel with `ScreeningEditor`, `JdScreenPanel` as a closed row) ·
  Interviews. **Remove is soft
  (`trash.ts`):** the job goes to Recently removed (link under the Pipeline list, Restore / Delete
  forever) with an Undo notice (`saveNotice.removeWithUndo`, shown by the one `NoticeHost`, so it
  never stacks with a save notice). Restoring a posting saved again since merges the removed copy's
  notes, to-dos and interviews into the saved one. Starred jobs
  have their own Pipeline filter. The open tab is local
  state keyed by job, not in the URL. At ≥ `lg` an HDS `Sidebar` puts `JobRail` (links with
  HDS `NavList` link rows, badges above the title) beside the job; below it the job is alone with a Back link.
  The Pipeline's filter/search/sort live in `pipelineView.ts` (in memory, shared by `TrackerView`
  and the rail; `test/setup.ts` resets it per test). An unknown id shows a skeleton, then waits for
  `useCloudSync().settled` before falling back to `#/queue`. Pinned in `src/jobPage.test.tsx`. `HOME_ROUTE` (`discover`) and
  `QUICK_ADD_LANDING` (`queue`) are separate in `App.tsx`. Pinned in `src/jobRoute.test.tsx`.
- **Calm list shell (epic: layout direction "A + C's Apply sheet", PR #208, slice 1):** the tabs are
  **Companies · Pipeline** (Templates lost its tab in #240); Companies is the old Discover (slug
  `discover`, home, hosts the first-run gate) and an empty hash lands there. "Try with sample data"
  lands on the Pipeline. The Pipeline always ends with a secondary **Find the next company** button
  (→ `#/discover`, empty or not; Calm list 4/7, #238, pinned in `pipeline.test.tsx`).
- **Pipeline panels (rev-3 mobile slice 1, `docs/staging/all-states.html` on `claude/staging-states`):**
  Getting started, To apply, Follow up, Next 7 days and Jobs are `PipelinePanel` (HDS `Card`, header +
  `Badge count`), 24 apart. The Jobs panel holds the full-width search, Status and Sort as select-style
  menus and a quiet **Clear filters** when non-default; phone rows are HDS entity cards (`Card.Header`
  metadata = badge row above the title, fit first, then status, then Follow-up due; `Card.Facts` with
  location and applied date; `Card.Footer` next step + bordered ⋯ menu). Rhythm is HDS Stack gaps, no
  margins. Elsewhere still no card patterns: the Documents
  list, company lists (`rowsStyle` + `.rjb-rows` hairlines) and the loading skeletons are flat rows
  on the page. Cards stay only where they hold a form or a choice (job Details, Onboarding picks).
  Pinned in `src/calmLayout.test.tsx`.
- **Today is gone (Calm list 2/7, #236):** `#/today` redirects to Companies (`navigate(…, true)`,
  so Back skips it); `TodayView`, `TodayNotice` and `rjb_ui_today_home_seen` are deleted. Its lists
  live at the top of the Pipeline (`ApplyQueueSummary` → `PipelineAgenda.tsx`): under To apply, one
  **Follow up (M)** section (due first from `dueFollowUps`, Due badge + the one Follow up button,
  then the rest of `followUpJobs` with their day) and **Next 7 days (N)** (`upcomingEvents`); a
  section with nothing in it renders nothing. `GettingStarted` sits over them. Quick-add is the Pipeline's Add job dialog. HDS-gap stand-ins
  live in `src/hds-gaps/`, each naming its upstream ask. **The onboarding gate lives in the
  shell:** Companies shows `Onboarding` on a first run (no tracks and no jobs; it offers sample data
  there) and `ChooseTrack` whenever there are no tracks; Pipeline and Documents never gate. Pinned
  in `src/pipelineFollowUps.test.tsx`.
- **Documents library (#227; replaced Templates #132, no tab since #240):** `#/copy-deck` (slug kept)
  is a page with no tab selected (App mounts `DocumentsView` outside the tab panels), reached from the
  Menu's Documents item and the Apply sheet's Edit documents link, headed "Documents" with Back to
  Pipeline. `DocumentsLibrary` is a `Panel` per kind (count, "New" in the header) of HDS Disclosure
  rows, one open at a time (redesign slice 3, rev-3 M): closed, the title and its variables as chips;
  open, the first lines (`templateFill.previewText`, cut on a word or blank boundary) with Copy, Open
  (the editor) and a menu (Pin, Duplicate, Delete). `DocumentEditor` (rev-3 N: the document's title as
  the page head; Save, Version history and the menu in one row) saves each change as a Version.
  Outreach messages use HDS `TokenField` (each `[Name]` one atomic chip), the chip row + Insert
  variable `Menu` (`insertToken`), and the #221 **Variables panel** (Fill for, then each variable, then the
  filled Preview with Copy; a
  picked job's four fields save on the job, the rest on `Document.values`, not a Version; `[Your name]`
  falls back to the kit name). `#/copy-deck/<id>` opens one; an old `#/copy-deck/<snippetId>` resolves
  to `snippet-<id>` (`outreachTemplates.resolveDocumentId`, hash rewritten); unknown → the library once
  sync has settled and the move below has run. **Snippets are legacy data** (store + blob sync kept):
  `App`'s `SnippetMigration` runs `migrateSnippetStore` after sync settles: each snippet not yet
  `migrated` becomes a Base Outreach message (`snippetMigration.ts`) and is marked `migrated` in the
  synced snippet store, so a deleted message never comes back and a second device adds nothing.
  "Restore starter messages" re-adds missing `tpl-*` (`restoreStarterOutreach`). **Every fill path reads
  `useOutreachTemplates()`** (latest Version text, values, pinned first; a moved message keeps its
  snippet id, so `tpl-followup` and the kit's picks still match): Use template, `FollowUp`, the Apply
  sheet and the kit's letters, all through `templateFill.fillSnippet`. Editor menus are
  `modal={false}` (a modal menu plus the dialog left the page unclickable). Pinned in
  `documentsRoute.test.tsx`, `documentsLibrary.test.tsx`, `outreachTemplates.test.ts`; E2E
  `e2e/documents.spec.ts`, `e2e/template-variables.spec.ts`. Final copies (#231, uploaded PDF/Word)
  live in the synced blob, capped at 500 KB per file and 1 MB per account.
- **Company page (#230):** `#/company/<slug>` (`route.companyHash` / `openCompany`) renders
  `CompanyPage` under the Pipeline tab (like Apply mode): the company's Jobs, Documents and Notes, with
  Back to Pipeline. The job page's Details Company fact links to it (only when the job has a company).
- **Guided first run + empties (#132):** `Onboarding.tsx` is three steps (pick a track, location,
  first job) with `Progress`, `FormActions`, Back and Skip on every step; nothing is written until
  Finish / the last Skip (which seeds the picked packs, saves the job, and on the first-run gate goes
  to `#/discover`). Sample data is a step 1 offer on a first run. Discover with no track shows
  `ChooseTrack` first. One empty pattern (`EmptyState`: optional icon, title, sentence, one action) in
  Discover, Documents and the Pipeline (`TrackerView`, with the Briefcase icon). The Pipeline
  gets `GettingStarted` (computed ticks in `gettingStarted.ts`, dismissed in
  `rjb_ui_getting_started_done`). Pinned in `firstRun.test.tsx`, `emptyStates.test.tsx`,
  `pipelineFollowUps.test.tsx`.
- **Pipeline rows (#129):** the shell is HDS page width (`Container maxWidth="max"`, 1200). The
  Pipeline table and Discover's tile grid use it; the job page and Documents sit at
  the 760 content measure (`var(--semantic-layout-width-content)`). `TrackerView` renders
  `JobsTable` (HDS `Table`, sortable headers through `jobRow.nextSort` → the same `SortKey` as the
  toolbar) at ≥ the HDS `lg` breakpoint and `JobListCard` (title on its own row) below it, chosen
  by HDS `useAtLeast` (no `matchMedia` → cards). Both render `jobRow.rowView` with
  `JobRowParts.tsx`: one next step per row (Mark applied / Follow up, secondary so Add job stays
  the page's one primary) + the row `Menu` (also on the job page's header, minus Remove); 40px controls on
  cards. A non-default filter or search shows a quiet Clear filters button.
  Titles link to `#/queue/<jobId>`; details, to-dos, the screener and templates live on the job
  page (tabs, #130). The filter/search/sort survive opening a job and Back (`pipelineView.ts`).
  Pinned in `src/pipeline.test.tsx`.
- **Discover (#131, `docs/specs/discover.md`):** `DiscoverHeader` = `PageHeader` (track name, Manage
  track, New track `Menu`) + the track `Combobox` + one context `Popover` button ("Spokane, Hybrid")
  holding the only `LocationControl`. **Location is `Category.location`; work mode is per track and syncs,
  `rjb_ui_mode:<categoryId>`** (`src/discoverContext.ts`, `useTrackContext`; panels read it, they take
  no location props). Tools are one `SegmentedControl` (Watched / Apply now / ATS search; the
  Watched slug is still `teams`; hidden on the secondary views Live postings and Check a list,
  where "Back to companies" is the second and last nav level, rev-3 G); the track's sections are `Tabs` under
  "Your sections", shown only for Apply now; slugs unchanged (`#/discover/<tool | groupId>`).
  `TileGrid` cards are equal-height (240px min), with chips parsed from the meta string by
  `tileMeta.parseMeta` (raw text is the fallback; no data migration), a `Details` disclosure with
  tap-to-call for every phone, and a labelled Set aside. Live postings states go through
  HDS `AsyncState` (skeleton + "still trying" at 10 s; `fetchFeed` has a 15 s per-source cap and
  `only: [keys]` for the per-source Retry, merged by `feed/mergeFeed`); Watch a company, suggested
  companies and Your evidence sit in a collapsed **Refine** disclosure under the search. Fit wording
  is `screening.verdictLabel` everywhere (Strong fit / Stretch / Reach). Pinned in
  `src/discover.test.tsx`, `TileGrid.test.tsx`, `LiveFeed*.test.tsx`.
- **Design polish (#133, `docs/specs/design-polish.md`, `docs/redesign-2026.md`):** banners are not page
  furniture: unsynced is the Account Avatar's dot (its title says "Saved on this device only"), and `SampleBanner` is a one-line note under the page header. Section heads are
  `Text variant="body"` + `className="rjb-semibold"`; `title` is the page head only. `base.css` holds the
  host resets (heading/paragraph margin 0, `.rjb-semibold`, phone tab padding, 40px phone buttons,
  reduced motion); secondary colour is `Text tone="secondary"`. Guards: inline `style={{`
  ceiling and no inline font size/weight in `hdsOnly.test.ts` (only lower the ceiling), lint is
  `--max-warnings=0`, composed contrast pairs in `theme.contrast.test.ts` (the dark pressed accent is a
  held HDS gap, hds#748; also tracked upstream: touch size hds#750), and `e2e/a11y.spec.ts` (axe on every route, light/dark, 1440/390; phone sweep for 40px
  targets, uppercase, running motion). `axe-core` is an exact-pinned devDependency (4.14.0).
- **Rapid apply (2026-10-17):** every save (Discover tiles, Live postings incl. "Save N to Pipeline"
  / "Save all shown", quick-add) raises `saveNotice.notifySaved` → "Saved to Pipeline · To apply" with
  Open + Undo (`NoticeHost` in the shell: an HDS Toast with `actions`, one at a time).
  The Pipeline opens on `ApplyQueueSummary`: **To apply (N)** + the one primary **Start applying**, and
  **Follow up (M)** with dates (`applyQueue.ts`: Saved & not set aside, pinned first then newest).
  **Apply mode** `#/apply/<jobId>` (`ApplyMode.tsx`, `route.openApply`; the Pipeline tab stays
  selected; rev-3 E): one top row "← Pipeline" + HDS `Pagination variant="compact"` ("‹ 1 of N ›",
  the applied job holds its place in the walk), badges above the title, Open application (the one
  primary), then Mark applied (follow-up 7 days on) and Not a fit (retire + Undo) as one row of two;
  no Skip or Next job. Then panels of HDS `Disclosure variant="row"` rows (preview, Copy beside it,
  blanks as chips with "N blanks left" when open; tap a blank to fill it in place, `BlankText` →
  `fillBlank`: the job's four fields save on the job, any other on the message's values, rev-3 A,
  slice 3): **Apply sheet (#239)** "Templates" lists every
  Outreach message filled for the job (`applyKit.filledTemplates` → `fillSnippet`, pinned first) with
  an Edit documents link; the **Application kit** (`applyKit.ts`, `rjb_apply_kit`, blob **v6**):
  filled profile fields as copy rows, the empty ones folded into one "Fill in N more" row, the two
  template-filled letters and Custom answers. The row menu sets any status.
  Pinned in `rapidApply.test.tsx`, `applyKit.test.ts`, `e2e/rapid-apply.spec.ts`.
- **Wide sweep (#213):** Live postings' quiet "Find more: sweep all N titles" runs one search over every
  title that is on for the track (`fetchFeed({ terms })`: term sources once per term, boards once, keys
  `hn|<term>`), merged/deduped/tagged by `feed/sweep.ts` `sweepRank` ("Matched …" on each row). Per-title
  `Tag` chips with counts hide rows with no re-fetch. The list and on/off live in `feed/sweepTitles.ts`
  (`rjb_sweep_titles`, seeded from the track's titles, max 12 on, synced in blob **v7**, dropped with its
  track), edited in `SweepTitles.tsx` behind a "Titles (N)" disclosure. Title and ATS search get an
  "All selected (N)" chip that ORs them (`jobsData.titleClause`). Saves go through `notifySaved` → To
  apply. Pinned in `wideSweep.test.tsx`, `feed/sweep*.test.ts`, `e2e/wide-sweep.spec.ts`.
- **Title filter (#223):** the sweep's list _is_ the track's title filter (seed: the track's titles, else
  its ATS roles). Live postings applies it always (`targeting.titles`: an unticked title hides a posting
  titled only by it, "N hidden by titles"; ticked titles rank first), edited in the **Calibrate**
  disclosure beside leave-out / pay / level. The Titles tool is gone: its big-board links sit on the ATS
  tool ("Big job boards"), and every link there reads the ticked titles (All selected by default).
  `#/discover/titles` → `#/discover/live` with Calibrate open (hash replaced). Pinned in `titleFilter.test.tsx`.
- **Privacy and terms (#43, #47):** `#/legal/privacy` and `#/legal/terms` (`LegalPage.tsx`, no tab,
  like Documents; Menu item "Privacy and terms", last before Sign out). The text is data in
  `legal.ts`; `THIRD_PARTIES` must list exactly the CSP `connect-src` hosts (`legal.test.ts` fails
  otherwise, so a new fetch host also goes there). Wording approved by Adrian 2026-10-20 (`LEGAL_DRAFT`
  false); set it true while a revision is under review. Back up is the full "download all my data" export: it carries every synced
  store, incl. the Application kit and sweep titles. Meta/OG/Twitter tags pinned in `meta.test.ts`.
  **Crash reports (#47):** `src/errorReport.ts` sends a scrubbed report (kind, message, stack, tab,
  browser; no user id, email, job text, URL query or job id; 5 per page load) to the insert-only
  Supabase table `client_errors` (`supabase/migrations/20261020_client_errors.sql`, 90-day pg_cron
  sweep) from `ErrorBoundary` and window error/rejection handlers. `installErrorReporting` in
  `main.tsx` skips localhost, so dev, E2E and the gallery never report. Read reports in the
  Supabase dashboard (Table editor → client_errors).
  **Installable + share image (#47):** `public/manifest.webmanifest` (name = BRAND, standalone, no
  service worker), PNG icons (192, 512, maskable 512, 180 touch icon) and the 1200x630
  `og-image.png` are rendered by `npm run icons` (`scripts/make-icons.mjs`, headless Chromium);
  re-run it after a brand change and commit the PNGs. Pinned in `pwa.test.ts`. `npm run audit` =
  `npm audit --omit=dev --audit-level=high`; run it by hand (it is not in `verify`: the Vercel build
  must not fail on a new advisory upstream).
- **Action feedback (#212):** every action answers within 300 ms: a toast, a state change with motion, or
  the item it made scrolled into view and flashed. `src/feedback.ts` (`flashRow`, `collapseRow`, `highlightNew`
  with `useHighlight`, `starClass`) drives `[data-motion=flash|collapse]` and `.rjb-pop` in `base.css` (HDS motion
  tokens only; reduced motion keeps the state and toast, drops the movement). Flash and collapse are an attribute,
  not a class (React rewrites a className it owns, e.g. a starred table row moving to the top), and on an HDS Table
  row (`display: contents`, no box) they mark its cells. Row status / Retire / Mark applied
  raise a notice with Undo; every Remove (a Pipeline job, a job's to-do or interview, an outreach target) collapses
  the row first, then a notice (`saveNotice.notifyRemoved`) offers Undo that puts it back in its place
  (`restoreTodo` / `restoreEvent` / `targets.restoreTarget`); Duplicate and Pin flash the row they land on. Pinned
  by `e2e/feedback.spec.ts` (the sweep fails if a press changes nothing visible in 300 ms; a menu closing or an
  earlier toast leaving does not count; it checks the table row's flash and collapse at 1440 and the card's at 390)
  and `src/feedback.test.ts`.
- **Posting links (Adrian 2026-10-22: anywhere a job is listed, its posting is one tap away).** A
  saved job's title opens its page in the app; `PostingLink.tsx` (`JobPostingLink` for a Job) is the
  quiet icon link to the posting right beside it (HDS icon-only Button as an `<a target=_blank>`,
  named "Open posting for <title> at <company>", tooltip "Open posting", nothing for a non-web
  URL). It sits beside the title, never inside a link: the Pipeline table and cards, the Follow up
  and Next 7 days rows, the closed-on-the-board list, Recently removed, the Company page and the job
  page header. Its target overflows the title's line (`.rjb-posting-link` in `base.css`), so rows
  keep their rhythm; 40x40 on a phone. Unsaved listings (Live postings, team and dream roles, tiles,
  Manage track's links) have no page: their title is the link out, with HDS's external icon. Apply
  mode keeps Open application; the job rail (NavList rows are links) relies on the header beside it.
  Pinned in `PostingLink.test.tsx`, the surface suites and `e2e/posting-links.spec.ts`.
- **Quick-add URL params** (handled in `App.tsx`): `?add=<url>`, `?applied=<url>`,
  `?status=<Status>&u=<url>`, optional `&t=<label>` — power the iOS shortcut /
  bookmarklet / Gmail-scan one-tap links.
- **Tracker model:** default "Active" filter = not-yet-applied (Saved) + pinned;
  applying drops a job out of the active queue. Follow-up loop: due 7 days after applying or the
  last follow-up. Every "Follow up" button (Pipeline Follow up section, Pipeline row, job header) opens the one
  `FollowUpHost` dialog (`FollowUp.tsx`, mounted in `App`; open job in `followUpFlow.ts`): the
  follow-up template filled via `templateFill.fillSnippet`, Copy message → Mark as sent (resets the clock; Undo in
  the dialog, since HDS Toast has no action slot) or Snooze 3 days (`Job.snoozeUntil`, normalized
  on read, syncs with the job). Closing changes nothing. Weak titles auto-derive from
  the URL. Board triage (pin / set-aside) lives in `tileTriage.ts` + `tileState.ts`;
  planned consolidation: saving also floats the tile (issue #13).

## Build / deploy / verify

- ⚠️ **Build budget — Vercel build minutes cost money (Adrian, 2026-10-14). Default to NO cloud
  builds.** Every push to `main` is a production build; every branch commit with `[preview]` is a
  preview build.
  - **Don't add `[preview]` by default.** Only when Adrian asks for a preview link, or when a
    change can't be judged without a deployed URL. One preview per review round, on the last
    commit of the round, never per commit.
  - **Don't merge to `main` unless Adrian says so** ("merge", "ship", "ready for merging"). Batch
    finished work into one merge instead of merging slice by slice.
  - **Verify locally instead:** `npm run verify`, `npm run test:e2e`, and `npm run gallery`
    (builds and serves `dist/` locally — no Vercel) for screenshots. Vercel is the deploy, not
    the test runner.

- **Do NOT use GitHub Actions (owner preference, 2026-07).** There is no Actions CI — the
  `.github/workflows/ci.yml` workflow was removed. **Verification is local** (`npm run typecheck`
  / `lint` / `test` / `build` + headless Chromium) **plus the Vercel deploy**. Never add or rely on
  an Actions workflow; don't treat Actions checks as a merge gate.
- `npm install`, `npm run dev`, `npm run build`, `npm run typecheck`.
- **Deploy gate (#95):** `vercel.json`'s `buildCommand` is `npm run verify` (typecheck → lint →
  vitest → build), so a red check fails the Vercel build and the previous deploy stays live.
  **`main` is the live production site** — run `npm run verify` before pushing. Branch pushes only
  build a preview when the commit message contains `[preview]`. E2E in cloud sessions:
  `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e`.
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
  There is **no remote default** (remote roles draw ~5× the applicants); one `LocationControl`
  (`src/LocationControl.tsx`, in the Discover header's popover) drives the Title, ATS and Live postings panels.
- **Screening pipeline on jobs (#60).** Additive `Job` fields — `verdict` (match/stretch/reach),
  `mode`, `blockers[]`, `angle`, `screenedAt` — normalized on read in
  `src/screening.ts` (which also strips the retired `travelPct` / `applicants` from old records).
  Edited via `ScreeningEditor`; shown as card badges; new "Best fit" sort.
- **Rules-based JD screener (#61).** `src/jdScreener.ts` + `JdScreenPanel` (inline in a job's Screening tab) — paste a JD → suggested
  mode/blockers/verdict from deterministic keyword rules, one-click apply.
- **Board↔Queue interop (#57).** Saved tiles leave the board (`partitionTiles`); enriched save
  carries a tile's meta into the job; a save toast; "Find more like this" seeds Discover.
- **Implementation Consulting** built-in pillar; simplified Trades board nav; top-level
  **error boundary** (#46).
- **Supabase provisioned (#31).** `tracker` + `categories`/`groups`/`tiles` tables now exist with
  RLS (the DB had been empty — cloud sync never had a backing table until now).
- **#30 IA/curation chain COMPLETE (B1→B5), live on `main`.** Discover now reads the per-account
  **curation store** (`useCategories`/`useGroups`/`useTiles`), not hardcoded pillars — a `Category`
  _is_ a track. Shipped via per-area PRs: **#75 B1** (wire Discover→curationStore + first-run
  `Onboarding` picking starter packs, D1) · **#76 B2/B3** (strip hardcoded content, retire the Trades
  tab, tabs → Discover/Tracker/Templates, slugs kept for back-compat) · **#78 B4** (in-app curation
  controls — `ManageTrackDialog` creates/edits/deletes tracks + sections + links; D2 pin/set-aside
  triage on Discover tiles) · **#79 B5** (teaching `EmptyState`s across Discover; retired the
  now-consumerless `Divider` primitive; #38 layout cleanup). The starter-pack list
  (`src/curation/starterPacks.ts`) is deliberately trivial to edit (v1 provisional).
- **Done (#99, 2026-10-13):** `pillarStore` + `pillars.ts` are retired — sync is blob v4 (jobs,
  snippets, set-aside tiles); curation syncs through its own tables. ⚠️ GitHub Actions CI is non-functional org-wide AND disabled by owner
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
  for browser storage; an LRU capped at `CACHE_BUDGET_CHARS` ≈ 16 MB, and liveness reads pass
  `{ fresh: true }` to skip it), `toJob.ts` (Posting → saved Job fields), `watchlist.ts`, `html.ts`, `format.ts`.
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
- **Job sources slice (2026-10-15, `docs/specs/job-sources.md`).**
  - **No board cap.** `fetchFeed` reads every distinct watched board, 6 at a time (`BOARD_CONCURRENCY`),
    and calls `onProgress` as each answers; the panel repaints every 250ms with "Read N of M boards".
  - **More sources.** HN also reads the monthly "Freelancer? Seeking freelancer?" thread (only
    SEEKING FREELANCER posts, marked contract). Jobicy and Remote OK sit behind `SOURCE_ENABLED` in
    `fetchFeed.ts` (Jobicy on; Remote OK off until its live legal notice is read and checked), and Workable and Recruitee are watchable boards. All four are
    **unverified live** (built from documented shapes); turn one off there if its first deployed check
    is blocked. Remote OK attribution is a hard rule (their link as given, "Remote OK" on the row).
    Himalayas is skipped (its OpenAPI could not be read). Every new host goes in `vercel.json` and
    `FEED_HOSTS` in `csp.test.ts`.
  - **More boards (#216).** SmartRecruiters (`api.smartrecruiters.com`), Teamtailor (`*.teamtailor.com/jobs.json`)
    and Personio (`*.jobs.personio.de/search.json`) are board kinds the probe tries too, all **unverified live**.
    SmartRecruiters answers an empty list for any name, so the probe reads empty there as none
    (`EMPTY_MEANS_NONE`). `slugCandidates` gives up to 4 slugs (folds accents, `&` → and, drops a
    leading "The" and a trailing Labs/Software-like word in its bare forms).
  - **Targeting** (`feed/targeting.ts`): leave-out terms, level from the title only, a pay floor
    (only where a source states pay), each with a "hidden by" count. **Saved searches**
    (`feed/savedFilters.ts`, `rjb_feed_filters`, per track, synced in the blob).
  - **Liveness** (`feed/liveness.ts`, `livenessStore.ts`, `LivenessViews.tsx`): re-reads a saved
    Saved/Applied board job's board (once per board), flags "Closed on the board", never changes
    status, never marks closed on a failure. Cache in `rjb_liveness`, not synced. Shown above the
    Pipeline and the job page from `App.tsx`.
  - **Per-track boards.** `radar/directory.ts` is `DIRECTORY_BY_PACK`; `seedPack` files a pack's
    boards into the track's `Watched companies` group (one `addTiles` bulk write, sent as upserts of
    `TILE_CHUNK` = 50 rows; a refused chunk leaves only its rows journalled as failed), and Live postings offers "Add suggested
    companies (N)" to an existing track whose label matches a pack (`packIdForLabel`). Live postings
    no longer reads a global list.
  - **By company was cut (2026-10-17):** Live postings is one Openings list; an old `?view=companies`
    link is ignored and shows Openings.
- **Hidden-job discovery (2026-10-15, `docs/specs/discovery-methods.md`).** Discover tools **Boards** and
  **Teams** (`#/discover/boards`, `#/discover/teams`). `feed/probe.ts` asks Greenhouse / Lever / Ashby /
  Workable / Recruitee for a company's board (200 + job list = live, 404 = none, anything else =
  **unknown, never none**; 6 in flight, 2 per host, 150 ms gap, 3×429 stops a host, cache `rjb_probe`);
  `discoverBoards.ts` + `FindBoardsPanel` take a pasted list (500 max) or a YC batch (`yc.ts`, community
  mirror) and offer Watch. `dsOrgs.ts` + `githubBudget.ts` find design-system orgs via keyless GitHub
  search (3 pages, 30 org lookups per run, 8 searches/min and 40 core/hour in `rjb_gh_budget`, stops with
  "wait until" on 403/429); results are outreach targets (`targets.ts`, `rjb_targets`, per track, synced in the blob,
  shown in the Teams tool). YC and GitHub sit behind `DISCOVERY_SOURCE_ENABLED`
  (`feed/discoverySources.ts`) and are **unverified live**, as are the new community-board `site:` clauses
  in `jobsData.ts`. Big-company ATSs (Workday, SuccessFactors, Taleo, Oracle) are Google links only: never
  fetch them. New hosts `yc-oss.github.io` and `api.github.com` are in `connect-src` and `csp.test.ts`.
- **Company type-ahead (rev-3 L).** Check a list of companies is a chip input (HDS creatable `Combobox`)
  fed by `feed/companySuggest.ts`: your own companies (watched boards, saved jobs, dreams, targets), the YC
  mirror's `companies/hiring.json` (read once; no other directory, Adrian 2026-10-21: no new third party),
  250 ms debounce, 5 s timeout, failure isolation,
  in-memory cache; Enter adds the typed name as is. Paste a list / Load a YC batch stay as secondaries; a
  company with no board is a row with "Keep as a target" (a dream company). The YC source is
  **unverified live**. Pinned in `findBoards.test.tsx`, `feed/companySuggest.test.ts`.
- **Companies as one tool (#237, Calm list 3/7).** The Teams tool (slug `teams`, label kept) is the
  companies list, `CompaniesPanel.tsx` (was `OutreachTargets.tsx`): one list of company rows (watched
  board tiles + GitHub teams, one row per board) with matching roles inline (first 3, then "Show N
  more"); the first 10 watched boards are read on arrival, the rest on "Check open roles at N
  companies". **Add a company** (`AddCompany.tsx`, a Dialog) is the one way on: a board link is watched
  at once, a name goes through `discoverBoards` (watch what it finds, or star it if there is no board).
  Dream companies + "Check dream companies" sit on top. It leads `#/discover` when it has a team search,
  a watched or a dream company; else Apply now leads. **Live postings and Find boards are not tools**:
  `#/discover/live` and `#/discover/boards` open them as secondary views (Teams selected, "Back to
  companies"), linked under "More ways to find companies". Pinned in `src/companies.test.tsx`.
- **Teams tool (2026-10-17).** The Discover tool is labelled **Teams** (slug `teams`; not "Companies",
  which is the top tab since the Calm list shell). Its GitHub
  search follows the track: `feed/teamTopics.ts` `teamSearchFor` maps the track's titles/ATS roles to
  topics (design systems → `design-system`, ServiceNow → `servicenow`); where it finds one, Teams
  leads and `#/discover` opens it (`#/discover/apply` is Apply now), else Apply now leads, Teams
  sits second and says there is no search for this track (PR #217 review). Open roles first: each
  team's board is read live (`feed/teamRoles.ts` `readRoles`, the probe's limiter, any failure =
  "Couldn't check") and filtered by the track's terms (`matchRoles` over `match.rankPostings`); a
  **Hiring now** Toggle (on by default) hides teams known to have no matching role (`orderTeams`).
  `dsOrgs` marks `boardCheck: 'unknown' | 'unchecked'` so unknown is never none. Roles save inline
  (`TeamRoles.tsx` `RoleList`, through `saveNotice.notifySaved`: Open + Undo). **Dream
  companies** (`feed/dreams.ts`, `rjb_dreams`, per track, **blob v9**, ADR 0008 addendum; v8 is left for #214) are starred
  from team rows (`DreamStar`), always show on top (`DreamCompanies.tsx`), and "Check
  dream companies" re-reads boards fresh and flags openings new since the last check. Pinned in
  `src/outreach.test.tsx`, `discover.test.tsx`, `feed/teamRoles.test.ts`, `feed/dreams.test.ts`.
- **Company source follows the track (#215).** `feed/companySource.ts` `companySourceFor`: GitHub where
  `teamSearchFor` finds a topic in the titles/ATS roles; a physical discipline in those or in the track's label
  ("Mechanical engineering", "Civil", "Skilled Trades") makes a bare "Design engineer" a CAD title, so no
  design-system search; otherwise **Suggest companies** lists the track's starter-pack
  boards not yet watched (`packIdForLabel` → `boardsForPack`) then YC companies hiring now (`hiring.json`)
  whose one-liner/tags match its titles/ATS roles as phrases (max 15, probed for a board). One caption line
  names the source; never design-system orgs on a non-design track; no new hosts. Pinned in
  `feed/companySource.test.ts` and `outreach.test.tsx` ("a non-design track").
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
