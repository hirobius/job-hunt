# Spec: Role Radar in RoleForge — Phase 0 (capability map)

Status: **first pass built** (2026-10-15). Adrian made Role Radar an exception to the feature lock
("one of the primary projects that will be on my portfolio") and asked for a first pass from this
spec. It uses the recommended answers to Q1–Q4 below: browser scan, rules, local evidence, and the
engine built into Live postings. The first pass had a separate Radar view; the second pass removed
it, per Adrian's direction below.

## Where this comes from

The "Role Radar" artifact (researched 2026-10-12) is a one-off report. Its data is hard-coded, but
the method behind it is the part worth bringing into RoleForge:

1. Scan the public job APIs of **several hundred company boards** (Greenhouse, Lever, Ashby), plus
   targeted searches.
2. Keep a role only if it is **still live on the employer's own board today**. Drop closed or
   unreachable roles, and say why.
3. Filter by **location / work mode**: remote US or the Pacific Northwest.
4. Tier each role **Strong / Stretch / Reach**, with a **Fit** note and a **Gap** note that cite
   only the user's public evidence.
5. Roll up **patterns** across all postings: "~21/26 ask for X". Split them into "covered by
   evidence" and "thin or not shown", and name the portfolio work that closes the biggest gaps.
6. **Add to tracker** in one tap. The artifact already uses RoleForge's `?add=` link.

## What RoleForge already has (reuse, don't rebuild)

