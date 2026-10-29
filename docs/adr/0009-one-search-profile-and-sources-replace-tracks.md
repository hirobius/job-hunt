# ADR 0009 — One Search profile and one Sources list replace tracks and their screens

- **Status:** Accepted
- **Date:** 2026-10-29
- **Decider:** Adrian (the simplify spec, design C "Today home", PR #381; slices #382–#390)

## Context

By October 2026 the app had grown a track per job search, each with its own titles, ATS roles,
must include, sweep list, saved searches, work mode, watched-board tiles, dream companies and
outreach targets, and a Companies tab of manual tools over them: Live postings, Calibrate, Find
boards, Check a list, Teams, Manage track, tile boards and a SAM.gov Contracts track. Adrian's one
goal is to collect every design-system opening and apply from one list. The auto-scan (#415) and
the Feed with Review new (#386) now do the discovery with no buttons, so the screens were
unreachable (`route.ts` already sent `#/discover/*` to Today).

## Decision

1. **The app reads one Search profile and one Sources list (blob v12)**, not tracks. Review new,
   the auto-scan, the Find box and the Account menu's Companies list read and write
   `rjb_profiles[0]` (`src/profile.ts`) and `rjb_sources` (`src/sources.ts`). Skips are the synced
   `decided[]` (`src/decided.ts`); "Not this company" mutes a Source; saving a posting follows its
   board as a Source. The Account menu's Search profile edits the profile (titles, remote only or a
   place, leave out); there is no other profile editor.
2. **Onboarding is the Search profile form** (#388): design-system titles and the broad ATS terms
   prefilled, remote only by default, optional leave out; Finish follows the starter design-system
   companies (`searchDefaults.ts`: the seed board list) and opens Today. Sample data stays opt-in.
3. **The old screens are deleted** (#389): DiscoverView and every tool under it, the tile board,
   Manage track, Calibrate, the sweep UI and the Contracts track with `/api/sam`. Every source
   adapter, the probe and its identity check, the discovery helpers the scan uses, the seed list
   and the Search elsewhere link builders (`jobsData.ts`) stay.
4. **Stored data stays readable.** The v11 stores (curation tables, sweep titles, must include
   with its stored NAICS list, dreams, targets, saved searches, modes, evidence) keep their
   sanitizers, sync, backups and CSV. The v12 move (`v12Migration.ts`) still turns them into the
   profile and Sources on every load, add-only. The curation tables are not dropped here; that
   waits until no client older than this one can write them (#390's "after 30 days").

## Consequences

- A second profile, or a non-design search, is a data change (`profiles[]` holds up to four) with
  no UI; adding one later needs a profile switcher, not tracks.
- `feed/decided.ts` used to keep its own `{ decided, muted, followed }` object under the same
  `rjb_decided` key that `src/decided.ts` syncs as a list, so every pull dropped skips, mutes and
  follows. It is now a view over the synced stores, and `moveLegacyDecided` (run at start in
  `main.tsx`) moves an old object over once.
- `feed/liveList.ts` outlives Live postings on purpose: it is the baseline the breadth guard
  (`feed/breadth.test.ts`) holds the Feed to.
