# CLAUDE.md — Roleflame (formerly hiraga, Stoke, RoleForge, Apply Board)

Project memory for future Claude Code sessions in this repo.

## What this is

**Roleflame** (renamed 2026-11-02, Adrian, hirobius/ops#1092 / #55; before that **hiraga**, lowercase, 2026-10-30, Adrian: hire + Firaga, and *hi* 火 is Japanese for fire; formerly Stoke, RoleForge, Apply Board) — a job-application tracker + discovery board, live at
**https://roleflame.vercel.app** (since 2026-11-05; repo `hirobius/job-hunt`; the old
`roleforge-app.vercel.app` and `job-hunt-jade.vercel.app` still serve and are accepted sign-in origins until they redirect). Rebuilt from a
single static `index.html` into a React app (the old file is in git history at
commit `f15fd52`).

**Product name = `src/brand.ts` only (#55).** Header wordmark, `<title>`/meta (index.html
`%BRAND_*%` placeholders via the `brand-html` Vite plugin), toasts and download filenames read it;
`src/brand.test.ts` fails on a hard-coded name. Stored identifiers stay fixed on purpose: the backup
format id `app: 'apply-board'` and calendar UIDs `@apply-board`.

**Flame logo: one source, `src/brand/flame.svg`; motion: Adrian's Version E (2026-10-29).**
`src/brand/flameEngine.ts` is the Visuals Lab's "family" engine ported as given (squash / stretch / pinch
keyframes, 3 layers, embers), `FLAME_E` = his locked settings (endless, 10 fps; tune only there).
`npm run icons` writes its still frame (loop frame 0, no embers, HDS primitive fills, classes
`flame-1|2|3`) to `src/brand/flame.svg`, then favicon.svg, PNG icons, favicon.ico, og-image from it;
`flameEngine.test.ts` fails when flame.svg is not the engine's still frame. Everything static derives
from flame.svg: the wordmark in the header and on sign-in (`src/brand/Flame.tsx` inlines it, ids made
unique per instance) and the icons. `src/brand/flame.test.tsx` fails on any other `.svg`, any copy of its
path data, a stale `public/favicon.svg`, or non-HDS fills.
**Motion:** `flameMotion.ts` `animateFlame(svg, letters)` rewrites the three paths' `d` every 1/fps (the
box never changes) and flickers each wordmark letter (skew ≤ 2.5°, fade ≤ 5%, transform/opacity only);
the header/sign-in `Wordmark` and `Flame` reach it only through `startFlame.ts` (a lazy chunk, `entryChunk.test.ts`: the
entry is at its 250 kB budget; the still frame shows until it lands);
it animates continuously (Adrian 2026-10-30: never settles);
still under prefers-reduced-motion (also when turned on mid-run), paused while the tab is hidden, off
where matchMedia is missing (jsdom). The header/sign-in `Wordmark` and `BootHold` (`<Flame animate />`)
animate. **Boot splash:** `%BRAND_FLAME%` in index.html's `#root` is the engine's 8-frame loop baked in
by `brandHtml.ts` (one `.rjb-boot-f` group per frame, frames 1-7 `visibility="hidden"`), stepped by
base.css (`rjb-boot-frame`, delays and loop length inline from FLAME_E.fps); reduced motion / no CSS
shows frame 0. The splash still fades in after a short beat. The old rise-in reveal is gone.
**Wordmark: the flame, then the name, "Roleflame" (Adrian 2026-10-30, name 2026-11-02; was St(flame)ke):** `src/brand/Wordmark.tsx` (header, an `role="img"` named by BRAND, never a heading, #363;
sign-in) and the og-image share one markup builder, `wordmarkMarkup.ts` (`BRAND.wordmark = { flame: 'before' }`):
`.rjb-wordmark-flame` then `.rjb-wordmark-text` (`{ letters: true }` in the app wraps each letter in
`.rjb-wordmark-l` for the flicker; the og-image keeps a plain run). `wordmark.css` sets them on one baseline, the
flame `1.35cap` tall with its extra height taken back by a negative top margin, so the line is plain text's height
and the name's run is plain text's width (`e2e/brand.spec.ts` checks within 1px while the letters flicker); named
by `aria-label`, its parts aria-hidden. **BootHold:** App's main, only while a signed-in device with no data waits for its cloud
copy, max 4 s.

## Stack & conventions

- **Vite + React 19 + TypeScript + HDS (`@hirobius/design-system`) — and nothing else for UI
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
  npm** (exact-pinned `0.32.0`; `hdsOnly.test.ts` enforces the exact pin) — see `docs/adr/0005` and `docs/adr/0007`.
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
  **Lazy loading (quick wins, 2026-10-22):** supabase-js is a dynamic import (`src/supabase.ts`
  `loadSupabase()`; boot loads it only with a stored session or a magic-link return, else on
  sign-in) and stays out of every manualChunks group (a named group pulls tslib in and vendor then
  imports it). Never import `@supabase/supabase-js` statically (`supabaseLazy.test.tsx`); tests
  that sign in call `loadSupabase()` first. The Pipeline, job page, Apply mode and Company page are
  `routeViews.ts` lazy views (`lazyView.tsx`); `test/setup.ts` preloads them. Follow up, Add interview, Recently removed and the job page's liveness note load on first use too (`lazyHosts.tsx`, `lazyDialogs.ts`, #368 pass); the stores read only `feed/sources/boardUrl.ts` / `feed/term.ts` / `boardSet` `BOARD_KINDS`, never ats.ts, match.ts or the probe (`entryChunk.test.ts`). What's left at startup is mostly HDS (motion, tailwind-merge, styles.css): upstream asks in `docs/hds-upstream-asks-0.9.md` "Startup cost asks". App wraps the bar in
  `header` and every page in one `main`; each route sets `document.title` (`pageTitle.ts`).
