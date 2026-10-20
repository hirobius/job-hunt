# ADR 0008 — Sync every user-edited store: blob v5

- **Status:** Accepted
- **Date:** 2026-10-15
- **Decider:** Adrian ("whatever the user is manipulating data-wise we should be making it persistent")

## Context

Blob v4 (#99) synced jobs, snippets and set-aside tiles. Four things the user edits lived only in
this browser's `localStorage`: outreach targets (`rjb_targets`), saved searches (`rjb_feed_filters`),
the evidence text (`rjb_radar_evidence`) and the work mode per track (`rjb_ui_mode:<id>`). Sign-out
wipes every `rjb_` key, so signing out, or opening a second device, lost them.

## Decision

1. **Blob v5** adds `targets`, `filters`, `evidence` and `modes` (the `tracker` row stays one JSON
   blob; no schema change). All are optional on read, so v1 to v4 blobs still read with the new fields
   empty. The backup format id stays `app: 'apply-board'`; backups gain the same four optional fields
   (still `v: 1`).
2. **Merge rule per shape.** First sign-in (seed): targets union by login (case-insensitive) per
   track, saved searches union by name per track, modes union by track; cloud wins a shared key, a
   local-only entry is never dropped. Evidence is one text: if both sides have different text, both are kept (the cloud's, a `--- From this device ---` line, then this device's); otherwise the non-empty one.
   Later pulls (refresh): the cloud copy wins like every other field, so an emptied evidence box or a
   removed target propagates.
3. **Pre-v5 guard.** `SyncData.sourceV` records the version read. A refresh against a pre-v5 cloud
   copy (another device still on an old client rewrote the row) keeps this device's v5 fields instead
   of treating the missing ones as deletions. The next push upgrades the row.
4. **Each store owns its seam:** `getAll*` / `replace*` / `merge*` / `use*` (`feed/targets.ts`,
   `feed/savedFilters.ts`, `radar/evidenceStore.ts`, and the new `trackModes.ts`, split out of
   `discoverContext.ts` so the blob module need not import the curation layer). `CloudSyncProvider`
   subscribes to them, so a change pushes on the same 500 ms debounce as jobs, and a pull calls
   `replace*` so the open UI re-renders. `DataToolsProvider` backs up and restores them the same way.
4a. **An old-deploy tab can strip the v5 fields** (its v4 `writeBlob` omits them). After a merge
   where the cloud copy is older than v5, the provider pushes at once instead of marking local as synced.
5. **Sign-out** still wipes this browser, which is safe because the data comes back on sign-in, but
   only after the blob is flushed: sign-out cancels the push debounce and awaits a push if local
   differs from the last successful one. `pushNow` records "synced" only on success, so a failed
   push stays dirty (refresh retries it first). If the push fails, sign-out confirms before wiping.
   The older warning for track writes not yet in the cloud stays.
6. **Bounds.** Evidence is capped at 20,000 characters (trimmed on write and read, with a note in the
   editor). A track's targets, saved searches and mode are dropped when the track is explicitly
   deleted (`src/trackData.ts`). There is deliberately **no sweep after sync** for unknown tracks:
   another device's track upload can still be in flight while its blob already reached the cloud, so a
   sweep would delete live data across devices. Orphans from other paths are small and harmless.

## Consequences

- Left local on purpose: caches (`rjb_liveness`, `rjb_probe`, `rjb_gh_cache`, `rjb_gh_budget`,
  `rjb_feed_remotive`, `rjb_curation_pending`, `_synced_at`) and device UI prefs (`rjb_color_mode`,
  `rjb_ui_*`, `rjb_sync_banner_hidden`, `rjb_active_category`, device-local pins).
- Work mode used to be per device; it now follows the account, so changing it on one device changes
  it on the next after a pull.
- Last write wins per store on refresh; two devices editing the same store between pulls can lose the
  older edit. Acceptable for single-user lists, and the seed merge never loses on first sign-in.
- Entries are capped as before (500 targets and 12 saved searches per track); the blob stays small.

## Addendum (2026-10-17): blob v8, Recently removed

Blob v6 is the Application kit (rapid apply) and v7 the wide sweep's titles (#213), both already
in production. Removing a job is no longer
permanent: `src/trash.ts` keeps removed jobs (whole, with to-dos, notes and interviews) for 30 days
in `rjb_trash`, and **blob v8** carries them as `trash` under the same rules as the v5 fields:
optional on read, seed merge unions by job URL (cloud wins a shared job, and a job saved on either
side is dropped from the trash), refresh lets the cloud win, and a refresh against a pre-v8 cloud
copy (including a v7 one written by the production deploy) keeps this device's trash and re-uploads
it. Sample jobs never go up. Entries older than 30 days drop on every read. Backups carry the trash
too (optional on restore; older backups lack it).

Restoring a job whose posting was saved again since never drops either copy: the removed copy's
notes, to-dos and interviews are merged into the saved one (`mergeRemovedInto`) and the user is
told so.

## Addendum (2026-10-17): blob v9, dream companies

Dream companies (`rjb_dreams`, `src/feed/dreams.ts`) follow the same pattern: per track, union by
company on the seed merge (cloud wins on a shared company), cloud wins on refresh only from a v9+
copy (an older copy keeps this device's), dropped with their track, included in backups. Each keeps the
posting ids seen at its last check (the best 300) so "Check dream companies" can say what is new.

v6 is the Application kit (rapid apply), v7 the wide sweep's titles (#220) and v8 the trash (#214),
so dream companies take v9.

## Addendum (2026-10-19): blob v10, Documents

Documents (`rjb_documents`, `src/documents.ts`, #226) follow the same pattern: optional on read
(older blobs load with none), seed merge unions documents by id and each shared document's
Versions by id (a Sent mark on either side stays), cloud wins on refresh only from a v10+ copy (an
older copy keeps this device's), included in backups. A sample job's Documents never go up or into
a backup. Normalizing on read keeps at most one Sent Version per kind per Job (the earliest sent).
Delete forever in Recently removed drops a job's Documents; a job that ages out of the trash leaves
its Documents as harmless orphans (no sweep).

## Addendum (2026-10-20): deletes stay deleted (#219)

The seed merge runs on every page load with a session, not only on a first sign-in, so a plain
union brought back whatever another device deleted (a removed job, a Q&A answer, a target, a saved
search, a dream company, a document) and anything this device deleted before its push landed.
Each device now keeps a **sync base** (`src/syncBase.ts`, `rjb_sync_base`, per account, never
synced, wiped on sign-out): the keys of every keyed entry it last knew to be in the cloud, written
after each pull and each successful push. With a base the seed merge is three-way: an entry the
base knew that is missing on either side was deleted there and is dropped; entries new on either
side are kept. Without a base (first sign-in on this device) it is the old union, so data made
while signed out is never lost. The blob format is unchanged (no version bump, no tombstones).
Covered: jobs, Recently removed, snippets, set-aside tiles, kit answers, targets, saved searches,
dream companies and Documents. Known limit: re-adding on a stale device the very same entry that
another device deleted (same job URL, same answer id) loses the re-add.
