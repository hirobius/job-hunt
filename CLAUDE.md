# CLAUDE.md — Roleflame (formerly hiraga, Stoke, RoleForge, Apply Board)

Project memory for future Claude Code sessions in this repo.

## What this is

**roleflame**, all lowercase since 2026-11-08 (renamed Roleflame 2026-11-02, Adrian, hirobius/ops#1092 / #55; before that **hiraga**, lowercase, 2026-10-30, Adrian: hire + Firaga, and _hi_ 火 is Japanese for fire; formerly Stoke, RoleForge, Apply Board) — a job-application tracker + discovery board, live at
**https://roleflame.vercel.app** (since 2026-11-05; repo `hirobius/job-hunt`; the old
`roleforge-app.vercel.app` and `job-hunt-jade.vercel.app` still serve and are accepted sign-in origins until they redirect). Rebuilt from a
single static `index.html` into a React app (the old file is in git history at
commit `f15fd52`).

**Product name = `src/brand.ts` only (#55).** Header wordmark, `<title>`/meta (index.html
`%BRAND_*%` placeholders via the `brand-html` Vite plugin), toasts and download filenames read it;
`src/brand.test.ts` fails on a hard-coded name. Stored identifiers stay fixed on purpose: the backup
format id `app: 'apply-board'` and calendar UIDs `@apply-board`.