- **State:** a shared external store via `useSyncExternalStore` in `src/store.ts`
  (no Redux). Jobs persist to `localStorage` key **`rjb_shortlist`** and sync to
  **Supabase** (table `tracker`, one JSON blob per user; keys in `src/config.ts`,
  publishable + RLS-protected). **Blob v11 (ADR 0008 + addenda)** adds must include per track (`rjb_must_include`) on top of v10's Documents (`src/documents.ts`, `rjb_documents`, #226: Versions,
  one locked Sent per kind per Job, dropped by Delete forever) on top of v9's dream companies (`rjb_dreams`) on top of
  v8's Recently removed (`src/trash.ts`, `rjb_trash`, 30 days; also in backups), v7's wide-sweep titles and
  v6's Application kit; v5 carries jobs, snippets, set-aside tiles **and the
  user-edited per-browser stores: outreach targets (`rjb_targets`), saved searches (`rjb_feed_filters`),
  the evidence text (`rjb_radar_evidence`), work mode per track (`rjb_ui_mode:<id>`, `src/trackModes.ts`),
  the Application kit (v6), sweep titles (v7, #220), the trash (v8, #214) and dream companies
  (`rjb_dreams`, v9)**
  — rule: whatever the user manipulates is persistent; each store has `getAll*/replace*/merge*/use*`.
  Caches and device UI prefs (`rjb_liveness`, `rjb_probe`, `rjb_found_teams:<trackId>` (the old Companies' found list, `feed/foundTeams.ts`; dropped with its track), `rjb_gh_*`, `rjb_feed_remotive`, `rjb_ui_*`, pins)
  stay local. Deletes stay deleted across devices: the seed merge runs on every load and is three-way against the device-local `rjb_sync_base` (`src/syncBase.ts`, #219). Sign-out flushes the blob first (confirms if the push fails); evidence is capped at 20,000
  chars; per-track data is dropped when its track is deleted (`src/trackData.ts`; no sweep after sync, orphans are harmless). Cloud sync lives in `src/account/` (see the account seam below). Per-account curated
  content (the old tracks and their tile boards) lives separately in normalized RLS tables
  `categories`/`groups`/`tiles` — the curation data layer, `src/curation/`: no UI since #389, still synced and
  read by the v12 move; the tables are not dropped yet (ADR 0009).
- **Blob v12 (simplify 4/9; read by the whole app since #388, ADR 0009):** three synced stores on top of v11, each `getAll/replace/merge/use`:
  `src/profile.ts` (`rjb_profiles`, `profiles[]` with one entry: titles + on/off, ATS roles, must include,
  leave out, pay floor, level, location, mode, `scorer`; `useProfile`), `src/sources.ts` (`rjb_sources`:
  `{ kind, ref, label, star?, muted? }`, boards of all 8 kinds, `company`, `github`, `yc`, `feed`; key
  `kind:ref` ignoring case; `useSources`, `addSources`, `followBoard`, `starCompany`, `starSource`, `muteSource`;
  `removeSource` only undoes a fresh add, any other removal is a mute, since the move tops up from v11) and `src/decided.ts` (`rjb_decided`, by posting fingerprint only, never by
  company; `decided.get/has/set/undo/use`). All three are in the sync base (deletes stick), backups and the
  merge guard. **The v11 move** (`src/v12Migration.ts`, run by `V12Migration` in App after sync settles, a
  lazy chunk) reads **design-systems tracks only** (scored by `scorerFor`, or the Design Systems pack's label via
  `packIdForLabel`; 2026-10-29): the profile once (scored track, else the busiest; titles from every DS track, its
  own first; no DS track = no profile, and `ensureProfile` gives the default); Sources = the union across DS tracks
  of watched board tiles (archived ones muted), dreams (starred) and targets, plus every saved job's board and the
  keyless feeds; links offered are DS tracks' only; the evidence becomes a Note either way; Sources are topped up add-only on every run (an older
  client can still write v11), never switching back a star or mute the person changed, and writing nothing
  when nothing is new. Titles come in on only where v11 searched them (a live track's first 12 on), once:
  since #389 titles are not topped up, so one removed in the Search profile stays removed. A track with no
  mode moves as remote only; a profile moved earlier with 'any' from an unset mode gets it once (`fromTrack`
  goes with the fix; the Search profile form drops it too, so the person's choice sticks). A
  Replace from a pre-v12 backup (`before12`) keeps this device's profile, Sources and decisions. Non-board tiles are offered once as a links .txt; evidence becomes a Note. v11
  fields are never changed and still read. Pinned in `v12Migration.test.ts` (rich v11 fixture: nothing
  lost), `v12Stores.test.ts`, `v12MigrationNotice.test.tsx`.
- **Structure (since simplify #383/#389):** `src/App.tsx` is the shell with two top tabs, **Today**
  (`Today.tsx`, home) and **Jobs** (`TrackerView.tsx`, slug `queue`, page head "Pipeline"), plus
  tab-less pages (Documents, legal, a job, Apply mode, a Company). `types.ts` holds the Job model.
  The old Trades / Discover / Companies screens are deleted (ADR 0009); their slugs redirect to Today.
- **Design-systems only (Adrian 2026-10-29):** content is design systems and nothing else. The one starter pack
  is Design Systems (`curation/starterPacks.ts` `STARTER_PACKS`; `radar/directory.ts` `DIRECTORY_BY_PACK` /
  `TARGETS_BY_PACK` keyed `designsystems` only; `jobsData.GROUPS` = `ds-brief`, `ds-watch`); the sample jobs are
  design-systems roles. The trades / Spokane / apprenticeship content, the Implementation Consulting, ServiceNow and
  Skilled Trades packs, `curation/localize.ts` (Spokane link rewriting), the `'sam'` source and the non-design
  `companySource` / `teamTopics` branches are deleted. Older accounts' other tracks stay stored (curation tables, v11
  stores, sync, Back up, CSV) but never surface: the v12 move reads design-systems tracks only. Guard:
  `src/dsOnly.test.ts` (pack ids, directory keys, curated groups, no `sam` source, and a scan of app source for
  Spokane / welding / sheet metal / apprenticeship / ServiceNow / SAM.gov with a commented allow-list).
- **Shell (#115 Phase 1; rev-3 mobile slice 1):** slim header = the body-size wordmark at every width (never a heading: `role="img"` named by
  BRAND, #363; so the page title is always the biggest text) · **each page's own name is its one `h1`, inside `main`** (#363:
  Pipeline, Today, the job title, Documents, a Company, Legal; panel heads are `h2`, card titles `h3`; `focusRescue`
  focuses the page's h1; `e2e/a11y.spec.ts` keyboard walk fails on an h1 outside main) · top tabs (**Today · Jobs**; they scroll on a phone; HDS TabsList fades the hidden edge) · the
  **Account** button: an HDS `Avatar` (initial signed in, person icon signed out; named "Account"; no unsynced dot, Adrian 2026-10-22; it holds account, data, display and feedback). Page gutter: `PageShell`'s `clamp(1.25rem, 5vw, 4rem)` (20 on a phone, 64 from 1280; see Shell width below). `src/account/` is the account
  seam: `CloudSyncProvider` + `DataToolsProvider` own sync / backup / restore / CSV and expose
  `useCloudSync` / `useDataTools` (`accountContext.ts`); `AccountMenu` holds sign-in/out, Documents, Search profile, Companies, Back up,
  Restore…, Export CSV, theme and feedback; there is no sync banner and no Avatar dot (the menu's sync line says it);
  `SignInDialog` is the magic-link form. Errors are HDS **Toasts** (`ToastProvider` in `main.tsx`;
  tests wrap App in one); `src/hds-gaps/toastAnnouncer.ts` (#365) mutes Radix's assertive announcer and says each toast
  itself: politely (errors assertively), "Title. Description". Shell behaviour is pinned at the route seam in `src/shell.test.tsx`, incl. the Account menu order
  (signed out: device-only line, Sign in | data | display; signed in: "Signed in as <email>" + sync
  line as non-item labels | data | display | Sign out, Delete my data last in the danger colour;
  data = Documents, Search profile, Companies, Back up, Restore…, Export CSV). Pillars and tracks are gone from the UI (ADR 0009).
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
  over **one page, no tabs since #416** (see Simplify Jobs below; the rest of this paragraph is
  the older three-tab layout, kept for history): Overview (`JobOverview`: `PipelinePanel` panels — Details, the
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
  have their own Pipeline filter. The open tab is in the URL (`?section=screening|interviews`,
  Overview left out, written in place), so coming back to a job opens the tab it was on. At ≥ `lg`
  an HDS `Sidebar` puts `JobRail` (links with HDS `NavList` link rows, badges above the title; a
  rail hop replaces the entry) beside the job; below it the job is alone with a Back link (at `lg`
  too when the job was opened from somewhere other than the Pipeline).
  The Pipeline's filter/search/sort live in `pipelineView.ts` (in memory, shared by `TrackerView`
  and the rail; `test/setup.ts` resets it per test). An unknown id shows a skeleton, then waits for
  `useCloudSync().settled` before falling back to `#/queue`. Pinned in `src/jobPage.test.tsx`. `HOME_ROUTE` (`discover`) and
  `QUICK_ADD_LANDING` (`queue`) are separate in `App.tsx`. Pinned in `src/jobRoute.test.tsx`.
- **Return paths (Adrian 2026-10-22: "whenever someone navigates away with a key action, they
  should be able to get back"):** one route-level mechanism. A page opened by a jump carries its
  origin in the hash (`?from=<origin hash path>`, `route.withOrigin` / `linkTo`; left out when the
  origin is the page's default way back, `route.defaultBack`; one level of the origin's own origin
  kept; a job → its Company → the same job doesn't nest). The page's Back is `BackLink` (`back.ts`
  `useBack`): it names the origin (`routeLabel.ts`: "← Senior UX Designer", "← Apply mode (2 of
  3)", "← Today") and calls `route.goBackTo`, which pops to that page when it is an earlier
  entry of this tab (a trail kept in `history.state.rjb`, matched by `pageKey`) and replaces
  otherwise, so the browser's Back never bounces. `goBackTo` is **single-flight**: until its pop
  lands (popstate, then the hashchange), further `goBackTo`/`navigate` calls wait, and one that
  finds itself on its target page does nothing, so a double click, or a Remove/Delete plus the
  page's unknown-id fallback (StrictMode runs it twice in dev), goes back once. An editor's Save
  that goes back ignores a second click. Finishing the key action returns there: a Save
  in an editor opened from a job page or Apply mode (`DocumentsView` `returnTarget`, toast "Back to
  …"), Remove from a job page (Undo reopens it), Retire of a job closed on the board, Undo on Not
  a fit. Never global state: back/forward and reload keep it. **Scroll** (`scrollMemory.ts`, set
  up in `main.tsx`): browser restoration is off; each page's position (by hash, sessionStorage)
  comes back on a revisit (Back/Forward), an in-app Back, a top tab or a reload, once the page is
  tall enough, or as far as it goes once its height has held for 150 ms (a row left the list on
  the way: Mark applied, Remove), and is held while rows load above it or the browser's scroll
  anchoring moves it; a new top-level page opens at its top; pages that scroll to top on open use
  `scrollToTop()`. Lists whose rows reorder as their boards answer opt out of scroll
  anchoring (`overflow-anchor: none`). **Focus** (`focusRescue.ts`, set up in `main.tsx`) is never dropped to `<body>`: a page change focuses the new page's main heading (tabindex -1, no ring), coming back focuses the control that left it (#359), a row that leaves a list hands focus to what took its place (pinned in `e2e/a11y-flows.spec.ts`). **Top tabs** (`tabMemory.ts`) reopen where they
  were left (`openTab`), except a job page or Apply mode whose
  job is no longer saved, which reopens the list; the open tab tapped again goes to its root. Start applying resumes at the last Apply job ("Resume applying (2 of 3)"). The Apply pager,
  Not a fit's next job and rail hops move in place (replace). **Sheets** (`useBackCloses.ts`):
  every dialog, menu and popover pushes a same-URL entry, so Back closes it and stays on the page
  (`useBackCloses` with its open state, or `useBackSheet` for one with none; `backCloses.test.ts`
  fails on a sheet root that is not wired). The entry stacks open sheets (a confirm over a dialog):
  Back closes the top one, closing one on screen pops it and any over it, a push waits for
  a pop in flight (Sign in picked from the Account menu), a sheet gone while open pops its entry,
  and a navigation or Back from a menu item drops the sheets' entries first. Use template reopens
  on its message when its Edit message / Write a message editor comes back. **View memory** (`viewMemory.ts` `useRemembered`, in memory per page load, written at once so a row unmounting in the same commit keeps its value): coming back restores what was being done, not only the page. Apply mode's open rows and a half-typed kit field / custom answer (open + draft); Review new (Browse | Deck, sort, filters, pages shown, the open preview, and the read rows, so Back shows them with no new read). A magic link
  returns to the page the sign-in was asked from (`account/signInReturn.ts`). Pinned in
  `src/route.test.ts`, `src/returnPaths.test.tsx`, `scrollMemory.test.ts`, `tabMemory.test.ts`,
  `routeLabel.test.ts`; E2E `e2e/return-paths.spec.ts` (390 and 1440, with the browser's Back).
- **Final shell (simplify #383 + amendment 2, Q6; PR from `claude/simplify-shell`):** exactly **two top tabs,
  Today · Jobs** (Jobs = the Pipeline, slug `queue`, unchanged inside; its page head and Backs still say Pipeline).
  **No Companies tab:** `route.ts` `redirectOf` sends `#/discover/*` and `#/apprenticeships` to `#/today` (the
  snapshot reads them as Today, the URL is rewritten in place with no history step, `navigate` / `goBackTo` never
  write one); never redirect anywhere else. The old Discover screens are deleted (#389, ADR 0009). An empty hash
  and a sign-in error land on Today; there is no setup screen (see First run).
  `Today.tsx`, top to bottom: `ScanStatus` (Scan now + "Last scanned hh:mm · N new from M sources"; N and M are the
  Feed's own `newToday` / `sourcesRead` once Review new has read, so the page shows one number), **Review new**
  = `ReviewView` itself (`label="Review new" scanStatus`: it hosts the status; one panel holding sources that didn't
  answer as one quiet "N sources unavailable · details" disclosure, Browse | Deck, Sort as a menu, two filter chips
  (New today, Remote) and the Browse list; a row's title opens the in-app preview, Open posting beside it), **Apply**
  (`toApplyQueue`, Start / Resume applying → Apply mode, `?from=/today`), **Follow up** (`today.ts`: the due rows with
  "Due <day>" and their own Follow up button, "Upcoming: N this week" = due in the next 7 days, else "Nothing due
  today" / "Nothing waiting on a reply") and **New companies** (`NewCompanies`, Follow / Ignore). Followed and Ignored
  companies are the Account menu's **Companies** item (`CompaniesDialog.tsx`, lazy; `companiesList.ts` reads the
  Feed's Sources: followed = boards + companies, A to Z, once by name; ignored = the muted Sources; one list at a
  time, Ignore = `muteCompany`, Follow again = `unmuteCompany`, plus `followCompany` for one with no Source). Merges #426
  (Jobs keep list, one-page job page, no fit badge); "Find more like this" left the job menu with the ATS search. Pinned in `today.test.ts`, `todayHome.test.tsx`,
  `companiesList.test.tsx`, `route.test.ts`, `e2e/today.spec.ts`, `e2e/review.spec.ts`, `e2e/auto-scan.spec.ts`.
- **Calm list shell (PR #208) and "Today is gone" (#236)** are history: the final shell above brought Today
  back as home and removed Companies.
- **Pipeline panels (rev-3 mobile slice 1, `docs/staging/all-states.html` on `claude/staging-states`):**
  To apply, Follow up, Next 7 days and Jobs are `PipelinePanel` (HDS `Card`, header +
  `Badge count`), 24 apart. The Jobs panel holds the full-width search, Status and Sort as select-style
  menus and a quiet **Clear filters** when non-default; phone rows are HDS entity cards (`Card.Header`
  metadata = badge row above the title, fit first, then status, then Follow-up due, then the closing date; `Card.Facts` with
  location and the job's one date (#419); `Card.Footer` next step + bordered ⋯ menu). Rhythm is HDS Stack gaps, no
  margins. **No cards within cards, ever (Adrian 2026-11-01, #449; replaced 2026-10-23's "lists are cards"):**
  one card level max. A list inside a panel (New companies, the Account menu's Companies
  list, the Pipeline's phone jobs, the Apply sheet's Templates, the Application kit, Documents, the interview log,
  the job page's links) is `PipelinePanel` `ItemList` (`.rjb-items`, a hairline between rows) of `ItemRow` (a plain
  row, never an HDS `Card`); `JobListCard` is an `article` row with Card's Header/Facts/Footer parts, no Card root.
  **Review new's panel has no surface of its own** (`Panel flat`): its heading, count and metadata declare the group,
  and its content lines up with the page gutter. So each Browse row and the Deck posting is one standalone soft HDS
  `Card` (never `bordered`; the preview dialog shows the same body) in the reference anatomy (#458, Adrian 2026-11-02: `PostingCard`,
  source + New badges, the title on the `title` step, company, MapPin / Briefcase / Calendar facts, the mode only
  when the place line doesn't say it, pay left and Save right in the footer, Skip / Not this company under it);
  `calmLayout.test.tsx` fails on any Card inside a Card.
  Pinned in `src/calmLayout.test.tsx`.
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
  falls back to the kit name). `#/copy-deck/<id>` opens one and `#/copy-deck/new/<kind>` is a New
  editor (its first Save replaces the entry with the new id); an old `#/copy-deck/<snippetId>` resolves
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
  live in the synced blob, capped at 500 KB per file and 1 MB per account. Removing an unsent one has no
  confirm: it collapses and Undo re-adds it (`documents.restoreDocument`, the file with it).
- **Decks per job (#287):** the job page ends with a **Decks** panel (`JobLinks.tsx` since #416, pure helpers
  in `decks.ts`): deck links (Google Slides, Figma, Pitch…) with an optional label (an older Sent on day stays in
  storage, no longer edited); Add, Remove soft with Undo. Only http(s) (`httpUrl`; `sanitizeDecks` in `sanitizeJobs` drops the rest from
  storage, cloud and backups). `Job.decks` rides in the synced blob (no version bump: an additive Job field), Back
  up and the CSV's `decks` column; Recently removed merges them back by id. **Links only:** uploads need a Supabase
  Storage bucket (Adrian). Pinned in `decks.test.ts` and `jobPage.test.tsx`.
- **Simplify Jobs (#416, Adrian 2026-10-28; spec `docs/specs/simplify.html` on `claude/rf-simplify-spec`):**
  the Jobs page (`TrackerView`) is To apply + Start applying, Follow up, Next 7 days and the Jobs list
  (search, Status incl. Closing soon / Closed from #423, Sort) and nothing else: `GettingStarted`,
  `ScoredQueue` and Find the next company are deleted (`gettingStarted.ts` too, in #390; an old
  `rjb_ui_getting_started_done` key is ignored). **Recently removed** is an Account menu item ("Recently removed (N)", only when the trash
  has some; `RecentlyRemovedHost` in `DataToolsProvider`, open state in `jobDialogs.ts`); **Export links** is
  Account menu only. The **job page is one page** (`JobPage` → `JobHeader` + `JobOverview`): Details, Notes,
  then **Documents** (`Job.docLinks`, additive, same shape and `sanitizeDecks` rule as `decks`, CSV `doc_links`
  appended last, Back up, Recently removed merge) and **Decks**, both `JobLinks.tsx` `LinksPanel` (a label and
  an http(s) link, Add, Remove with Undo). To-dos, Screening (Fit, JD screener), the Interviews log, Use
  template and the per-job document library are off the page; **their data (`todos`, screening fields,
  `events`, documents) is never deleted** and stays in storage, sync, Back up and the CSV. An old
  `?section=` link opens the one page. **Add interview…** is one item in every job's ⋯ menu (`RowMenu`, now
  `modal={false}` so its dialog opens cleanly) and an Interviewing job's header primary: one
  `AddInterviewHost` dialog (App) writes `events`, which feed Next 7 days. Each card shows one date (Posted,
  else Found) plus the closing-date badge (#423). Pinned in `simplifyJobs.test.tsx`.
- **Company page (#230):** `#/company/<slug>` (`route.companyHash` / `openCompany`) renders
  `CompanyPage` under the Pipeline tab (like Apply mode): the company's Jobs, Documents and Notes, with
  Back to Pipeline. The job page's Details Company fact links to it (only when the job has a company).
  An unknown slug shows a skeleton until `useCloudSync().settled`, then "No company here" (#303).
  Each Documents row links to its editor via `linkTo` (Back says "← <Company>"; an uploaded final copy is
  text only, #304). Notes are "Note 2 of 3" when several, each with a soft Remove + Undo; a notes-only
  company's last note goes back from the page and Undo reopens it (#305).
- **First run: no setup screen (Adrian 2026-10-29; was the Search profile form, #388):** after sync settles, App's
  `V12Migration` runs the v11 move, then `searchDefaults.ts` `ensureProfile`: with no profile it calls `finishSetup`
  with `NEW_PROFILE` (the design-systems titles, remote only, the broad ATS terms, include "design system", scorer
  `design-systems`) and follows the starter design-system companies (`seedSources()`) as Sources. Today opens on
  Review new (a skeleton holds its place until the profile lands) and `AutoScanOnOpen` mounts once a profile exists,
  so the scan runs with no click. Signed in, `PageHold` shows the flame until the cloud copy lands, so nobody's own
  profile is overwritten. The Account menu's **Search profile** (`SearchProfileDialog.tsx`, lazy; fields in
  `ProfileFields.tsx`) is the only place to edit it. Sample data is the Jobs page's empty-state offer, jobs only (no
  Sample track; an older one is still dropped on sign-in). One empty pattern (`EmptyState`) in Documents and the
  Pipeline. Pinned in `firstRun.test.tsx`, `todayHome.test.tsx`, `pipelineFollowUps.test.tsx`, `entryChunk.test.ts`.
- **Shell width (Adrian 2026-10-22, the portfolio's):** `src/hds-gaps/PageShell` = HDS `Container`
  at 1048 in all (Adrian 2026-10-24, was 1180) with a `clamp(1.25rem, 5vw, 4rem)` gutter (20 on a phone, 64 from 1280), so content
  is at most 920; header, tabs and every page share it. **No outlines on surfaces (HDS 0.31 soft
  surfaces):** Cards and panels are borderless (raised fill + spacing); never pass `bordered`.
  Inputs, focus, selected/current, overlays, row dividers and feedback tones keep theirs.
  `e2e/no-outlines.spec.ts` fails on a Card or container box that draws an edge.
- **Pipeline rows (#129):** the Pipeline uses the shell width; the job page and Documents sit at
- **Discover (#131), Live postings, Calibrate, wide sweep (#213), title filter (#223), Contracts / SAM.gov (#275),
  Find boards, Check a list, Teams, Add a company, dream company rows, the tile board and Manage track** were deleted
  in #389 (ADR 0009). Their stores stay readable (sync, Back up, CSV) and feed the v12 move; the pure helpers the
  auto-scan uses (probe, identity check, YC / GitHub / Adele leads, `companySource`, `teamRoles`) stay.
  `feed/liveList.ts` stays as the breadth guard's baseline. `/api/sam` is gone; `SAM_GOV_API_KEY` can go from Vercel.
- **Design polish (#133, `docs/specs/design-polish.md`, `docs/redesign-2026.md`):** banners are not page
  furniture: unsynced is only the Account menu's sync line (no Avatar dot), and `SampleBanner` is a one-line note under the page header. Section heads are
  `Text variant="body"` + `className="rjb-semibold"`; `title` is the page head only. `base.css` holds the
  host resets (heading/paragraph margin 0, `.rjb-semibold`, phone tab padding, 40px phone buttons,
  reduced motion); secondary colour is `Text tone="secondary"`. Guards: inline `style={{`
  ceiling and no inline font size/weight in `hdsOnly.test.ts` (only lower the ceiling), lint is
  `--max-warnings=0`, composed contrast pairs in `theme.contrast.test.ts` (all at 4.5 since the 0.32.0 audit; tracked
  upstream: touch size hds#750), and `e2e/a11y.spec.ts` (axe on every route, light/dark, 1440/390; phone sweep for 40px
  targets, uppercase, running motion). `axe-core` is an exact-pinned devDependency (4.14.0).
- **Rapid apply (2026-10-17):** every save (Review new, the Find box, quick-add) raises `saveNotice.notifySaved` → "Saved to Pipeline · To apply" with
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
- **Feed + Review new (simplify 5/9, #386):** Review new is on Today (`ReviewView`). `feed/feed.ts` is the Feed:
  `buildFeed(read, profile, sources, …)` lists **every design-system posting, newest first, no fit tiers** (Adrian
  2026-10-28): every posting read that passes the work mode (no term gate; the profile's mode, **remote** by default:
  on-site/hybrid out, a posting that does not say stays and reads "Location not stated"), then the plain inclusion check
  (`profile.designSystemRule`: the design-system phrase on the title, or a related title that is on; `targeting.phrases`
  keeps the scorer out) and the profile filters; minus saved jobs, Skips (by posting fingerprint, `tracks/score.ts`
  `fingerprint`) and muted companies; the rest are counted ("N not design-system roles"). Reads go through the
  `PostingReader` seam (`feed/reader.ts`; `browserReader` = `fetchFeed` sweeping every profile title); `useFeed` keeps
  the rows up while a changed request reads, and a source or title added since reads only what was added
  (`mergeReads`), so a new company's jobs show at once. **Inputs (#388): the synced Search profile and Sources**
  (`useFeedInputs` → `feed/profile.ts` `searchProfileOf` / `feedSourcesOf`: titles on + ATS roles on + related titles;
  every board and followed company + the keyless feeds). `feed/decided.ts` is the Feed's view of the synced stores:
  Skips are `src/decided.ts` (`decided[]`), muted / followed companies are Sources (`muteCompany` returns its Undo);
  it used to keep its own object under the same `rjb_decided` key, which a pull dropped, so `moveLegacyDecided`
  (`main.tsx`, before sync) moves an old one over once. `rjb_feed_seen` (first-seen days, "N new today") stays local.
  A row's title opens an in-app preview (`PostingPreview`, Back closes it) with Open posting beside the title and in
  the preview. Save = `notifySaved` + `follow.ts` (a board posting follows its board as a Source, else the company by
  name; Undo takes both back). **Breadth guard** (`feed/breadth.test.ts` on `breadth.fixture.ts`): the deleted Live
  postings' list (`feed/liveList.ts`, kept as the baseline) at its widest; the Feed must list every design-system
  posting it lists, and every one the recorded answers hold; it fails otherwise. Pinned in `feed/feed.test.ts`, `review.test.tsx`, `e2e/review.spec.ts`.
- **Remote Rocketship (2026-10-22):** a "Big job boards" link (`BOARDS`, tag "Remote only",
  `modes: ['remote','any']`, shown through `boardsFor(mode)`): `https://www.remoterocketship.com/?sort=DateAdded&jobTitle=<first ticked title>`.
  Link only: no API (its paid one needs a personal key; a later bring-your-own-key slice), no fetch, so CSP and
  `legal.ts` are unchanged. The query form is **unverified live** (the host was unreachable from the build container).
- **Must include / systems-only (Adrian 2026-10-23):** `feed/mustInclude.ts` holds the phrase rules every
  inclusion check uses (`termRegex`, `passesInclude`: whole words, "systems" ↔ "design system", never "ecosystem";
  **phrases break at separators**: a spaced hyphen, en/em dash, `, | / : ; & · •`; a hyphen inside a word joins).
  **A design system rule reads the title only** (`hasRelatedTitles`), so Design Engineers never come in through a
  description; **related titles** = Design Technologist only (`related` absent = on, `relatedOff` ids). The per-track
  store (`rjb_must_include`, blob **v11**, incl. `atsOff` and a Contracts track's stored `naics`, `cleanNaics`) stays
  readable and feeds the v12 move; its editors (Calibrate, Manage track) are gone. `App`'s `SystemsOnlyMigration`
  still runs `migrateSystemsOnly` on old pack tracks. Pinned in `feed/mustInclude.test.ts`, `feed/systemsOnly.test.ts`,
  `systemsOnlyNotice.test.tsx`.
- **Track scorer (Muse handoff, 2026-10-24):** `src/tracks/` is pure and shared by the app and the sync edge
  function: `score.ts` + `track-config.ts` are ported as given; tune only through the config. `scoreForTrack` = scorer
  then `fitRejectReason` (no interns); a profile with `scorer: 'design-systems'` (onboarding sets it) or a must include
  asking for "design system(s)" (`forTrack.scorerFor`) uses it. The Feed sorts by it ("Best match"), never hides by it.
  **Server (Simplify 6/9, #387):** `sync-postings` reads each user's Sources and Search profile from their `tracker`
  blob (`tracks/plan.ts` `planFromBlob`: v12 `sources[]` + `profiles[0]`, else v11 dreams, targets, saved jobs'
  boards and the Watched tiles via the `watched_tile_urls()` RPC, + `verified.ts` for a DS user); `compileProfile`
  gives the DS config when the profile asks for design systems, else one from its titles. Boards of every kind and
  HN/Remotive/Jobicy are read with the app's own parsers (`src/feed/sources/*` and their imports use explicit `.ts`
  specifiers so Deno and Node load them; `inferMode` lives in `feed/mode.ts`). No `watched_companies` or `skips`
  table: the blob is the one source of truth, and the sync never writes it. Migrations `2026102410*`: postings,
  sync_log, `mark_missed_postings`, `watched_tile_urls`, the cron. Auth is `SYNC_SECRET` only. The Feed's
  **PostingReader** seam (`feed/postingReader.ts`): `serverReader` reads the rows, `mergePostings` keeps every browser
  posting and adds the server's, so signed in is never fewer. Not applied or deployed: see its README.
  `npm run sync:dry-run` plans from a sample blob, reads + scores with no database. Pinned in `src/tracks/*.test.ts`,
  `feed/postingReader.test.ts`.
- **Server searches (claude/src-top5, `docs/research/ds-job-sources.md`):** `src/tracks/feeds/` holds sources only
  `sync-postings` reads (pure, injected fetch, `.ts` specifiers): `dsjobsCatalog.ts` (designsystems.jobs' sitemap + each
  job page's JSON-LD; stored as `rss`, source id = page URL like the RSS guid; known rows reused, ≤ 40 new pages a run,
  1/s, known rows from the `known_dsjobs_postings()` RPC; partial reads never close) and four windowed searches in
  `serverFeeds.ts`, never counted as answered (rows age out 30 days after last seen): TheirStack
  (`THEIRSTACK_API_KEY`, due 10 days a month × 18 rows), Adzuna (`ADZUNA_APP_ID`/`ADZUNA_APP_KEY`, rows say "Jobs by
  Adzuna"), Jooble (`JOOBLE_API_KEY`, in the URL: never logged) and Into Design Systems (MCP, waits on its operator's
  yes). **Gates live in `serverFeeds.ts` `SERVER_FEED_GATES` (claude/src-free-aggs), not `SOURCE_ENABLED`:** a keyed
  one runs as soon as any of its secrets is set (one of two missing → `MissingKeyError` names it in `sync_log`, the run
  goes on); the function's answer lists `serverFeedsOff` with the secret each needs. Plus three **keyless** remote boards
  read whole and kept only when remote + design-systems (`dsRole.ts`): Arbeitnow (link back to Arbeitnow), Remote OK
  (its API `legal` notice is checked on every read; a change stops the read, loud) and We Work Remotely (Design +
  Front-End RSS); a muted Remote OK Source mutes it. All unverified live. Himalayas and Working Nomads stay off (terms
  unread). Design systems plans only. Browser never contacts them (no CSP change); legal.ts lists them with `hosts: []`.
  Migrations `20261029100000` and `20261029100200` widen the `postings.source` check.
- **Auto-scan (simplify 8/11, #415; stacked on the Feed, #414):** `feed/autoScan.ts` runs all discovery with no
  buttons. On app open (`AutoScanOnOpen`, a lazy chunk in `App`, after sync settles; on only when `main.tsx` calls
  `setScanOnOpen(true)`, so unit tests never scan) at most every 6 h, or on **Scan now**: leads (YC hiring now →
  GitHub DS orgs → Adele → `SEED_LEADS`, empty until the seed list lands) → the probe (≤ 40 new leads a run, the
  rest queued; its limiter and cache) → the **identity check** (`feed/identity.ts`, #417: one ATS only, and the
  website's domain must match the slug or name; else unconfirmed, shown but never read) → the Feed's
  `PostingReader` over followed + confirmed found boards and every feed (Remotive / GitHub budgets hold) → the
  inclusion check (the profile's must include, else "design system") and **remote only** (Adrian 2026-10-28:
  `remoteOnly`: remote keeps, on-site/hybrid drops, no mode and no city keeps with `remoteUnstated`, "Remote not
  stated"). Kept per browser: `rjb_autoscan` (last run, lead queue, probed, found companies) and
  `rjb_autoscan_postings` (≤ 300, bodies cut to 1500). A run cut short resumes on the next open. Review new reads
  through `scanReader` (live read + the scan's postings, remote only, never an ignored company's). UI in
  `AutoScanViews.tsx`: `ScanStatus` ("Last scanned hh:mm · N new from M sources", Scan now / Stop scan) and
  `NewCompanies` (Follow → the board joins the Sources, Ignore → `muteCompany`, each with Undo), both on Today. With
  no Search profile yet the scan searches the design-system titles (`searchDefaults.ts`). Pinned in `feed/autoScan.test.ts`, `feed/identity.test.ts`, `autoScanViews.test.tsx`,
  `review.test.tsx`; E2E `e2e/auto-scan.spec.ts` (a fresh profile gets postings with zero clicks).
- **Adele seed (2026-10-23):** `src/feed/data/adele.json` is a one-time snapshot of UXPin's public design systems
  list (github.com/uxpin/adele, **MIT**; company name + design system site; re-take it by hand from `ADELE.file`).
  No runtime host. The auto-scan takes its names as leads (`adeleNames`); its old "Add companies with public design
  systems" row went with Companies (#389). The MIT notice rides in the JSON (`licenseText`). Pinned in
  `feed/adele.test.ts`.
- **Design-system company seed (2026-10-28):** `src/feed/seed/` (pure, injected fetch): `parse.ts` reads Adele
  (MIT), awesome-design-systems (Unlicense), designsystems.jobs (sitemap slugs + RSS names), HN Who is hiring posts
  naming a design system (Algolia) and GitHub `topic:design-system` orgs (keyless; **unverified live**, the build
  proxy refuses GitHub search); `resolve.ts` probes each company (`probe.ts` limiter, every probe kind, 3 slugs) and
  confirms the board is theirs (`linked` by the source, its `domain` in the payload, a designsystems.jobs `title`,
  or its own `name`; a description saying "At <Name>" confirms only a `distinctName`: ≥ 7 letters and not in
  `COMMON_WORDS`, so Close, Promise or Ledger never do); `run.ts` builds the snapshot. `npm run seed:companies` (`scripts/seed-companies.mjs`, vite
  `runnerImport`, ~1 h) writes `src/feed/data/ds-companies.json` (company, website, board, evidence, licence) and
  `ds-seed-boards.json` (confirmed boards with at most `MAX_SEED_JOBS` = 300 roles: every watched board is read on
  each search, Greenhouse with descriptions, so Anduril's 2,500 would bust the 16 MB feed cache on a phone). `radar/directory.ts` appends those to the design systems pack, which
  onboarding follows as Sources (#388). Not used:
  component.gallery (private Airtable, no licence), designsystemsrepo / Design Systems for Figma (no licence).
  Pinned in `src/feed/seed/*.test.ts`, `radar/directory.test.ts`.
- **Bulk board set + scan rotation (#src-bulk, 2026-10-29):** `npm run boards:discover`
  (`scripts/discover-boards.mjs`, `src/feed/bulk/`) harvests public board links (HN comments via Algolia,
  GitHub job lists, job-board-aggregator's MIT slug lists, Common Crawl's index (unreachable from the build
  container), the DS seed), probes each with the probe's limiter, and writes `src/feed/data/boards.json`
  (kind, slug, company, website, jobs, lastChecked, evidence; read only through `src/feed/boardSet.ts`) plus
  `board-keys.json` (keys only; Today's lazy chunk, the size budget's 70 kB). Probe answers cache in
  `node_modules/.cache/boards-discover.json`; `--cached-only` / `--reuse-harvest` rebuild without asking
  again. The server's `sync-postings` `{rotate:true}` (1-minute cron) walks the set in a hashed order
  (`src/tracks/rotation.ts`: cursor, 40 s time box, 3 per host, 429 backoff + carry list, 404 retry list
  then disabled; migration `20261029100100_scan_rotation.sql`), storing only remote queue/review postings for
  design systems profiles. Today reads "Scanning N sources · Last scanned hh:mm, K new"
  (`feed/scanningCount.ts`): the browser's boards + feeds, plus the board set only when signed in with a
  design systems profile. Pinned in `src/feed/bulk/*.test.ts`, `boardSet.test.ts`, `scanningCount.test.ts`,
  `tracks/rotation.test.ts`, `autoScanViews.test.tsx`. **Live check (2026-10-30, claude/live-fixtures):** a 25-board `--rotate --read` batch all
  answered; recorded Greenhouse/Lever/Ashby answers in `src/tracks/fixtures/` back `rotationDryRun.test.ts` and
  `npm run sync:dry-run -- --rotate --fixtures` (offline). Arbeitnow, Remote OK and WWR hosts were refused by the build
  network, so those stay unverified live.
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
  Supabase dashboard (Table editor → client_errors). The only door is the `report_client_error` RPC,
  limited per client (a salted hash of the gateway's IP header, never stored with a report, swept
  after 2 days) under global ceilings (`20261030100000`). **DB caps (#320):** curation tables have
  length checks, per-user row ceilings and same-user composite FKs (`20261030100100`); all pinned by
  text in `src/supabaseHardening.test.ts`.
  **Installable + share image (#47):** `public/manifest.webmanifest` (name = BRAND, standalone, no
  service worker), PNG icons (192, 512, maskable 512, 180 touch icon) and the 1200x630
  `og-image.png` are rendered by `npm run icons` (`scripts/make-icons.mjs`, headless Chromium);
  re-run it after a brand change and commit the PNGs; it also writes `/favicon.ico`. The manifest's
  install screenshots come from `npm run screenshots` (`scripts/make-screenshots.mjs`, the sample
  Pipeline at 1280x800 and 390x844). theme-color follows HDS surface-page per scheme; the body font
  is preloaded by the `preload-font` plugin (`fontPreload.ts`). Pinned in `pwa.test.ts`, `meta.test.ts`. `npm run audit` =
  `npm audit --omit=dev --audit-level=high`; run it by hand (it is not in `verify`: the Vercel build
  must not fail on a new advisory upstream).
- **Action feedback (#212):** every action answers within 300 ms: a toast, a state change with motion, or
  the item it made scrolled into view and flashed. `src/feedback.ts` (`flashRow`, `collapseRow`, `highlightNew`
  with `useHighlight`, `starClass`) drives `[data-motion=flash|collapse]` and `.rjb-pop` in `base.css` (HDS motion
  tokens only; reduced motion keeps the state and toast, drops the movement). Flash and collapse are an attribute,
  not a class (React rewrites a className it owns, e.g. a starred table row moving to the top), and on an HDS Table
  row (`display: contents`, no box) they mark its cells. Row status / Retire / Mark applied
  raise a notice with Undo; **Remove is soft everywhere**: every Remove (a Pipeline job, a job's to-do or interview,
  a final copy, a company note, a Base document (Documents' row and editor Delete, #329, `documentRemove.ts`)) collapses the row first, then a notice
  (`saveNotice.notifyRemoved`) offers Undo that puts it back in its place (`restoreTodo` / `restoreEvent` /
  `documents.restoreDocument`). Review new's Skip and Not this company say so with Undo too. Inside a modal dialog the notice is
  `inDialog`: the dialog's footer shows it (`NoticeHost.DialogNotice`, reachable by keyboard and screen reader,
  which the toast behind a modal is not), and it moves to the toast when the dialog closes (`noticeToToast`).
  ATS search's Copy the query toasts "Copied the query"; Duplicate and Pin flash the row they land on. Pinned
  by `e2e/feedback.spec.ts` (timed on the production build, `PROD_URL` = the e2e config's second webServer on :4173, never the dev server, whose StrictMode double renders flaked it under load; the sweep fails if a press changes nothing visible in 300 ms; a menu closing or an
  earlier toast leaving does not count; it checks the card's flash and collapse at 1440 and 390)
  and `src/feedback.test.ts`.
- **Posting links (Adrian 2026-10-22: anywhere a job is listed, its posting is one tap away).** A
  saved job's title opens its page in the app; `PostingLink.tsx` (`JobPostingLink` for a Job) is the
  quiet icon link to the posting right beside it (HDS icon-only Button as an `<a target=_blank>`,
  named "Open posting for <title> at <company>", tooltip "Open posting", nothing for a non-web
  URL). It sits beside the title, never inside a link: the Pipeline table and cards, the Follow up
  and Next 7 days rows, the closed-on-the-board list, Recently removed, the Company page, the job
  page header (all through `PostingTitle` / `JobPostingTitle`: the title shrinks and wraps anywhere,
  so a long unbroken title never runs under the link or pushes it off screen) and every job rail row
  (beside the row's link, `hds-gaps/NavListActionItem`: NavList.Item has no trailing slot). Its
  target overflows the title's line (`.rjb-posting-link` in `base.css`), so rows keep their rhythm,
  and is stacked above the text there, so all of it takes the tap; 40x40 on a phone. Rows only a line
  tall that each end in one (`.rjb-posting-rows`) grow to the target instead, so targets never
  overlap. Unsaved listings (Review new's rows) have no page: their title is the link out, with HDS's external icon. Apply mode keeps Open application.
  Pinned in `PostingLink.test.tsx`, the surface suites and `e2e/posting-links.spec.ts` (hit-tests
  every target: each pixel takes the tap, no overlap with another control; long titles at 390).
- **Company logos (2026-10-22):** `CompanyLogo.tsx` is an HDS `Avatar` per company (the To apply stack, Pipeline table and cards, job header, job rail, Company page, Companies and dream rows): letter first, the logo only once `new Image()` has loaded it at 16px or more (lazy, no referrer; errors and DuckDuckGo's tiny placeholder keep the letter). `companyLogo.ts` is the one table-tested rule for the domain (company website first, then the posting's host; never a job board, ATS or aggregator host, `*.example.com`, localhost, IPs). Icons come from `icons.duckduckgo.com` (`img-src`, `legal.ts` THIRD_PARTIES, `csp.test.ts`); e2e specs abort that host, so baselines show letters.
- **Export links (2026-10-22):** one `ExportLinksHost` dialog (mounted in `DataToolsProvider`, open
  scope in `exportLinks.ts`) opened from the Account menu only (after Export CSV; #416 took it off the Jobs
  panel) on **All saved jobs**; its **This view** scope is the Jobs list as filtered (`visibleJobs`). Format Links only / With title and company; read-only
  Preview; Copy (`copyFilled`, falls back to selecting the text) and Download .txt
  (`linksFilename`: `<slug>-links-YYYY-MM-DD.txt`). `buildLinkList` skips non-web links (counted),
  dedupes, keeps order. Pinned in `exportLinks.test.ts`, `exportLinksDialog.test.tsx`,
  `e2e/export-links.spec.ts`.
- **Clean first run (Adrian 2026-10-22):** a new user sees nothing they didn't create. Placeholders are
  the field's own name ("Job title", "Job link", "Company"), never an "e.g." or a made-up name
  (`placeholders.test.ts` scans the source). Empty sections hide (Dream companies, the Pipeline's
  panels). The snippet store starts **empty** (`copyDeckStore` no longer falls back to the starters), so
  no starter messages are migrated in on a first run or a new device; `AddStarterMessages`
  (`StarterMessages.tsx` → `addStarters.ts` → `restoreStarterOutreach`) adds them in one tap from
  Documents' empty state ("No documents yet": Add starter messages | Start from scratch), the
  follow-up dialog (an empty message box until then), the Apply sheet and the kit's letters. Sample
  data stays opt-in and adds no messages. The Search profile form prefills only the design-system titles
  (onboarding, #388) and adds nothing else the user did not finish. Documents'
  empty state and Add starter messages wait for `settled` and the snippet move (a new device's messages arrive first). Pinned in `firstRun`, `emptyStates`, `documentsLibrary`,
  `pipelineFollowUps`, `rapidApply`, `copyDeckStore`, `syncBlob` tests; e2e seeds call `addStarters`.
- **Job dates (#419, `src/jobDates.ts`):** additive Job fields `postedAt` (the source's), `discoveredAt` (when this
  page load's feed first read it: `stampSeen` in `feed/sources/http.ts`), `savedAt` (stamped on save; `sanitizeJobs`
  backfills it from a Saved history entry, else blank) and `closedAt` (stamped by `runLivenessCheck` →
  `recordBoardChecks` when a posting is gone from its board, every board kind; cleared when it is back). Sanitize,
  Back up (`JOB_KEY_LIST`) and CSV (four appended columns) carry them; no blob bump. **One date per job (Adrian
  2026-10-28):** `dateLabel` = "Posted 3d ago", else "Found 3d ago"; saved/found are stored, not shown. The closing
  date is the job's `deadline` (sources: Greenhouse `application_deadline`, read live; Teamtailor `end-date`,
  unverified; or the job page's "Applications close" date input, saved on blur), shown as a badge by `closingOf`:
  "Closes Nov 3" (warning within today + 6 days, while Saved), "Closed" (gone from the board while Saved/Applied, or
  past its day while Saved). Pipeline filters **Closing soon** and **Closed** (group "Closing date"; the old "Closed"
  group is "Ended"). Saved jobs closing in the window are in Next 7 days ("Applications close · …"), no longer in Follow
  up; the calendar and Apply mode say "Apply by". Pinned in `jobDates.test.ts`, `jobDatesUi.test.tsx`,
  `pipelineView.test.ts`, `pipelineFollowUps.test.tsx`, `jobPage.test.tsx`, `feed/liveness.test.ts`.
- **Quick-add URL params** (handled in `App.tsx`): `?add=<url>`, `?applied=<url>`,
  `?status=<Status>&u=<url>`, optional `&t=<label>` — power the iOS shortcut /
  bookmarklet / Gmail-scan one-tap links. The URL is cleaned through the route seam
  (`navigate(…, true, { search })`), never a raw `history.replaceState`: route.ts must know the
  hash it is on, or a sheet's pop waits ~2 s for a hashchange that never comes (`shell.test.tsx`).
  Never rewrite the URL outside `route.ts`.
- **Login injection guard (security audit, 2026-10-22):** supabase-js never reads the URL
  (`flowType: 'implicit'`, `detectSessionInUrl: false`). `src/authFragment.ts` (main.tsx's first
  import) takes `#access_token=…` and strips it with `replaceState` before the router, analytics or a
  crash report can see it (`errorReport` also scrubs `*_token=`). `account/authLink.ts`: a link signs
  in on its own only when this browser asked for one to the same email within 1 hour
  (`rjb_signin_request`, written by `sendLink`); any other link shows "Sign in as x@y.com?" (Cancel
  drops it). Then the merge guard: an account this device has no `rjb_sync_base` for, while the
  device holds data (`account/deviceData.ts`), asks "Add this device's N jobs to x@y.com?" before any
  pull or push; Don't add (the default, also Escape/Back) signs out locally and keeps the data.
  Nothing pulls or pushes for a user until that path has run for them (`handled` ref in
  `CloudSyncProvider`); a `TOKEN_REFRESHED`/`USER_UPDATED` skips it only for that same user (an expired
  crafted link arrives as a refresh), and a link's session for another email than it named is never
  taken up (no pull before the sign-out). The device-data count includes work modes and sweep titles.
  Tests sign in with `addDeviceDataIfAsked()` (`test/renderAccount.tsx`). Pinned in
  `account/authLink.test.tsx`. **Other tabs (#288):** `src/tabAccount.ts` holds the account this
  tab took through that path; when another tab signs out or in as someone else (Supabase's auth
  broadcast, the `sb-…-auth-token` storage event, or a send that finds the shared session naming
  someone else), the tab freezes: no pull/push/track write, a "Reload to continue" toast + menu
  line, and after a switch its `rjb_` writes are dropped (a sign-out keeps them: the wiped sync
  base makes the next sign-in ask; any sign-in heard while stopped, the same account too, drops them from then on, and Sign out / Delete my data re-check the session after their confirms, so they never end another tab's account). Same-user refreshes change nothing. Pinned in
  `account/tabSwitch.test.tsx`. **Forward guard (#382):** a pull that reads a blob `v` above `BLOB_VERSION`
  freezes the tab the same way (`'newerVersion'`: nothing adopted or pushed, storage guarded, "Reload to
  continue"); Sign out and Delete my data still work there (`liftNewerVersionFreeze`). Pinned in
  `account/forwardGuard.test.tsx`. Outside links only become an href when http(s) (`src/httpUrl.ts`:
  feed sources, YC websites, tiles; `sanitizeJobs` drops `javascript:`/`data:` jobs), pinned in
  `unsafeUrls.test.tsx`.
- **Continue with Google (#482):** the sign-in screen's first control (`SignInDialog.tsx`, HDS secondary `Button`
  with `iconLeft={<GoogleMark />}`; `src/account/google-g.svg` is Google's G as given, its own four colours per
  Google's branding rules, the one allowed third-party svg in `brand/flame.test.tsx` `THIRD_PARTY_MARKS`).
  `useCloudSync().signInWithGoogle` → `signInWithOAuth({ provider: 'google', redirectTo: magicLinkRedirect, queryParams:
  { code_challenge, code_challenge_method: 's256' } })`: **PKCE bound to this browser** (`account/oauthPkce.ts`; review
  of #483: an unbound "started Google" note let a crafted token link sign in after an abandoned start). The verifier
  stays in `rjb_oauth_request` (10 min, taken once); the return's `?code=` is taken and stripped by `authFragment.ts`
  and swapped at `/auth/v1/token?grant_type=pkce` with that verifier, then `acceptLink` with the email the token names.
  A code with no verifier here is never sent. The shared client stays implicit (magic links on another device), and
  tokens in a hash always take the magic-link guard, Google or not. An existing
  account with the same verified email gets the Google identity (Supabase automatic linking), so the same user id
  and sync base: no merge ask. A cancelled/refused return carries `error=` in the QUERY (PKCE; a magic link's is in the
  hash): App toasts "Google sign-in was cancelled." / "…didn't work" and drops the params through the route seam.
  `oauthPkce.ts` is a lazy chunk (the entry is at its budget). Dashboard setup (Google
  Cloud OAuth client, Supabase provider, redirect allow-list) is Adrian's. Pinned in `googleSignIn.test.tsx`,
  `SignInDialog.test.tsx`, `authLinkError.test.ts`, `shell.test.tsx`.
- **Sign-in link errors:** a magic link that is expired or refused lands with `#error=…`;
  `account/authLinkError.ts` words it ("That sign-in link has expired. Send a new one from
  Account.") and App toasts it and replaces the hash with Companies through the route seam.
- **Stale tab after a deploy** (`staleBuild.ts`, `chunkError.ts`, `StaleBuildNotice.tsx`): every
  dynamic import goes through `importFresh` (App's `lazy`, `routeViews.ts`, `lazyDialogs.ts`,
  `loadSupabase`), plus Vite's `vite:preloadError`. A chunk that is gone raises one toast "A new
  version is ready. Reload to continue." with Reload; `ErrorBoundary` shows the same line instead of
  "Something broke"; Sign in says it inline. Reload notes the time in sessionStorage
  (`rjb_stale_reload`), and `errorReport` drops chunk errors unless one comes within 2 min of that
  reload (the reload didn't fix it). Pinned in `staleBuild.test.tsx`. A new lazy import uses
  `importFresh` too.
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
- **Deploy gate (#95; moved off Vercel 2026-10-24):** `vercel.json`'s `buildCommand` is `npm run build`
  (Adrian: ~3 min → ~30-60 s per deploy). Vercel no longer runs the checks, so **`npm run verify`
  (typecheck → lint → vitest → build) must pass locally before every push to `main`**; `main` is the
  live production site. `deployGate.test.ts` pins both halves. Branch pushes only
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

## Figma agent rules

`docs/figma/FIGMA-RULES.md` is the visual subset of this file, pasted into the Figma agent's prompt
(and mirrored on a Rules page in the HDS Figma file). When a visual rule here changes (HDS version or
density, cards, outlines, type, the screens and their names), change that page in the same PR;
`src/figmaRules.test.ts` fails when the rules it pins leave this file.

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

- Supabase redirect URLs must include any new origin for magic-link sign-in. During the move
  `https://roleflame.vercel.app/` (Site URL) and the old `https://roleforge-app.vercel.app/` and `https://job-hunt-jade.vercel.app/`
  must be in Supabase Auth → URL Configuration → Redirect URLs; the client side is
  `src/account/authRedirect.ts` (`PRODUCTION_ORIGIN`, `LEGACY_ORIGINS`).
- Keep personal contact info OUT of this public repo (letters/snippets ship with a
  "add your name + contact" placeholder).
- **AI is fully removed (2026-07).** The résumé-tailor went first (`TailorDialog`/`tailor-core.ts`/
  `api/tailor.ts`); then **"Add with AI" too (#54)** — `src/ai/` and `api/extract.ts` are gone,
  `@anthropic-ai/sdk` is dropped, and there is no Anthropic key / server AI endpoint anymore. The
  JD screener (#61) is **rules-based, client-side** — no AI. `docs/adr/0002` + `README`/`FEATURES`
  still describe the old AI design as historical context.

## 2026-07 — screening pipeline (history)

_The 2026-07 pillar / track / Discover model (ADR 0006) was replaced by one Search profile and one Sources list
(ADR 0009), and its trades / consulting content by design systems only (2026-10-29)._ What still stands from it:

- **Screening pipeline on jobs (#60).** Additive `Job` fields — `verdict` (match/stretch/reach),
  `mode`, `blockers[]`, `angle`, `screenedAt` — normalized on read in
  `src/screening.ts` (which also strips the retired `travelPct` / `applicants` from old records).
- **Rules-based JD screener (#61).** `src/jdScreener.ts`: deterministic keyword rules, no AI.
- **Supabase (#31).** `tracker` + `categories`/`groups`/`tiles` tables with RLS. `pillarStore` + `pillars.ts`
  are retired (#99); curation syncs through its own tables. ⚠️ GitHub Actions CI is disabled by owner
  preference (`.github/workflows/ci.yml` removed); merges rely on local verify + Vercel.

## 2026-10 — the feed data layer (`src/feed/`; its Live postings screen went in #389)

Real openings pulled from public, keyless, CORS-open APIs, then phrase-matched. Nothing is stored as a Job until
the user saves one (`addJobDetailed`). The Feed (Review new) and the auto-scan read through it.

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
- **Watched tiles** (v11): a track's board tiles are still read into the v12 Sources by the move; new follows are
  Sources (#388).
- Key-backed aggregators (Adzuna, TheirStack) would need a serverless function for the secret —
  deliberately not built yet.
- **Job sources slice (2026-10-15, `docs/specs/job-sources.md`).**
  - **No board cap.** `fetchFeed` reads every distinct watched board, 6 at a time (`BOARD_CONCURRENCY`),
    and calls `onProgress` as each answers; Review new repaints every 250ms with "Read N of M boards".
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
    (only where a source states pay), each with a "hidden by" count; the Feed applies the profile's.
    **Saved searches** (`feed/savedFilters.ts`, `rjb_feed_filters`) are v11 data, still synced, with no UI.
  - **Liveness** (`feed/liveness.ts`, `livenessStore.ts`, `LivenessViews.tsx`): re-reads a saved
    Saved/Applied board job's board (once per board), flags "Closed on the board", never changes
    status, never marks closed on a failure. Cache in `rjb_liveness`, not synced. Shown above the
    Pipeline and the job page from `App.tsx`.
  - **Starter boards.** `radar/directory.ts` is `DIRECTORY_BY_PACK`; onboarding follows the design-systems
    list as Sources (`searchDefaults.seedSources`). `seedPack` / `topUpFromPack` (no app caller now) file the
    pack's boards as tiles (`addTiles`, upserts of `TILE_CHUNK` = 50 rows).
  - **Board feeds via `/api/boards` (2026-10-28, `docs/specs/job-sources.md`):** RSS/JSON boards with no CORS
    (designsystems.jobs on; We Work Remotely, Working Nomads, Himalayas, Authentic Jobs off pending terms or a
    live read) go through the same-origin edge function `api/boards.ts` → `feed/sources/boardsHandler.ts`: fixed
    upstream URLs per `src`, 1 h shared cache, parsed by `feed/sources/<board>.ts`, re-checked in
    `feed/sources/proxied.ts` and matched downstream like a watched board (read once per search). CSP and `legal.ts` unchanged (browser only reaches 'self'). Under `vite dev`/`preview` (E2E, gallery) the `local-api-boards` plugin in `vite.config.ts` answers it with no postings. A new board: adapter
    - one line each in `PROXIED_SOURCES` (`proxiedIds.ts`), `BOARD_ADAPTERS`, `FeedSourceId`/`SOURCE_LABEL` and `SOURCE_ENABLED`.
- **Board identity + five more boards (#src-ats, 2026-10-28).** A board found from a _name_ must show
  it is the company's (`feed/boardIdentity.ts`): the company's website domain on its apply links /
  website / job text (YC, Adele, GitHub org sites; github.io-style hosts are no evidence), else the
  name the board states (Dice ≥ 0.9). A lone board that says nothing either way is kept; the rest are
  **unconfirmed** (`DiscoverResult.unconfirmed`, with why), listed with "Watch anyway", never
  auto-watched. Pasted board URLs skip the check. Evidence rides in `rjb_probe` (`e`); an older live
  entry without it is asked again. BambooHR, Rippling, Gem, Pinpoint and Breezy HR are board kinds
  (`sources/atsExtra.ts`, **unverified live**, CORS too; why JazzHR, Comeet, Freshteam, Workday aren't is
  in its header). Pinned in `feed/boardIdentity.test.ts`, `probe.test.ts`, `sources/atsExtra.test.ts`.
- **Hidden-job discovery helpers (2026-10-15, `docs/specs/discovery-methods.md`; their screens went in #389).**
  `feed/probe.ts` asks each board kind for a company's board (200 + job list = live, 404 = none, anything else =
  **unknown, never none**; 6 in flight, 2 per host, 150 ms gap, 3×429 stops a host, cache `rjb_probe`);
  `discoverBoards.ts` (used by the Find box's company lookup), `yc.ts` (community mirror), `dsOrgs.ts` +
  `githubBudget.ts` (keyless GitHub search, 8 searches/min and 40 core/hour in `rjb_gh_budget`) feed the
  auto-scan's leads. Targets (`rjb_targets`) and dreams (`rjb_dreams`) are v11 stores the move reads. Big-company
  ATSs (Workday, SuccessFactors, Taleo, Oracle) are Google links only (Search elsewhere): never fetch them.
  `yc-oss.github.io` and `api.github.com` are in `connect-src` and `csp.test.ts`.
- **Company source (#215):** `feed/companySource.ts` is the YC hiring-now match (`ycMatches`) for the auto-scan's
  leads; `feed/teamTopics.ts` `teamSearchFor` is the design-system topic test (`roleType`, `dsOrgs`).
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

## PR previews: screenshots, not Vercel (Adrian 2026-10-24, all repos)

Vercel preview builds are OFF (production only). Every PR carries its own preview:

1. Run the production build locally (`pnpm build` / `npm run build`) and serve the built app (`pnpm preview` / `npm run preview`, or the repo's screenshot tooling).
2. Attach screenshots of the affected routes only: 390x844, light AND dark, plus a desktop shot if the route is used on desktop. At most ~6 images, inline in the PR body or a PR comment. Adrian reviews on his phone: no zips, nothing he has to build.
3. Backend/infra PRs with no visual change: write "no visual change" instead.
4. Never re-enable Vercel preview builds (or add `[preview]`) to get screenshots.