| Artifact step | RoleForge today |
|---|---|
| Board APIs (1) | `src/feed/sources/ats.ts` reads Greenhouse, Lever and Ashby boards. The live postings feed caps a search at `MAX_BOARDS = 25`, and the only boards it reads are the user's "Watched companies". |
| Location / mode filter (3) | `LocationControl` + `inferMode` (#58) |
| Tiers (4) | `Job.verdict` is already `match / stretch / reach` (#60). The rules-based JD screener sets it (#61). |
| Add to tracker (6) | `addJobDetailed` from the live postings feed, and the `?add=` quick-add |

So Role Radar is mostly **live postings at scale**, plus four new things:
- a board directory
- liveness re-checks
- fit and gap scored against evidence
- demand patterns

## Capability map

| Module id | Responsibility | Depends on |
|---|---|---|
| `board-directory` | A curated, editable list of company boards (ATS + slug), well past the 25 watched companies. Seeded from the artifact's scan. | — |
| `scan` | Batch-reads the directory with a concurrency limit and per-board failure isolation. Filters by role terms + location/mode. Records what was dropped and why (closed, unreachable, wrong location). | `board-directory` |
| `liveness` | Re-checks that a saved job or posting is still listed on its board. Stamps "checked live <date>" and flags closed roles in the Pipeline. | — (reuses `sources/ats`) |
| `evidence-profile` | The user's proof points: skills, each tied to a link (repo, npm, docs, portfolio). This is the only input that Fit/Gap may cite. | — |
| `fit-gap` | Scores a posting against the evidence profile: Strong / Stretch / Reach, plus a Fit note (asks matched to evidence) and a Gap note (asks with no evidence). Rules-based unless Q2 says otherwise. | `evidence-profile` |
| `demand-patterns` | Rolls up a scan: how many postings ask for each skill, split into covered vs thin, and the biggest gaps worth closing. | `scan`, `fit-gap` |
| `radar-view` | The UI: tiered list with Tier + Mode filters, Fit/Gap on expand, Add to Pipeline, and a patterns panel. Lives in Discover next to Live postings (see Q4). | all of the above |

**Build order:** `board-directory` → `scan` → (`liveness` ∥ `evidence-profile` → `fit-gap`) →
`demand-patterns` → `radar-view`.

`liveness` is independent. It could ship first as a small Pipeline win: a "still open?" check on
saved jobs.

## Assumptions (correct any of these)

1. **No AI.** Fit/Gap is deterministic keyword rules against the evidence profile, like the JD
   screener. The artifact's notes were written by a model; RoleForge removed AI in #54.
2. **Board APIs only.** The artifact's "targeted web searches" are out of scope: they need a
   search API key and a server.
3. **Keyless and CORS-open sources only.** These are the ones `src/feed` already uses. Any new
   host goes in the CSP `connect-src` and `csp.test.ts`.
4. **Track-agnostic.** Role terms come from the active track, not hard-coded design-systems terms,
   so a trades user gets a radar too.
5. **HDS only, graphite.** The artifact's own colours and fonts don't come across.

## Open questions for Adrian

- **Q1. Where does the scan run?**
  - (a) In the browser, on demand. Free, but a few hundred boards at 2–3 MB each is slow, so it
    would be capped at about 60–100 boards per run.
  - (b) A scheduled server job (Vercel cron or a Supabase function) that writes results for the
    app to read. Covers the full directory, but adds a server, storage and running costs.
  - *Recommend (a) now; (b) only if (a) proves too slow.*
- **Q2. Fit/Gap notes: rules or AI?** Rules give terse notes ("matches: tokens, a11y · missing:
  Storybook, React Native"). The artifact's prose-quality notes need a model, which reverses #54
  (or waits for #151, bring-your-own-agent). *Recommend rules.*
- **Q3. Where does the evidence profile live?**
  - Local only: no sync change.
  - Synced: needs a sync-blob or new-table change, which is sync code and your call.
  - *Recommend local first, synced later.*
- **Q4. New view or extend Live postings?** *Recommend extending Live postings:* add a "Radar"
  mode with a tier/patterns layout over the same sources, rather than building a second feed.
- **Q5. Feature lock.** The last orchestrator round froze new features ("tightening, not adding").
  Is Role Radar the exception, and does it start before or after the rest of #115?

## Where each module lives (after the second pass)

| Module | Where | State |
|---|---|---|
| `board-directory` | `src/radar/directory.ts` | 23 starter boards (all answered live on 2026-10-15). Live postings reads them after the track's watched boards. |
| `scan` | `src/feed/fetchFeed.ts` | Board reads run 6 at a time, capped at 100 boards. Each failing board is named in the feed's source warning. |
| `evidence-profile` | `src/radar/evidenceStore.ts` + `EvidenceEditor` (`src/FeedFit.tsx`) | Local only (`rjb_radar_evidence`): "Skill: proof (link)" per line |
| `fit-gap` | `src/radar/fitGap.ts` | 15-ask catalog + the user's own skills |
| `demand-patterns` | `src/radar/patterns.ts` + `PatternsSummary` | Covered vs thin, most-asked first |
| `radar-view` | Folded into `src/LiveFeedPanel.tsx` | Fit badge, Fit and gap, "Strong fit" filter. Save sets the job's fit. |
| `liveness` | — | Not built yet |

**Tier thresholds (`tierOf`):** Strong is at least 3 asks covered and 70% or more of the asks the
posting makes. Stretch is 40% or more, or a single covered ask. Everything else is Reach.

A real scan of 35 boards for "design systems" found 12 title matches (3 Strong, 9 Stretch) and
166 more that only mention it in the description.

**Known limits of the first pass:**
- The ask catalog is software and design-systems shaped. A trades track still gets tiers from its
  own evidence skills, but no default catalog.
- The starter directory is the same for every track.

## Direction after the first pass (Adrian, 2026-10-15)

> "I didn't want an entirely new UX button, more like merge how smart the logic is under the hood
> of scanning and finding new jobs and populating your discover … I am just trying to supercharge
> all of the different lanes in which jobs can be sourced and fed to the user so they are able to
> turn over every stone possible and really narrow down and explicitly target their search."

So the next pass folds the radar's engine into Discover's existing lanes instead of a separate
Radar view:
- The board directory joins the Live postings scan.
- Fit/Gap and tiers show on the posting rows.
- Patterns become a summary of the feed.

After that, more sources: other job APIs, plus whether Upwork or similar platforms can feed
design-systems contract work.

## Second pass (2026-10-15)

- **The separate Radar view is gone.** Live postings now:
  - reads the starter directory after the track's watched boards, 6 at a time, up to 100 boards
  - shows "Your evidence"
  - once evidence is in, adds a fit badge, Fit and gap, a "Strong fit" filter and "What these
    postings ask for" to every posting
- **The hidden-jobs Google lane (ATS search) widened:**
  - hiring systems: 8 → 18
  - a new "Freelance, startup and remote boards" set: Upwork, Contra, Wellfound, YC, Remote OK,
    Himalayas, Jobicy, WWR, Working Not Working, Dribbble
  - a "Contract only" switch
  - "Search the top N at once" stays under Google's 32-word limit
- **New APIs (Jobicy, Himalayas, Remote OK, Workable, Recruitee): not added yet.** This session's
  network blocks those hosts, so their CORS and response shapes can't be checked. See
  `docs/research/job-sources.md`.

## Next gate

After Adrian answers Q1–Q5:
1. One spec per module, in build order (`docs/specs/role-radar-<module-id>.md`).
2. Then a plan and tasks as GitHub Issues under one epic.