**Flame logo: one source, `src/brand/flame.svg`; one engine, a small fire simulation (Adrian 2026-11-10; it replaced Version E).**
`src/brand/flameEngine.ts`: three colour layers, each its own heat field (a body ellipse with width, height up / down,
drop, pointed top, sway, pulse; a share of the licks' heat); **licks are particles** (position, velocity, size, life:
buoyancy, swirling air, wander, drag, cooling), each drawn as a tongue along its own velocity; heat is summed on a grid
and cut at 1 (marching squares, curves with sharp corners). Layers stack, none is clipped; a layer can be off (the core
is). `FLAME` = the settings Adrian copied out of the **flame tuner** (a private artifact page of sliders; tune only
there, then `npm run icons`). `RoleFlame.tsx` draws with the same engine (`flameEngine.test.ts` fails on a copy). About
4 ms a frame in Node at 10 fps.
`npm run icons` writes its still frame (the first frame of the `STILL_SEED` fire, HDS primitive fills, `fill-rule="evenodd"`, classes
`flame-1|2|3`) to `src/brand/flame.svg`, then favicon.svg, PNG icons, favicon.ico, og-image from it;
`flameEngine.test.ts` fails when flame.svg is not the engine's still frame. Everything static derives
from flame.svg: the wordmark in the header and on sign-in (`src/brand/Flame.tsx` inlines it, ids made
unique per instance) and the icons. `src/brand/flame.test.tsx` fails on any other `.svg`, any copy of its
path data, a stale `public/favicon.svg`, or non-HDS fills.
**Motion:** `flameMotion.ts` `animateFlame(svg, letters)` rewrites the three paths' `d` every 1/fps (the
box never changes) and can shimmer the wordmark letters (`FLAME.tOn`; off, Adrian 2026-11-10: it bent the f and l, so the letters stand still);
the header/sign-in `Wordmark` and `Flame` reach it only through `startFlame.ts` (a lazy chunk, `entryChunk.test.ts`: the
entry is under its 255 kB budget (252.6 kB); the still frame shows until it lands);
it animates continuously (Adrian 2026-10-30: never settles);
still under prefers-reduced-motion (also when turned on mid-run), paused while the tab is hidden, off
where matchMedia is missing (jsdom). The header/sign-in `Wordmark` and `BootHold` (`<Flame animate />`)
animate. **Boot splash: the live fire, no fixed loop (Adrian 2026-11-10).** `%BRAND_FLAME%` in index.html's `#root` is
the still mark (`brandHtml.ts`); `src/brand/bootFlame.ts`, its own small chunk put in the head ahead of the entry by the
`boot-flame` plugin in vite.config.ts (it shares the engine's chunk with the lazy logo, and is not part of the entry's
budget), runs the simulation on those paths until React replaces the splash; reduced motion / no script shows the still
mark. No flame anywhere repeats: `loopFrames`, the baked frames and the `rjb-boot-frame` CSS are gone
(`flameEngine.test.ts` fails if a loop comes back). The splash still fades in after a short beat.
**Wordmark: the flame, then the name, "Roleflame" (Adrian 2026-10-30, name 2026-11-02; was St(flame)ke):** `src/brand/Wordmark.tsx` (header, an `role="img"` named by BRAND, never a heading, #363, inside the home link to Find, #620;
sign-in) and the og-image share one markup builder, `wordmarkMarkup.ts` (`BRAND.wordmark = { flame: 'before' }`):
`.rjb-wordmark-flame` then `.rjb-wordmark-text` (`{ letters: true }` in the app wraps each letter in
`.rjb-wordmark-l` for the flicker; the og-image keeps a plain run). `wordmark.css` sets them on one baseline, the
flame `1.35cap` tall with its extra height taken back by a negative top margin, so the line is plain text's height
and the name's run is plain text's width (`e2e/brand.spec.ts` checks within 1px while the letters flicker); named
by `aria-label`, its parts aria-hidden. **BootHold:** App's main, only while a signed-in device with no data waits for its cloud
copy, max 4 s.
**Animated logo (Adrian 2026-11-06): `src/brand/RoleFlame.tsx`** (flameEngine's flame + the flickering name, kept as
code, never an SVG/image) is the **app bar** (`BrandLogo` → `LazyRoleFlameLogo`, fontSize 19; a lazy chunk behind the still
`Wordmark still`, so the entry stays under budget) and the **sign-in screen** (`layout="stacked"`, centred; two sizes, 40px with the keyboard closed and 20px open
(`data-keyboard`, visible height < 80% of innerHeight), one eased transform transition started only on a state change; the panel is fixed, inset 0 and opaque, and only its inner box follows the visual viewport, 2026-11-09 #523; **mass-centred, #556:** the stacked flame moves right by `STACKED_FLAME_NUDGE_EM`, the name's ink offset (`NAME_INK_OFFSET_EM`, measured again in `e2e/brand.spec.ts`) less the flame's mean mass offset (`FLAME_MASS`, measured again over 300 frames in `flameEngine.test.ts`, which fails on a tuning that moves it); the app bar row takes no nudge). **Sign-in copy (redesign §5.8, #555):** under the wordmark, two lines, the benefit leading: "Sign in to see your jobs on any device." (body, primary) and "We email you a sign-in link. No password needed." (caption, secondary), which describe the form step (`account/signInCopy.ts`); the Account menu's signed-out item says the same words ("Sign in to see your jobs on any device"); the top right control is Pause animations with its icon; Continue without an account stays the underlined exit. Colours are HDS primitives on `.rjb-rf` in base.css (light/dark), the name is
`BRAND.name` in **Sora 800** (Adrian 2026-11-10; `src/brand/fonts/sora-800.woff2` + its OFL licence, the logo's one font of its own: the HDS variable Sora covers 400–700 and the logo keeps its own Sora 800; `roleFlameType.test.ts`), its dynamic styles come from helpers (no
inline-style literals), and reduced motion holds frame 0. It pauses while the tab is hidden and **never stops on its own**, app bar and sign-in alike (Adrian 2026-11-09: the 5 s
limit is gone), still under reduced motion and under the Account menu's **Pause animations** toggle (WCAG 2.2.2;
`src/motionPref.ts`, `rjb_ui_pause_motion` per device, default = reduced motion; `roleFlameMotion.test.tsx`). The boot splash, icons, og-image and BootHold still use
flame.svg / flameEngine. Pinned in `shell.test.tsx`, `SignInDialog.test.tsx`, `e2e/brand.spec.ts`.

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
- **Keys by state, sections with content (redesign §5.5 States, #540):** `src/dockKeys.ts` `dockKeys` is the one
  table of keys per state (`{ id, rank }` rows: filled / grey / exit; #575's table and #540's merged into it): to
  apply with a link, to apply with no link (`applicationLink`: the stored URL does not parse as http(s); a "No
  application link" fact, `AddLinkDialog.tsx` (its Link field takes focus) → `setJobUrl`, then focus on Open
  application; `checkJobLink` in `store.ts` refuses a link a browser cannot open or another job's before anything is
  saved, #593), follow-up due (Copy follow-up, then Mark followed up and Close out, those two with Undo, in `applyActions.ts`;
  More keeps "Follow up…" for the dialog), Interviewing (Add interview), else no dock. The "Templates (N)"
  disclosure (`ApplyTemplates`, `templatesOpen.ts`, `.rjb-template-row`, `ApplySheet.css`) is deleted; the kit links
  to Documents and, with no messages, shows no message rows. Pinned in `dockKeys.test.ts`, `jobPage.test.tsx`,
  `e2e/job-states.spec.ts`.
- **Copy into the form (redesign §5.5, #539):** the Application kit panel is "Copy into the form": filled fields
  are HDS `Tag` chips with a copy icon (`CopyChip` in `ApplySheet.tsx`, G4 hds#1435), "Copied" for 1.5 s and a
  polite status; empty fields fold into "N more fields are empty. Add them"; Edit (aria-expanded) opens the field
  rows. A failed copy toasts the text itself (`copyFailed`, `templateCopy.ts`). `.rjb-blank` moved to
  `BlankText.css` (lazy, off base.css); `.rjb-template-row` went with the Templates disclosure (#540). Pinned in `e2e/copy-chips.spec.ts`.
- **One saved list (redesign §5.3, #534):** Apply is the saved list. Find's Save (primary, plus icon) toasts
  "Added to Apply: <title>" with Open and Undo; a double Save is a no-op (`alreadyInApply`); Undo toasts survive
  navigation for their full timeout (no route dismissal in `saveNotice.ts`). The star
  left the UI (StarButton, the menu's Star/Unstar, the Starred view, `.rjb-icon-filled`, `.rjb-pop*`); the
  `priority` field stays in the data, backups and CSV (and still sorts). More's last item is "Remove from Apply"
  ("Removed from Apply: <title>", Undo; focus to the next title). Pinned in `e2e/saved-list.spec.ts`, `e2e/review.spec.ts`.
- **Action dock (redesign §5.5, #535/#536):** `src/hds-gaps/ActionDock.tsx` (+ `.css`, `fieldFocus.ts`; G1,
  hds#1432; in the JobPage and Find chunks (the Find Deck, #545), nothing in base.css). Below lg it is a fixed dock portalled to `body` (a
  transformed ancestor would pin it), safe-area inset, hidden and `inert` while a typing field has focus
  (`hds.motion.spatial`; reduced motion = opacity); from lg an inline row under the title block. Keys: filled,
  grey, exit, per state from one table, `src/dockKeys.ts` `dockKeys` (see Keys by state above): to apply with a
  link Open application | Mark applied | Not a fit; **no link** (`applicationLink`: not http(s)) Mark applied | Add
  link (`AddLinkDialog.tsx`) | Not a fit, never an Open application; follow-up due Copy follow-up | Mark followed
  up | Close out; Interviewing Add interview; else no dock and no spacer. The dock hides at once on a field and comes back
  only after focus has been out of every field for 150 ms (`SHOW_AFTER_MS`: no flash between fields). More
  sits beside the title (no star, #534). Not a fit is the dock's exit: "Marked not a fit: <title>" with Undo
  (`applyActions.ts`: `undoPatch` puts every field back, no navigation; the toast survives navigation). After
  Mark applied / Not a fit / Close out the next job in the list opens (`applyNext.ts` `openNextAfter`, from any
  origin) and its title takes focus; with no next job the tab goes back to its list and that page's h1 takes focus.
  When the keys change under a focused key (a sync from another device), focus goes to the new filled key, or the
  title when none is left. The dock sits above an on-screen keyboard (`--rjb-vv-bottom` from
  `useVisualViewportVars`) and reserves one row for one key (`data-rows`) (#593).
  Pinned in `ActionDock.test.tsx`, `dockKeys.test.ts`, `rapidApply.test.tsx`, `jobPage.test.tsx`, `e2e/action-dock.spec.ts`.
- **Title block (redesign §5.5, #538):** `JobTitleBlock` in `JobHeader.tsx`: title (h1, `typography.title`,
  `rjb-break`), company or "Company not stated", HDS `Card.Facts` (place, pay or "Pay not stated", date), then
  `dueBadgeOf` (`jobDates.ts`) as an amber `src/hds-gaps/IconBadge.tsx` (G6, hds#1437) for Closing soon or
  Follow-up due. `JobBadges` drops the fit chips and the Saved chip everywhere (the verdict stays in the data).
  Pinned in `jobTitleBlock.test.tsx`, `e2e/title-block.spec.ts`.
- **Add job (redesign §5.10, #551):** `src/AddJobDialog.tsx`, its own component so any host opens it (`AddJob.tsx`
  is the button; the All jobs sheet, #543): the Job link field (helper "The title fills in from the link. You can
  edit it after."), Add job (filled) and "Type a company or title instead" (grey; turns the dialog into the Find
  box). No Cancel key: Close (the X), Escape, the scrim and Back cancel, focus back on the opener. Below sm a
  bottom sheet (`.rjb-bottom-sheet`, now `src/hds-gaps/BottomSheet.css`, lazy with All jobs and Add job; only
  the handle's `display: none` stays in base.css) above the keyboard (`AddJobDialog.css`), Add job at full width
  over the grey key; from sm HDS's centred dialog, Add job at the right. Pinned in `TrackerView.test.tsx`,
  `findBox.test.tsx`, `e2e/add-job.spec.ts`, `e2e/sheet-gutter.spec.ts`.
- **One detail template at 1440 (#546, redesign §5.4):** `src/DetailHeader.tsx` (`DetailTitleBlock` + `DetailHeader`)
  is the one header for a saved job (`JobHeader`) and a Find posting (`ReviewView` `PostingDetail`): Back, the title
  block (h1, company or "Company not stated", HDS `Card.Facts`, then the badges; a posting's source is a neutral
  badge there, no blue New), More beside it (a posting's holds Not this company), one action row (`ActionDock`:
  Save filled, Skip grey, Open posting icon for a posting), then the content (a posting's "Description" `Panel`).
  **List cards carry no keys at 1440** (`PostingCard keys={!onOpen}`): the detail column has them; below lg each
  card keeps its own. Shared by the JobPage and Today chunks, never the entry. Pinned in `review.test.tsx`,
  `figmaRules.test.ts`, `e2e/review.spec.ts` (`templateOf`: the posting's and the saved job's headers measure the same).
- **Empty, error and done states sit on the page background (redesign §5.11, #553/#554):** `src/hds-gaps/EmptyState`
  `onPage` (centred, room above and below, no card); `framed` (a raised panel) is left for not-found and
  "pick one" columns only. One filled key and one grey key, never a text button for a second choice: Apply empty
  "Track your first job" (Add job | Try with sample data), the load error (Try again), Documents' "No documents
  yet" (Add starter messages | Start from scratch, grey), Find's "No postings match yet" (`AutoScanViews.tsx` `NoResultsKeys`: signed out Scan now | Edit
  search profile (Scan now is also in Find's More menu, #544); signed in Edit search profile alone, filled, as
  there is no Scan now signed in; it opens the Account menu's dialog through `jobDialogs.ts` `openSearchProfile`). **Done:**
  with nothing left to apply to at all (To apply view, no search; Remote only aside) the Apply tab is
  `TrackerView` `DonePage`: the h1, then `ApplyDone.tsx` (BootHold's `<Flame animate />`, the lazy startFlame
  chunk, still under reduced motion and Pause animations; "That is the list"; `applyDone.ts` `weekLine`: applied
  in the last 7 days and follow-ups due; the filled key Follow up (N) while some are due, else Find more jobs; the
  grey All jobs key sets the All jobs view and focus goes to its first job's title), the lg rail beside it. After
  the last Mark applied / Not a fit the tab lands there and its h1 takes focus. Pinned in `applyDone.test.ts(x)`,
  `emptyStates.test.tsx`, `rapidApply.test.tsx`, `e2e/rapid-apply.spec.ts`, `e2e/states.spec.ts`.
- **Keys (redesign §3, Adrian 2026-11-10, #537):** one filled key per decision, a grey key for a real
  second choice, and **An exit is underlined text** for every way out (Cancel, Not a fit, Continue
  without an account): `src/hds-gaps/ExitButton.tsx` = HDS `Button variant="link"` + HDS's
  `hds-touch-target` (44px at every width; G11, hds#1442). Its focus ring is on `::after`
  (hds#1167), which the `e2e/a11y.spec.ts` walk reads. `e2e/exit-style.spec.ts` pins it at 390 and 1440.
- **Design language (pure HDS, Adrian 2026-10-12; graphite 2026-10-15):** HDS typography
  (`fonts.css`, Sora since HDS 0.41.0 (regular 400, semibold 600, bold 700), the HDS type ramp), surfaces and the default **graphite
  accent**. There is **no local colour override** — the jade `brand-jade.css` was removed, and
  `hdsOnly.test.ts` fails if a `src/theme/brand-*.css` or an accent-token remap comes back. No ALL CAPS anywhere (HDS never sets it; `hdsOnly.test.ts` checks).
- **Design system:** `@hirobius/design-system` (HDS) is consumed **directly from public
  npm** (exact-pinned `0.41.0`; `hdsOnly.test.ts` enforces the exact pin) — see `docs/adr/0005` and `docs/adr/0007`.
  The HDS ESLint plugin comes from the private `@hirobius/hds-toolkit` (GitHub Packages, hirobius/ops#691):
  `package.json` pins it by its full tarball URL and `.npmrc` keeps only the auth line (no `@hirobius` scope
  mapping, job-hunt#567), so installs need `HDS_PACKAGES_TOKEN` (classic, `read:packages`) and design-system
  always resolves from registry.npmjs.org. `src/hirobiusHosts.test.ts` checks each `@hirobius` lockfile host.
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
- **Two screens: Find and Apply (#471; Adrian 2026-11-05; ADR 0010, done in #493/#494/#495/#500).** Exactly two
  top tabs and no other full page; each is a list beside a detail at lg (HDS `Sidebar`) and the list alone below lg; the
  selection is the route; Documents and Privacy and terms are dialogs in the page's URL. **This section is the current
  shell: where an older section below (Job routes, Final shell, Rapid apply, Pipeline panels, Return paths) says
  Pipeline, `#/queue`, Today, Apply mode or a Documents / Legal page, read it as history.** The top tabs are **Find** (slug `find`,
  `Today.tsx`, home; was "Today", `#/today`) and **Apply** (slug `apply`, `TrackerView.tsx`; was "Jobs" /
  "Pipeline", `#/queue`). **Routes (slice 1):** `#/apply/<jobId>` is a job's Apply view (`route.ts`
  `APPLY_TAB`, `jobId`); `redirectOf` (in place, no history step) sends `#/today` → `#/find`, `#/queue` →
  `#/apply`, `#/queue/<id>` → `#/apply/<id>` (origin and section kept); an old `?from=` reads as its new route
  (`originOf`, `routeLabel`). **There is no Apply mode, To apply panel or Start applying on Apply:** the tab is
  the walk. One job view (`JobPage`: header with Open application, Mark applied | Not a fit (`applyActions.ts`;
  a 700 ms double-tap guard on both; focus then goes to the new job's heading, or the list's), then `ApplySheet.tsx` Templates + Application kit, then Details,
  Notes, Documents, Decks). Mark applied / Not a fit open the next job in the list as it shows (in place, before
  the answer lands, with Undo); the last one goes back to the list. At ≥ lg the Apply tab opens on the first job
  to apply to with the list column (`JobRail`) beside it; a pick replaces the history entry. **Below lg: one Apply
  screen (Proposal A, Adrian 2026-11-08).** The tab opens on the same job (no list page; `PipelinePage` is only the
  empty state; no filter bar on the job since #543: Add job, search, filters, Sort and the sample line are the
  All jobs sheet's), the sticky **walk control** (#542, `ApplyWalk.tsx`:
  one row, no box: the **view picker** (the open view's name, bold, caret, named "View: <name>"; an HDS Menu drawn as
  a sheet below sm by late.css `.rjb-menu-sheet`, shared with the Account menu, holding the five views with counts and
  "All jobs and filters"), a **"N filters" chip** only while a filter is on (`filtersOn`: search, Remote only; it opens
  the sheet), and on the right the "‹ 3 of 55 ›" pager over the filtered list, which only steps (`ApplyPager.tsx`,
  label "Jobs in the list"; "Not in this filter" for a job it hides; a 64px sideways swipe on the job steps it too);
  at 390 the view name truncates, never the pager; no pager at lg) and **All jobs**: a bottom sheet (`AllJobsSheet.tsx`, HDS Dialog drawn as a sheet by
  `.rjb-bottom-sheet`: HDS Sheet would bust the entry budget) holding `TrackerView`'s `JobsList` (#543: Add job, the
  view chips, search "Search saved jobs", a "Filters" group with the Remote only `Tag` chip (aria-pressed), the
  Sort chip (`PipelineMenus chip`, a Tag) and "Clear N" while `filtersOn` > 0, the sample line, then the rows).
  **One job list, sheet and lg column alike (#543):** `JobRowList.tsx` (+ `.css`), rows in an HDS NavList on one
  surface, never a Card per job: badges, the title (`rjb-clamp-2`, two lines), the company, place and one date;
  the title is the link, its hit area stretched over the row (`::after`, which carries the focus ring), so its name
  is its visible text (the rest describes it; `hds-gaps/NavListActionItem` is deleted); the open job is
  `aria-current` with the selected fill; no row key (Follow up, Mark applied), no row menu, no posting glyph (the
  job page's header and More have them). Follow up and Next 7 days stay under the lg column only.
  `ApplyFilterBar`, `ApplyQueueSummary` and `JobListCard` are deleted. A pick pops the sheet's entry, then replaces the page's, so Back leaves
  the tab in one step; notices raised while it is open show in its footer (`saveNotice.noticeHost`). A job opened from
  elsewhere keeps its "← Back". The **Templates** disclosure is gone (#540): the job's messages are rows in Copy into the
  form (only when there are messages), with Edit documents beside them. No posting
  glyph by a title on Apply (the header's Open application, or the menu's Open posting). A
  signed-in device with no jobs yet shows "Loading your jobs…" first (#478), at every width. **Find (slice 3):**
  `#/find/<fingerprint>` selects a posting; see Final shell. Save, Skip and Not this company share Apply's 700 ms guard (`answerGuard.ts`); after a decision on the selected posting, focus goes to the next one's title, else to Find's h1 (`focusRescue.focusNewHeading`). **Documents and Legal are dialogs (slice 4)** over the open page: `?documents=` / `?legal=` on its hash (see Documents library, Privacy and terms). **Company (slice 2):** `#/apply/company/<slug>`
  in the right column at lg (see Company page).
- **Structure (since simplify #383/#389):** `src/App.tsx` is the shell with two top tabs, **Find**
  (`Today.tsx`, home) and **Apply** (`TrackerView.tsx`, slug `apply`), plus
  tab pages (a job, a posting, a Company) and two dialogs over them (Documents, Privacy and terms; #471 slice 4). `types.ts` holds the Job model.
  The old Trades / Discover / Companies screens are deleted (ADR 0009); their slugs redirect to Find.
- **Design-systems only (Adrian 2026-10-29):** content is design systems and nothing else. The one starter pack
  is Design Systems (`curation/starterPacks.ts` `STARTER_PACKS`; `radar/directory.ts` `DIRECTORY_BY_PACK` /
  `TARGETS_BY_PACK` keyed `designsystems` only; `jobsData.GROUPS` = `ds-brief`, `ds-watch`); the sample jobs are
  design-systems roles. The trades / Spokane / apprenticeship content, the Implementation Consulting, ServiceNow and
  Skilled Trades packs, `curation/localize.ts` (Spokane link rewriting), the `'sam'` source and the non-design
  `companySource` / `teamTopics` branches are deleted. Older accounts' other tracks stay stored (curation tables, v11
  stores, sync, Back up, CSV) but never surface: the v12 move reads design-systems tracks only. Guard:
  `src/dsOnly.test.ts` (pack ids, directory keys, curated groups, no `sam` source, and a scan of app source for
  Spokane / welding / sheet metal / apprenticeship / ServiceNow / SAM.gov with a commented allow-list).
- **Shell (#115 Phase 1; rev-3 mobile slice 1):** slim header, one row at every width (#548) = the body-size wordmark, a link home to Find (#620; the lockup inside
  never a heading: `role="img"` named by BRAND, #363; so the page title is always the biggest text) · **each page's own name is its one `h1`, inside `main`** (#363:
  Apply, Find, the job title, Documents, a Company, Legal; panel heads are `h2`, card titles `h3`; `focusRescue`
  focuses the page's h1; `e2e/a11y.spec.ts` keyboard walk fails on an h1 outside main) · top tabs (**Find · Apply**: links in a `nav` named "Sections", the open one `aria-current="page"`, styled as HDS tabs by `.rjb-top-tab`; not ARIA tabs, no tab panel (top tabs PR, 2026-11-08; HDS ask: Tabs as navigation links); tests use `test/topTabs.ts` / `e2e/routes.ts` `topTab`, `currentTab`) · the
  **Account** button: an HDS `Avatar` (initial signed in, person icon signed out; named "Account"; no unsynced dot, Adrian 2026-10-22; it holds account, data, display and feedback). Page gutter: `PageShell`'s `clamp(1.25rem, 5vw, 4rem)` (20 on a phone, 64 from 1280; see Shell width below). `src/account/` is the account
  seam: `CloudSyncProvider` + `DataToolsProvider` own sync / backup / restore / CSV and expose
  `useCloudSync` / `useDataTools` (`accountContext.ts`); `AccountMenu` (an HDS Menu; below sm drawn as a bottom sheet with a grab handle and its own scroll, from sm a dropdown ≥ 16rem, by `src/theme/late.css`: late shell styles that ride the animated logo's chunk, off the first-load CSS budget; account menu PR 2026-11-08) holds sign-in/out, Documents, Search profile, Companies, Data (the
  **Data dialog**, below), theme and feedback; there is no sync banner and no Avatar dot (the menu's sync line says it);
  `SignInDialog` is the magic-link form. Errors are HDS **Toasts** (`ToastProvider` in `main.tsx`;
  tests wrap App in one); `src/hds-gaps/toastAnnouncer.ts` (#365) mutes Radix's assertive announcer and says each toast
  itself: politely (errors assertively), "Title. Description". Shell behaviour is pinned at the route seam in `src/shell.test.tsx`, incl. the Account menu order
  (**9 items in 4 groups, redesign §5.9, #549**: who | things | display | about. Signed out: "On this device only" as a label and **"Sign
  in to see your jobs on any device" as a grey key** (#555's words, `signInCopy.ts` `SIGN_IN_ITEM`; HDS secondary `Button` as the
  `Menu.Item`, `.rjb-menu-key`); signed in: "Signed in as <email>" + sync line as labels, Retry sync when it failed, and
  Sign out. Things = Documents, Search profile, Companies, Data. Display = **Dark theme** and **Pause animations**,
  toggles that show their state and keep the menu open (`src/hds-gaps/MenuToggleItem.tsx`: an HDS Menu.Item with role
  `menuitemcheckbox` + `aria-checked` and a drawn switch, `.rjb-menu-switch` in late.css; G9 hds#1440). About = Send
  feedback, Privacy and terms. Every row has a 16px icon; rows are 44px on a phone (HDS `hds-touch-row`) and 38px from
  sm (late.css). **Scan details moved into the Search profile** (a closed HDS Disclosure row at its end, `ScanDetails.tsx`).
  The rows are their own chunk (`AccountMenuRows.tsx`, `lazyDialogs.ts`, fetched 3 s after start and as the
  Account button is pointed at or focused; `entryChunk.test.ts`), so the icons stay off the entry.
  Pinned in `shell.test.tsx`, `e2e/account-menu.spec.ts`, `e2e/brand.spec.ts`). Pillars and tracks are gone from the UI (ADR 0009).
- **Data dialog (redesign §5.9, #550):** `src/account/DataDialog.tsx`, a lazy chunk (`lazyDialogs.ts` `DataDialog`,
  `entryChunk.test.ts`), opened by the Account menu's one **Data** item. An HDS Dialog drawn as a bottom sheet below sm
  (`.rjb-bottom-sheet` + grab handle, G2 hds#1433), a centred dialog from sm. Two lists (`ItemList` rows, no cards),
  each row a tertiary key with a 16px icon and a caption line (its description): **Your data** = Back up, Restore…,
  Export CSV, Export links, Recently removed (N) (only when the trash has some); **This device** = Try with sample
  data (signed out with no jobs), Reload app, Reset local data… (danger; its confirm opens over the dialog and Cancel
  gives focus back to the key), Delete my data (signed in, danger, last). Restore, Export links, Recently removed and
  Delete my data close the dialog first (a modal hides a toast's actions) and hand focus back to the Account button.
  Pinned in `account/dataDialog.test.tsx`, `shell.test.tsx`, `e2e/account-menu.spec.ts`, `e2e/phone-menu.spec.ts`.
- **Guardrails (redesign-mobile, `docs/guardrails.md`):** HDS freshness (≤ 1 minor behind `hds-version.json`) runs in `verify`; layout rules + screenshot baselines run in `npm run verify:ui` (local; update baselines with `npm run test:visual -- --update-snapshots`). **Baselines are drawn only in the pinned Playwright image** (`e2e/visual-env.json`: image digest + its Chromium, #485): `test:visual` runs the spec there through Docker (`scripts/visual-docker.mjs`); elsewhere the spec skips and an update fails (`src/visualEnv.test.ts`). Bump the digest with `@playwright/test` and re-take every baseline in the same PR.
- **Screenshot gallery (#115 Phase 0):** `npm run gallery` (or `-- --url=<deploy> --out=gallery/x`)
  shoots every route/sub-tab/dialog at 1440+390, light+dark, with sample data → `gallery/`
  (git-ignored). Run it before/after each redesign phase.
- **Job routes (#127; history, see Two screens: now `#/apply/<jobId>`, the Apply view):** every saved job has a page at `#/queue/<jobId>` (`Route.jobId`; the second
  segment is a job under `queue`, a sub-tab elsewhere). `store.jobIdOf(url)` derives the id (hash
  of `dedupKey`, never stored); `findJobById` resolves it; `route.openJob(id | null)` navigates.
  **Job page (#130; rev-3 mobile slice 2):** `JobPage.tsx` = `JobHeader` ("← Pipeline", one
  `JobBadges` row above the title (status, Follow-up due; no fit chip since #538), company · location, then one
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
  …"), Remove from a job page, Retire of a job closed on the board. **Undo never navigates (Adrian
  2026-11-11, #593):** every Undo puts the item back and leaves the person on the page they are on
  (Remove's Undo pressed on Find stays on Find; a list that shows the item again flashes its row,
  `saveNotice.jobHighlightKey`). Never global state: back/forward and reload keep it. **Scroll** (`scrollMemory.ts`, set
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
  Today · Jobs** (renamed Find · Apply in #475, see Two screens above; slugs `find` · `apply` since #471).
  **No Companies tab:** `route.ts` `redirectOf` sends `#/discover/*` and `#/apprenticeships` to `#/today` (the
  snapshot reads them as Today, the URL is rewritten in place with no history step, `navigate` / `goBackTo` never
  write one); never redirect anywhere else. The old Discover screens are deleted (#389, ADR 0009). An empty hash
  and a sign-in error land on Today; there is no setup screen (see First run).
  `Today.tsx`, top to bottom: **the short header** (`FindHeader.tsx`, #544, redesign §5.1): the h1 "Find" and one
  caption, "4 new · scanned 2 h ago" (`findCaption.ts`: the New chip's count, then the server's last sync signed in
  (`useServerUpdatedAt`) or this browser's last scan signed out (`agoPhrase`), "scanning…" while one runs; no date
  line), with **one More menu** on its row ("More: sort, scan and search profile": Sort while Browse has a list,
  Scan now / Stop scan signed out only, Search profile); `ReviewView`'s `header` is a function given the new count,
  the sort and whether a posting is selected (then "Find" is a `p`, the posting's title the h1). Then **Review**
  (was "Review new", #615: the heading counts every posting not saved or skipped; labels only)
  = `ReviewView` itself (`label="Review" scanStatus`: one panel holding Browse | Deck, two filter chips
  (**New**, was "New today" (#615): first seen today, the same rule as the card's count; Remote) and the Browse list; at lg a card's title selects the posting) **New companies
  left Find (#618, Adrian 2026-11-12):** the scan's found companies (`NewCompanies`, Follow / Ignore with Undo) are
  the Companies dialog's **Found** list. **Two columns (#471 slice 3):** `ReviewView` given a `header` lays
  Find out (**below lg there is no posting page since 2026-11-08:** the card's title is the link out to the posting
  (#544), an old `#/find/<fingerprint>` link scrolls to its card and drops the fingerprint, and after a
  decision focus goes to the next card's title): at ≥ lg HDS `Sidebar` (list column 26rem: header, Daily picks, Review) beside
  `PostingDetail` (the job page's template since #546: title block, More with Not this company, Save / Skip / Open
  posting, then the Description; "Pick a posting" until one is picked); below lg the list is the tab and a
  selected posting is its own view with "← Find" and "‹ 2 of N ›" ("Postings in the list"). The selection is the
  route, `#/find/<fingerprint>` (`route.postingOf` / `findHash` / `selectPosting`, URI-escaped): shareable, survives
  a reload, nothing selected when the tab opens. A pick replaces the history entry at lg and pushes below lg (Back
  returns to the list); a decision on the selected posting selects the next one in the list (in place). The
  selected card is `aria-current` (`.rjb-selected`). **Apply and Follow up left Find** (each item shows on one tab
  only): Follow up is on the Apply list; `today.ts` and Resume applying are gone. Followed and Ignored
  companies are the Account menu's **Companies** item (`CompaniesDialog.tsx`, lazy; `companiesList.ts` reads the
  Feed's Sources: followed = boards + companies, A to Z, once by name; ignored = the muted Sources; one list at a
  time, Ignore = `muteCompany`, Follow again = `unmuteCompany`, plus `followCompany` for one with no Source; then Suggested (#576) and
  Found (#618), each only while it has rows; it opens on the first list with rows). Merges #426
  (Jobs keep list, one-page job page, no fit badge); "Find more like this" left the job menu with the ATS search. Pinned in `todayHome.test.tsx`, `review.test.tsx`,
  `companiesList.test.tsx`, `route.test.ts`, `e2e/today.spec.ts`, `e2e/review.spec.ts`, `e2e/auto-scan.spec.ts`.
- **Named views (#541, redesign phase 2):** the Status select is gone. `pipelineView.ts` `Filter` is a named view:
  **To apply** (Saved, not set aside, not closed; sorted by closing date first, then the Sort's order, newest by
  default), **Follow up** (`deriveJobState(…).followUp.due`), **Interviewing** (Interviewing or Offer), **Applied**,
  **Recently closed** (`isClosed`: gone from the board or past its day; #602, where closed jobs collect and each is
  removed or kept; the automatic check is #602's own work), then **All jobs** (every job, set-aside ones too: the old
  Saved / Offer / Rejected / Retired / Closing soon filters went with the select). `VIEW_DESCRIPTION` is each one's
  one line. `JobViews.tsx` draws them as HDS `Tag` chips (`role="group"` "Views", `aria-pressed`, a `Badge` count,
  amber on Follow up while one is due) with the open view's line under them: at the top of the lg list column
  (`JobRail`) and in the Jobs list (the All jobs sheet); on a phone the walk row's view picker picks them (#542, out
  of Filters); `PipelineMenus` is Sort only (an icon at lg, a chip in the sheet). Default view To apply. Since #543 search,
  filters, sort and Add job live in the All jobs sheet (see Two screens); "Clear N" clears the filters, not the view. Pinned in `pipelineView.test.ts`, `jobViews.test.tsx`.
- **Find Deck (#545, #617, redesign §5.2):** the same `PostingCard` as Browse (not compact: badges, title step), one at a time (`ReviewView.tsx`
  `Deck`). No pager row: "1 of 4" is the caption under Find (`header`'s tools carry the Deck's place, `FindHeader`
  adds it to its caption); a 64px sideways swipe (`src/SwipeArea.tsx`, shared with the Apply job) or the arrow keys on the
  card step it. Skip (grey, left) and Save (filled, right) are an `ActionDock row` (one row, `data-layout="row"`):
  fixed at the bottom below lg, inline under the card at lg; the card collapses as it goes and both toast with Undo.
  After a decision focus goes to the next card's title (h3), or Find's h1 once the deck is empty (`Deck`'s `decided`
  mark; the card's elements stay, so `focusNextTitle`'s list-item walk does not apply).
  The card shows the posting's text at once (`usePostingText`, `.rjb-deck-excerpt` in `FindDeck.css`: 7 lines, in
  Find's chunk, not base.css), then "Read the full posting" (HDS InlineLink); More keeps Not this company; no
  disclosure. Sort (Find's More menu since #544) works in the Deck too: the deck walks `listed` in the Sort's order, and a sort change
  keeps the card on screen (`changeSort` finds it by fingerprint). Pinned in `review.test.tsx`, `e2e/review.spec.ts`,
  `figmaRules.test.ts`.
- **Shell controls (Adrian 2026-11-09):** Find / Apply look like an HDS SegmentedControl (`.rjb-segs` / `.rjb-seg`
  in base.css, HDS tokens) but stay a `nav` of links with `aria-current="page"`, because HDS SegmentedControl is a
  radio group (ask: `docs/hds-upstream-asks/segmented-nav.md`, G7 hds#1438); **one app-bar row at every width (#548):**
  logo · Find / Apply · Account (the phone's 52px second row is gone; below sm the segments' sides narrow to 6 and the
  row's minimum gap is 4, so it fits at 375 and 390 with counts up to two digits; where it cannot fit, a 320 screen
  or two "99+" counts, it wraps the tabs under the logo). Concentric corners (hds#1470): `.rjb-segs` sets
  `--seg-rail-radius`, `--seg-rail-pad` (= its real padding) and `--seg-inner-radius`, which `.rjb-seg` takes. Each tab
  shows its **count** as plain text after its label, the way the view chips read (`TopTabCount.tsx`, a lazy chunk;
  over 99 reads "99+"; a Badge's chrome made the row too wide at 390): Find the new postings Review new last
  read (`scanDetails.newToday`), Apply the jobs its list shows now (`visibleJobs`: open view + Remote only, the status
  line's number); none while 0 or not known; the link's name is "Apply 12" (`test/topTabs.ts` matches label then
  count). **The logo is the home link (#620):** `.rjb-logo-link` around the `.rjb-logo` box (its 44px min-height is the target), named "roleflame, Find", never a heading;
  a plain click opens Find at its root from anywhere (on Find, back to its root, or to the top at the root), unlike
  a tab tap, which reopens where the tab was left. Browse / Deck is two HDS `Button iconOnly` (List, Layers) with
  `aria-pressed` in a `role="group"` "Review view", each with an HDS Tooltip. Apply's **Remote only** HDS `Toggle`
  (`RemoteOnlySwitch.tsx`, the lg job rail; the phone's All jobs sheet shows it as a chip, #543) sets `PipelineView.remoteOnly`, kept per
  device (`rjb_apply_remote_only`); `visibleJobs` keeps `isRemoteJob` (#614: the job's mode when set, else
  `inferMode` on title + location, where a list offering remote among places, "Portland, OR, or Remote within
  Canada", counts), and **every count follows it**: the view chips (`filterCounts(…, remoteOnly)`), the status
  line, the closed count (`remoteFiltered`), the pager and All jobs. A view change (named view or Remote only)
  that hides the open job opens the list's first job in place (`followView.ts`; none: the job stays and the list
  says "No jobs match"); search typing never moves it, and the lg rail has no "Not in this filter" card. **lg list
  column header (#614, Adrian 2026-11-12):** Jobs + Add job, the chips and the view description unchanged, then
  one row: Remote only, with Search (opens the field under it) and Sort (`PipelineMenus compact`) as tertiary icon
  buttons, then one status line. `.job-rail` pads its scroll box by a ring's width on every side (given back by a
  negative margin), so rings and the selected fill are never clipped (`e2e/sheet-gutter.spec.ts`). Pinned in `appNav.test.tsx`, `review.test.tsx`, `remoteOnly.test.tsx`,
  `e2e/shell-controls.spec.ts`.
- **Calm list shell (PR #208) and "Today is gone" (#236)** are history: the final shell above brought Today
  back as home and removed Companies.
- **Pipeline panels (rev-3 mobile slice 1, `docs/staging/all-states.html` on `claude/staging-states`):**
  To apply, Follow up, Next 7 days and Jobs are `PipelinePanel` (HDS `Card`, header +
  `Badge count`), 24 apart. The Jobs panel holds the full-width search, the named views (#541) and Sort as select-style
  menus and a quiet **Clear filters** when non-default; phone rows are HDS entity cards (`Card.Header`
  metadata = badge row above the title: status, then Follow-up due, then the closing date (no fit chip, #538); `Card.Facts` with
  location and the job's one date (#419); `Card.Footer` next step + bordered ⋯ menu). Rhythm is HDS Stack gaps, no
  margins. **No cards within cards, ever (Adrian 2026-11-01, #449; replaced 2026-10-23's "lists are cards"):**
  one card level max. A list inside a panel (the Account menu's Companies
  list, the Apply sheet's Templates, the Application kit, Documents, the interview log,
  the job page's links) is `PipelinePanel` `ItemList` (`.rjb-items`, a hairline between rows) of `ItemRow` (a plain
  row, never an HDS `Card`); the Apply list's jobs are `JobRowList` NavList rows on one surface (#543).
  **Review new's panel has no surface of its own** (`Panel flat`): its heading, count and metadata declare the group,
  and its content lines up with the page gutter. So each Browse row and the Deck posting is one standalone soft HDS
  `Card` (never `bordered`; the preview dialog shows the same body) in the reference anatomy (#458, Adrian 2026-11-02: `PostingCard`,
  source + New badges, the title on the `title` step (Deck and the detail; a Browse card is compact, below), company, then **one fact per line** (#616, Adrian
  2026-11-12; Browse, Deck and the detail): MapPin place ("Location not stated" when none, or when it is only a mode
  word), Briefcase work mode (Remote / Hybrid / On-site, "Remote not stated", else "Work mode not stated"; once, on
  its own line, also when the place says Remote), Calendar posted day; the pay line, then **one left-aligned action row (Adrian 2026-11-08,
  `PostingActions`): Save primary, Skip secondary, Open posting as an icon link, More (…) holding Not this company**,
  all `md`; no match-reason line). **A Browse card is compact (#544, redesign §5.1):** the title (bold body, HDS
  `lineClamp={3}`; it opens the posting: at lg it selects it, below lg it is the HDS `InlineLink` out, with the
  external icon), the company, the facts, the pay, then Save (filled, plus), Skip (grey) and More (Not this company;
  below lg only: at lg a list card carries no keys, the detail column has them, #546);
  no source or New badge, no Show description row, no Open posting key, padding `sm`. Card radius stays 12 until HDS G5
  (hds#1436). `.rjb-posting-rows` and `.rjb-preview-title` are deleted; `.rjb-card-title` stays only for the Apply
  card, the agenda and Daily picks (their quiet title link);
  `calmLayout.test.tsx` fails on any Card inside a Card.
  Pinned in `src/calmLayout.test.tsx`.
- **Documents library (#227; replaced Templates #132; a dialog since #471 slice 4):** one HDS `Dialog`
  (`DocumentsView.tsx`, size xl, titled "Documents") over the page it was asked from: `?documents=` on
  that page's hash (`''` the library, a document's id, `new/<kind>` a New editor; `route.documents`,
  `documentsHash` / `openDocuments` / `dialogStepBack` / `closeDialog`; `pageKey` ignores it). At lg the
  library is the left column (`listOnly`) and the open document's editor the right ("Pick a document"
  until one is open; a pick replaces the entry); below lg one view, an open pushes and the editor's Back
  steps back. Close, Escape and the browser's Back shut it on the page (a pop when the dialog-less entry
  is just behind, else in place); opened over a job, a Save closes it there. Old `#/copy-deck[/<id>]`
  links redirect in place to their `?from=` page (else Find) with the dialog open. Reached from the
  Account menu's Documents item and the Apply sheet's Edit documents link. Headings in it are h2 (the
  page keeps its h1). **Grouped lists, one New menu, a blanks count (redesign §5.10, #552):** `DocumentsLibrary`
  is a flat `Panel` per kind on the dialog's one surface, ordered by use (Messages, Cover letters, Résumés, then
  Notes), each with its count; **one New key** heads the library, a Menu of Message, Cover letter, Résumé, Note
  (no New per group); an empty group is one row ("No résumés yet.") with its own Add; the `.rjb-docs-*` rules
  live in `DocumentsView.css` (off base.css). Each kind's list is HDS Disclosure
  rows, one open at a time (redesign slice 3, rev-3 M): closed, the title and its blanks as a count ("5 blanks", never chips);
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
  (search, the named views since #541 (was Status incl. Closing soon / Closed from #423), Sort) and nothing else: `GettingStarted`,
  `ScoredQueue` and Find the next company are deleted (`gettingStarted.ts` too, in #390; an old
  `rjb_ui_getting_started_done` key is ignored). **Recently removed** is in the Account menu's Data dialog ("Recently removed (N)", only when the trash
  has some; `RecentlyRemovedHost` in `DataToolsProvider`, open state in `jobDialogs.ts`); **Export links** is
  Data dialog only (#550). The **job page is one page** (`JobPage` → `JobHeader` + `JobOverview`): Details, Notes,
  then **Documents** (`Job.docLinks`, additive, same shape and `sanitizeDecks` rule as `decks`, CSV `doc_links`
  appended last, Back up, Recently removed merge) and **Decks**, both `JobLinks.tsx` `LinksPanel` (a label and
  an http(s) link, Add, Remove with Undo). To-dos, Screening (Fit, JD screener), the Interviews log, Use
  template and the per-job document library are off the page; **their data (`todos`, screening fields,
  `events`, documents) is never deleted** and stays in storage, sync, Back up and the CSV. An old
  `?section=` link opens the one page. **Add interview…** is one item in every job's ⋯ menu (`RowMenu`, now
  `modal={false}` so its dialog opens cleanly) and an Interviewing job's header primary: one
  `AddInterviewHost` dialog (App) writes `events`, which feed Next 7 days. Each card shows one date (Posted,
  else Found) plus the closing-date badge (#423). Pinned in `simplifyJobs.test.tsx`.
- **Daily picks (2026-11-05, `docs/daily-picks.md`):** the scheduled Claude run's hand-picked roles, no longer a
  separate page. It calls `add_daily_picks(p_token, p_picks)` (security definer, public key + a feed token whose sha256
  is in `daily_pick_feeds`; ≤ 10 a call, 50 a day, insert only) into `daily_picks` (RLS read own; migration
  `20261105100000`, also redefines `delete_my_data`). Today shows `DailyPicks.tsx` above Review new, signed in only,
  hidden when empty: link, company, employee/contract, pay, posted day, fit line, draft note (Disclosure row + Copy),
  Save (`addJobDetailed` with `notes` = draft note + fit) and Skip (`decided` by fingerprint, Undo). Read model
  `src/picks.ts`; it imports `fingerprint` from `tracks/score` directly (through `decided.ts` the entry grew 0.8 kB).
  Pinned in `picks.test.ts`, `dailyPicks.test.tsx`, `dailyPicksMigration.test.ts`.
- **Company page (#230; #471 slice 2):** `#/apply/company/<slug>` (`route.companyHash` / `openCompany`,
  `companySlugOf`; the old `#/company/<slug>` redirects there in place) renders `CompanyPage` in the Apply tab:
  the company's Jobs, Documents and Notes, with Back (to the job it was opened from, else Apply). At ≥ lg the
  Apply list (`JobRail`, no row marked) sits beside it, as beside a job. The job page's Details Company fact links to it (only when the job has a company).
  An unknown slug shows a skeleton until `useCloudSync().settled`, then "No company here" (#303).
  Each Documents row links to its editor via `linkTo` (Back says "← <Company>"; an uploaded final copy is
  text only, #304). Notes are "Note 2 of 3" when several, each with a soft Remove + Undo; a notes-only
  company's last note goes back from the page and its Undo puts the note back without reopening it (#305, #593).
- **First run: no setup screen (Adrian 2026-10-29; was the Search profile form, #388):** after sync settles, App's
  `V12Migration` runs the v11 move, then `searchDefaults.ts` `ensureProfile`: with no profile it calls `finishSetup`
  with `NEW_PROFILE` (the design-systems titles, remote only, the broad ATS terms, include "design system", scorer
  `design-systems`) and follows the starter design-system companies (`seedSources()`) as Sources. Today opens on
  Review new (a skeleton holds its place until the profile lands) and `AutoScanOnOpen` mounts once a profile exists,
  so a signed-in person's scan runs with no click (signed out, nothing scans on open: Scan now does, 2026-11-07). Signed in, `PageHold` shows the flame until the cloud copy lands, so nobody's own
  profile is overwritten. The Account menu's **Search profile** (`SearchProfileDialog.tsx`, lazy; fields in
  `ProfileFields.tsx`) is the only place to edit it. Sample data is the Jobs page's empty-state offer, jobs only (no
  Sample track; an older one is still dropped on sign-in). One empty pattern (`EmptyState`) in Documents and the
  Pipeline. Pinned in `firstRun.test.tsx`, `todayHome.test.tsx`, `pipelineFollowUps.test.tsx`, `entryChunk.test.ts`.
- **Shell width (Adrian 2026-10-22, the portfolio's):** `src/hds-gaps/PageShell` = HDS `Container`
  at 1048 in all (Adrian 2026-10-24, was 1180) with a `clamp(1.25rem, 5vw, 4rem)` gutter (20 on a phone, 64 from 1280), so content
  is at most 920; header, tabs and every page share it. **No outlines on surfaces (HDS 0.31 soft
  surfaces):** Cards and panels are borderless (raised fill + spacing); never pass `bordered`.
  Inputs, focus, overlays, row dividers and feedback tones keep theirs. **Selected is a fill, never an
  edge (#603, #546):** a selected / current item (the Apply rail's open job, Find's `.rjb-selected`
  card) takes `--rjb-selected-fill` (base.css: HDS surface-selected in both themes, distinct from hover and raised; kept on hover;
  content-secondary stays AA), no edge marker or ring. `e2e/no-outlines.spec.ts` fails on a Card or
  container box that draws an edge, and on a rail open job that is not fill only (`e2e/selectedFill.ts`,
  also in `e2e/review.spec.ts` for Find).
- **Pipeline rows (#129):** the Pipeline uses the shell width; the job page and Documents sit at
- **Discover (#131), Live postings, Calibrate, wide sweep (#213), title filter (#223), Contracts / SAM.gov (#275),
  Find boards, Check a list, Teams, Add a company, dream company rows, the tile board and Manage track** were deleted
  in #389 (ADR 0009). Their stores stay readable (sync, Back up, CSV) and feed the v12 move; the pure helpers the
  auto-scan uses (probe, identity check, YC / GitHub / Adele leads, `companySource`, `teamRoles`) stay.
  `feed/liveList.ts` stays as the breadth guard's baseline. `/api/sam` is gone; `SAM_GOV_API_KEY` can go from Vercel.
- **Design polish (#133, `docs/specs/design-polish.md`, `docs/redesign-2026.md`):** banners are not page
  furniture: unsynced is only the Account menu's sync line (no Avatar dot), and `SampleBanner` is a one-line note under the page header. Section heads are
  `Text variant="body"` + `className="rjb-semibold"`; `title` is the page head only. `base.css` holds the
  host resets (heading/paragraph margin 0, `.rjb-semibold`, phone tab padding, 44px phone controls (`--rjb-touch`, retro quick wins 2026-11-08),
  reduced motion); secondary colour is `Text tone="secondary"`. Guards: inline `style={{`
  ceiling and no inline font size/weight in `hdsOnly.test.ts` (only lower the ceiling), lint is
  `--max-warnings=0`, composed contrast pairs in `theme.contrast.test.ts` (all at 4.5 since the 0.32.0 audit; tracked
  upstream: touch size hds#750), and `e2e/a11y.spec.ts` (axe on every route, light/dark, 1440/390; phone sweep for 44px
  targets, uppercase, running motion). `axe-core` is an exact-pinned devDependency (4.14.0).
- **Rapid apply (2026-10-17; Apply mode, To apply and Start applying are gone since #471, see Two screens):** every save (Review new, the Find box, quick-add) raises `saveNotice.notifySaved` → "Saved to Pipeline · To apply" with
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
  description; **related titles** = Design Technologist and Design Engineer (design / UX engineer; #581, Adrian
  2026-11-11) (`related` absent = on, `relatedOff` ids). **One design engineer guard,
  `tracks/designRoleGuard.ts`** (pure, word rules: hardware, electrical, RF, ASIC, PCB, civil, process (not "design
  process"), a lone "tool", mechanical-sense product design engineer, "system design engineer"…; interns too) is used
  by the related-title pass, `feeds/dsRole.ts` `isDsRole` and the scorer's `DESIGN_ENGINEER_STRONG` (a lookahead
  built from `NOT_UI_DESIGN_SOURCE`); pinned in `tracks/designEngineer.test.ts`. The check itself (`passesInclude`,
  `keepIncluded`, `relatedCounts`, `mentionsAny`) is `feed/include.ts`, so the guard stays out of the entry. The per-track
  store (`rjb_must_include`, blob **v11**, incl. `atsOff` and a Contracts track's stored `naics`, `cleanNaics`) stays
  readable and feeds the v12 move; its editors (Calibrate, Manage track) are gone. `App`'s `SystemsOnlyMigration`
  still runs `migrateSystemsOnly` on old pack tracks. Pinned in `feed/mustInclude.test.ts`, `feed/systemsOnly.test.ts`,
  `systemsOnlyNotice.test.tsx`, `tracks/designEngineer.test.ts`.
- **Track scorer (Muse handoff, 2026-10-24):** `src/tracks/` is pure and shared by the app and the sync edge
  function: `score.ts` + `track-config.ts` are ported as given; tune only through the config. `scoreForTrack` = scorer
  then `fitRejectReason` (no interns); a profile with `scorer: 'design-systems'` (onboarding sets it) or a must include
  asking for "design system(s)" (`forTrack.scorerFor`) uses it. The Feed sorts by it ("Best match"), never hides by it.
  **Server (Simplify 6/9, #387):** `sync-postings` reads each user's Sources and Search profile from their `tracker`
  blob (`tracks/plan.ts` `planFromBlob`: v12 `sources[]` + `profiles[0]`, else v11 dreams, targets, saved jobs'
  boards and the Watched tiles via the `watched_tile_urls()` RPC, + `verified.ts` for a DS user); `compileProfile`
  gives the DS config when the profile asks for design systems, else one from its titles. Boards of all 13 kinds
  (#576: plan.ts takes `boardSet` `BOARD_KINDS` + `BOARD_SLUG` on every path, so each read goes to its kind's fixed
  host; BambooHR/Rippling/Gem/Pinpoint/Breezy rows keep their own `source`, not `manual`, migration
  `20261111100000`, applied before the function is redeployed; `tracks/sourceCheck.test.ts`) and
  HN/Remotive/Jobicy are read with the app's own parsers (`src/feed/sources/*` and their imports use explicit `.ts`
  specifiers so Deno and Node load them; `inferMode` lives in `feed/mode.ts`). No `watched_companies` or `skips`
  table: the blob is the one source of truth, and the sync never writes it. Migrations `2026102410*`: postings,
  sync_log, `mark_missed_postings`, `watched_tile_urls`, the cron. Auth is `SYNC_SECRET` only. **Every 15 minutes
  (#448, Adrian 2026-11-06):** migration `20261106100000` (06:23 keeps the feeds); a 429/5xx/timeout is read once more
  after 2 s (`tracks/retry.ts`); Find's caption says "scanned N min ago" for a signed-in user (#544; was ScanStatus's "Updated N min ago")
  (`feed/serverUpdated.ts`, the newest `run` row in `sync_log`); Scan now stays manual. Pinned in
  `tracks/syncSchedule.test.ts`, `tracks/retry.test.ts`, `feed/serverUpdated.test.ts`. The Feed's
  **PostingReader** seam (`feed/postingReader.ts`): `serverReader` reads the rows, `mergePostings` keeps every browser
  posting and adds the server's, so signed in is never fewer. **Review new, signed in (2026-11-07, `feed/serverFeed.ts`
  `serverFirstReader`, in `useFeed`):** reads the server's rows through the `feed_rows` RPC (#499, migration `20261109100000`: each row's
  `match_text`, the description cut by `tracks/matchText.ts` to its head plus a window around every hit of the
  scorer's signals, contract / founding and the profile's terms, stored with its `match_key`; the browser
  sends its profile's `matchKey` and gets the full text for a row cut for other terms or with no match text;
  `matchText.test.ts` holds the rank parity; the table read is the fallback only while the RPC is missing; and `board`, so they rank as the browser's read) and skips the browser's sweep of every followed board;
  only the request's rows (its boards; feeds when it searches a title), with one progress call. No rows yet (a new
  account before its first sync) or a failed read falls back to the browser read, and a company or title added
  since the last read is read in the browser (the server has not read it yet). **Phones** (`feed/lightBoards.ts`,
  below lg, only with a titles-only inclusion check): Greenhouse boards are read as the plain list
  (`greenhouseListUrl`), then each posting the check lets in gets its description from the single-job endpoint
  (`feed/lightText.ts` `fillTexts`, ≤ 25 per board, outside the list read's 15 s timeout with its own deadline: the list is never lost, texts not read in time load on open, and the reads still queued at the deadline are given up through an
  `AbortSignal`, #499), so everything that can be listed ranks exactly as on a full
  read; an opened posting with no text fetches it (`feed/postingText.ts` `usePostingText`). Pinned in `feed/feedLoad.test.ts`.
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
  buttons. On app open (`AutoScanOnOpen`, a lazy chunk in `App`, after sync settles, **signed in only and never while the sign-in screen is open**: it waits, and a run in flight stops
  when the screen opens or the person signs out; signed out, the line says "Sign in for automatic updates." beside Scan now;
  2026-11-07, `feed/autoScanOnOpen.test.tsx`. **Load caps (same day, `feed/scanLoad.test.ts`):** the shared fetcher
  (`createFetchJson`) keeps at most `MAX_FETCHES_IN_FLIGHT` = 6 reads on the network, a run's end calls
  `liveFetchJson.clear()` (the parsed-JSON cache goes), and the probe asks a lead only the kind the board set
  (`board-keys.json`) knows for its slug, else `GUESS_KINDS` (Greenhouse, Lever, Ashby) (`kindsForSlug`); on only when `main.tsx` calls
  `setScanOnOpen(true)`, so unit tests never scan) at most every 6 h, or on **Scan now**: leads (YC hiring now →
  GitHub DS orgs → Adele → `SEED_LEADS`, empty until the seed list lands) → the probe (≤ 40 new leads a run, the
  rest queued; its limiter and cache) → the **identity check** (`feed/identity.ts`, #417: one ATS only, and the
  website's domain must match the slug or name; else unconfirmed, shown but never read, **and for one run only** (discovery noise, 2026-11-08: the next run drops a still-unconfirmed row unless followed or ignored; its key stays probed); a lead whose careers site is Workday / SuccessFactors / Taleo (`feed/unsupportedAts.ts`, hand-kept by name) is never probed and is listed in Scan details as "unsupported board") → the Feed's
  `PostingReader` over followed + confirmed found boards and every feed (Remotive / GitHub budgets hold) → the
  inclusion check (the profile's must include, else "design system") and **remote only** (Adrian 2026-10-28:
  `remoteOnly`: remote keeps, on-site/hybrid drops, no mode and no city keeps with `remoteUnstated`, "Remote not
  stated"). Kept per browser: `rjb_autoscan` (last run, lead queue, probed, found companies) and
  `rjb_autoscan_postings` (≤ 300, bodies cut to 1500). A run cut short resumes on the next open. Review new reads
  through `scanReader` (live read + the scan's postings, remote only, never an ignored company's). UI in
  `AutoScanViews.tsx` and `FindHeader.tsx` (**Adrian 2026-11-08: no status text above Browse / Deck.** Find's short
  header has one caption, "4 new · scanned 2 h ago", and its More menu holds Scan now / Stop scan, signed out only (the
  server syncs every 15 minutes signed in), #544; `ScanStatus` is gone). The scan's line ("Updated N min ago" from the last `sync_log` run signed in, "Last scanned hh:mm · …"
  signed out), the sources that didn't answer and the "not shown" counts are **Scan details**, a closed row at the end of
  the Account menu's Search profile (#549; `ScanDetails.tsx`, in the Search profile's lazy chunk; Review new writes what it read to `feed/scanDetails.ts`); a screen reader still hears
  Review new's status. Pinned in `autoScanViews.test.tsx`, `review.test.tsx`, `todayHome.test.tsx`,
  `e2e/find-signed-in.spec.ts`) and
  `NewCompanies` (Follow → the board joins the Sources, Ignore → `muteCompany`, each with Undo), the Companies
  dialog's **Found** list since #618 (`newCompanies(useScan().state)` names the segment "Found (N)", shown only while N > 0; its
  Undo shows in the dialog's footer, `DialogNotice` + `noticeHost`). With
  no Search profile yet the scan searches the design-system titles (`searchDefaults.ts`). Pinned in `feed/autoScan.test.ts`, `feed/identity.test.ts`, `autoScanViews.test.tsx`,
  `review.test.tsx`; E2E `e2e/auto-scan.spec.ts` (signed out: no scan on open, Scan now finds the postings).
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
- **Privacy and terms (#43, #47; a dialog since #471 slice 4):** one HDS `Dialog` (`LegalPage.tsx`,
  "Privacy and terms") with two HDS Tabs, Privacy policy and Terms of use, over the open page:
  `?legal=privacy|terms` (`openLegal`; a tab swaps in place, Back closes). Old `#/legal/<doc>` links
  redirect to it in place. Menu item "Privacy and terms", last before Sign out. The text is data in
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
  `documents.restoreDocument`), never opening a page (#593). Review new's Skip and Not this company say so with Undo too. Inside a modal dialog the notice is
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
  so a long unbroken title never runs under the link or pushes it off screen). The Apply list's rows (the
  lg column and the All jobs sheet) have none since #543: the job page's header has it. Its
  target overflows the title's line (`.rjb-posting-link` in `base.css`), so rows keep their rhythm,
  and is stacked above the text there, so all of it takes the tap; 44x44 on a phone. Unsaved listings (Find's Browse cards) have no page:
  below lg their title is the link out, with HDS's external icon (#544; at lg it selects the posting). Apply mode keeps Open application.
  Pinned in `PostingLink.test.tsx`, the surface suites and `e2e/posting-links.spec.ts` (hit-tests
  every target: each pixel takes the tap, no overlap with another control; long titles at 390).
- **Company logos (2026-10-22):** `CompanyLogo.tsx` is an HDS `Avatar` per company (the To apply stack, Pipeline table and cards, job header, job rail, Company page, Companies and dream rows): letter first, the logo only once `new Image()` has loaded it at 16px or more (lazy, no referrer; errors and DuckDuckGo's tiny placeholder keep the letter). `companyLogo.ts` is the one table-tested rule for the domain (company website first, then the posting's host; never a job board, ATS or aggregator host, `*.example.com`, localhost, IPs). Icons come from `icons.duckduckgo.com` (`img-src`, `legal.ts` THIRD_PARTIES, `csp.test.ts`); e2e specs abort that host, so baselines show letters.
- **Export links (2026-10-22):** one `ExportLinksHost` dialog (mounted in `DataToolsProvider`, open
  scope in `exportLinks.ts`) opened from the Account menu's Data dialog only (after Export CSV; #416 took it off the Jobs
  panel, #550 moved it into Data) on **All saved jobs**; its **This view** scope is the Jobs list as filtered (`visibleJobs`). Format Links only / With title and company; read-only
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
  past its day while Saved). Closed jobs collect in the **Recently closed** view (#541; the Closing soon / Closed
  filters went with the Status select), and To apply lists the soonest closing first. Saved jobs closing in the window are in Next 7 days ("Applications close · …"), no longer in Follow
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
  (`rjb_signin_request`, written by `sendLink`); any other link shows "Sign in as x@y.com?" (Cancel drops it; a full-screen step of the sign-in layout since 2026-11-08: `LinkConfirmScreen.tsx`, lazy, in `SignInShell.tsx` with the same brand at the same place as the form and "Check your email"; Sign in takes the link up at once, shows "Signed in", then the flame and wordmark move onto the app bar's logo in 350 ms, a fade under reduced motion). Then the merge guard: an account this device has no `rjb_sync_base` for, while the <!-- pii-allow -->
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
- **Continue with Google (#482):** **hidden until the Supabase Google provider is on** (`account/googleSignInFlag.ts`
  `GOOGLE_SIGN_IN_ON = false`, 2026-11-07: with the provider off the button led to Supabase's "Unsupported provider" 400;
  the test setup resets it, its suites turn it on). When on, the sign-in screen's first control (`SignInDialog.tsx`, HDS secondary `Button`
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
    and calls `onProgress` as each answers; Review new repaints every second (was 250 ms, 2026-11-07) with "Read N of M boards".
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
    status, never marks closed on a failure. Cache in `rjb_liveness`, not synced. **Runs on open (#602, Adrian
    2026-11-11):** `LivenessViews.tsx` `LivenessOnOpen`, a lazy chunk App mounts like `AutoScanOnOpen` (behind
    `scanOnOpenEnabled()`): once sync settles, signed in only, never behind the sign-in screen, once per page load
    (`autoLivenessCheck`), each board read once, a job checked in the last 6 h not asked again (`dueJobs`). **No
    manual action anywhere** ("Check which are still open" is gone from the lg rail and the phone's Filters). **One
    quiet place (#601):** the Apply list's status line ("To apply · 21 jobs · 1 closed on the board",
    `useClosedOnBoard`, over the Remote only pool); no page-top line, no "Checked live" date, no second link to a
    closed job (its Closed badge on the card and header says it). Pinned in `liveness.test.tsx`.
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
  entry without it is asked again. BambooHR, Rippling, Gem, Pinpoint and Breezy HR are board kinds (the server sync and rotation read them too since #576; shape fixtures in `src/tracks/fixtures`)
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
