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
   local-only entry is never dropped. Evidence is one text: the cloud's if non-empty, else local.
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
5. **Sign-out** still wipes this browser, which is now safe for these stores: they come back on the
   next sign-in. The only sign-out warning left is for track writes not yet in the cloud.

## Consequences

- Left local on purpose: caches (`rjb_liveness`, `rjb_probe`, `rjb_gh_cache`, `rjb_gh_budget`,
  `rjb_feed_remotive`, `rjb_curation_pending`, `_synced_at`) and device UI prefs (`rjb_color_mode`,
  `rjb_ui_*`, `rjb_sync_banner_hidden`, `rjb_active_category`, device-local pins).
- Work mode used to be per device; it now follows the account, so changing it on one device changes
  it on the next after a pull.
- Last write wins per store on refresh; two devices editing the same store between pulls can lose the
  older edit. Acceptable for single-user lists, and the seed merge never loses on first sign-in.
- Entries are capped as before (500 targets and 12 saved searches per track); the blob stays small.
