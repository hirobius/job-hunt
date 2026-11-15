# Data, storage and sync

The store, the synced blob and its versions, first run and what a new user sees.

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

- **Design-systems only (Adrian 2026-10-29):** content is design systems and nothing else. The one starter pack
  is Design Systems (`curation/starterPacks.ts` `STARTER_PACKS`; `radar/directory.ts` `DIRECTORY_BY_PACK` /
  `TARGETS_BY_PACK` keyed `designsystems` only; `jobsData.GROUPS` = `ds-brief`, `ds-watch`); the sample jobs are
  design-systems roles. The trades / Spokane / apprenticeship content, the Implementation Consulting, ServiceNow and
  Skilled Trades packs, `curation/localize.ts` (Spokane link rewriting), the `'sam'` source and the non-design
  `companySource` / `teamTopics` branches are deleted. Older accounts' other tracks stay stored (curation tables, v11
  stores, sync, Back up, CSV) but never surface: the v12 move reads design-systems tracks only. Guard:
  `src/dsOnly.test.ts` (pack ids, directory keys, curated groups, no `sam` source, and a scan of app source for
  Spokane / welding / sheet metal / apprenticeship / ServiceNow / SAM.gov with a commented allow-list).

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

- **Clean first run (Adrian 2026-10-22):** a new user sees nothing they didn't create. Placeholders are
  the field's own name ("Job title", "Job link", "Company"), never an "e.g." or a made-up name
  (`placeholders.test.ts` scans the source). Empty sections hide (Dream companies, the Pipeline's
  panels). The snippet store starts **empty** (`copyDeckStore` no longer falls back to the starters), so
  no starter messages are migrated in on a first run or a new device; `AddStarterMessages`
  (`StarterMessages.tsx` → `addStarters.ts` → `restoreStarterOutreach`) adds them in one tap from
  Documents' empty state ("No documents yet": Add starter messages | Start from scratch), the
  follow-up dialog (an empty message box until then). Sample
  data stays opt-in and adds no messages. The Search profile form prefills only the design-system titles
  (onboarding, #388) and adds nothing else the user did not finish. Documents'
  empty state and Add starter messages wait for `settled` and the snippet move (a new device's messages arrive first). Pinned in `firstRun`, `emptyStates`, `documentsLibrary`,
  `pipelineFollowUps`, `rapidApply`, `copyDeckStore`, `syncBlob` tests; e2e seeds call `addStarters`.
