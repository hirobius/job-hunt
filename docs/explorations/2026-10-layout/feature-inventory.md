# Feature inventory (2026-10-17)

This lists every user-facing function in the app on `main` (785e613). It was checked against the code and tests, not the docs. It feeds the Figma page "C · v2 — feature inventory", where each function gets its own static pattern so Adrian can choose where it lives in direction C.

**Status key**
- **Works:** wired into the UI and covered by tests.
- **Partial:** wired, but something is missing or reported broken.
- **Placeholder:** the logic exists but there is no UI.
- **Off:** behind a flag.

**Unverified live** means it was built from a documented API shape but never checked against the real host.

**Counts:** 86 functions. Works 82 (7 of them unverified live) · Partial 2 · Placeholder 1 · Off 1.

Tests are in `src/**.test.ts(x)` beside each file unless noted.

## 1. Find

| # | Function | What it does | Entry | Key files | Status |
|---|---|---|---|---|---|
| F1 | Apply now (featured sections) | The track's curated links and company pages, as tiles | `#/discover/apply`, section tabs `#/discover/<groupId>` | `DiscoverView.tsx` GroupPanel, `TileGrid.tsx` | Works |
| F2 | Title search | Builds search links for a role title on Indeed, LinkedIn, ZipRecruiter, Google Jobs and Snagajob; recency + contract filters | `#/discover/titles` | `DiscoverView.tsx` TitlesPanel, `jobsData.ts` BOARDS | Works |
| F3 | ATS search | Google `site:` searches across Greenhouse, Lever, Ashby, Workday and others, plus community boards | `#/discover/ats` | `DiscoverView.tsx` AtsPanel, `jobsData.ts` | Works (community-board clauses unverified live) |
| F4 | Live postings | Real openings pulled at view time, phrase-matched and ranked | `#/discover/live` | `LiveFeedPanel.tsx`, `feed/fetchFeed.ts`, `feed/match.ts` | Works |
| F5 | Source: HN Who is hiring | Latest 2 monthly threads + Freelancer thread (contract) | inside F4 | `feed/sources/hn.ts` | Works |
| F6 | Source: Remotive | Remote jobs, capped at 4 calls a day per browser | inside F4 | `feed/sources/remotive.ts` | Works |
| F7 | Source: Jobicy | Remote jobs | inside F4 | `feed/sources/jobicy.ts` | Works, unverified live |
| F8 | Source: Remote OK | Remote jobs, needs attribution | inside F4 | `feed/sources/remoteok.ts`, `SOURCE_ENABLED` | **Off** (legal notice unread) |
| F9 | Source: company boards | Greenhouse, Lever, Ashby, Workable and Recruitee boards for watched companies, 6 at a time with "Read N of M" | inside F4 | `feed/sources/ats.ts` | Works (Workable and Recruitee unverified live) |
| F10 | Per-source retry | Retry one failed source; skeleton, then "still trying" at 10 s | inside F4 | `hds-gaps/AsyncState.tsx`, `feed/mergeFeed.ts` | Works |
| F11 | Targeting | Leave-out terms, level from title, pay floor; "hidden by" counts | F4 Refine | `feed/targeting.ts` | Works |
| F12 | Saved searches | Name and reuse a feed search per track (synced) | F4 "Save search" | `feed/savedFilters.ts` | Works |
| F13 | Openings / Companies view | Group live results by company (`?view=companies`) | F4 toggle | `feed/byCompany.ts`, `hashView.ts` | Works |
| F14 | Fit from evidence | Paste your evidence; postings get Strong fit / Stretch / Reach and the missing asks | F4 Refine "Your evidence" | `FeedFit.tsx`, `radar/fitGap.ts`, `radar/evidenceStore.ts` | Works |
| F15 | Watch a company | Turns a board URL into a watched tile, read live in F4 | F4 Refine, F13, F17, F18 | `feed/watchlist.ts` | Works |
| F16 | Suggested companies | "Add suggested companies (N)" from the track's pack directory | F4 Refine | `radar/directory.ts` | Works |
| F17 | Find boards | Paste up to 500 companies, or load a YC batch; probe each for a public board; Watch all; Retry unknown; hiring-only toggle | `#/discover/boards` | `FindBoardsPanel.tsx`, `feed/probe.ts`, `feed/discoverBoards.ts`, `feed/yc.ts` | Works (YC mirror unverified live) |
| F18 | Teams (design-system orgs) | Finds design-system orgs via GitHub search and checks each for a board; Save as target / Watch board | `#/discover/teams` | `OutreachTargets.tsx`, `OutreachRows.tsx`, `feed/dsOrgs.ts`, `feed/githubBudget.ts` | **Partial**: GitHub unverified live, and design-system only (on every track, including Consulting) |
| F19 | Outreach targets list | Saved companies to contact, per track (synced) | F13, F18 | `feed/targets.ts` | Works |
| F20 | Find more like this | From a job, jumps to Title search seeded with its title | Job row menu | `discoverSeed.ts` | Works |
| F21 | Location + work mode | One popover sets where and how (Any/Remote/Hybrid/On-site), per track | Discover header | `LocationControl.tsx`, `discoverContext.ts`, `trackModes.ts` | Works |
| F22 | Tile details | Chips parsed from meta, Details disclosure, tap-to-call | F1 tiles | `TileGrid.tsx`, `tileMeta.ts` | Works |
| F23 | Set aside / restore tile | Hide a tile from the board (synced) | F1 tiles | `tileTriage.ts`, `tileState.ts` | Works |

## 2. Save

| # | Function | What it does | Entry | Key files | Status |
|---|---|---|---|---|---|
| S1 | Quick add | Paste a link; the title is derived from the URL | Today field | `TodayView.tsx`, `store.ts` addJob | Works |
| S2 | Save a tile | A tile becomes a job and leaves the board, with a toast | F1 "Save" | `TileGrid.tsx`, `store.ts` addJobDetailed | Works |
| S3 | Save a posting | A live posting becomes a job, carrying its mode and meta | F4 "Save" | `feed/toJob.ts` | Works |
| S4 | Quick-add URL params | `?add=`, `?applied=`, `?status=&u=`, `&t=` for the iOS shortcut, bookmarklet and Gmail links | URL | `App.tsx` | Works |
| S5 | Dedup | One job per URL (dedupKey); a job id is its hash | everywhere | `store.ts` jobIdOf, `mergeByKey.ts` | Works |

## 3. Pipeline

| # | Function | What it does | Entry | Key files | Status |
|---|---|---|---|---|---|
| P1 | Pipeline list | Table at ≥ lg, cards below | `#/queue` | `TrackerView.tsx`, `JobsTable.tsx`, `JobListCard.tsx` | Works |
| P2 | Status filter | Active (default) · Saved · Applied · Interviewing · Offer · Rejected · Retired; shown as a clearable chip | Pipeline toolbar | `pipelineView.ts` | Works |
| P3 | Search | Text search over jobs | Pipeline toolbar | `pipelineView.ts` | Works |
| P4 | Sort | Recent · Follow-up due · Best fit · Applied date · Status · Salary · A–Z; sortable headers | toolbar / table | `jobSort.ts`, `jobRow.ts` | Works |
| P5 | Row next step | One action per row: Mark applied or Log follow-up | row | `JobRowParts.tsx` | Works |
| P6 | Row menu | Open posting · Pin/unpin priority · Retire/restore · Find more like this · Remove | row "…" | `JobRowParts.tsx` | Works |
| P7 | Priority star | Pins a job to the top of the Pipeline | job header, row menu | `JobHeader.tsx` | **Partial**: Adrian reports the header star doesn't visibly work (fix in PR #214) |
| P8 | Job page | Header + tabs: Overview · Screening · Interviews · To-dos | `#/queue/<jobId>` | `JobPage.tsx` | Works |
| P9 | Job rail | Desktop list beside the job | job page ≥ lg | `JobRail.tsx` | Works |
| P10 | Overview facts + edit | Facts list; "Edit details" disclosure | Overview tab | `JobOverview.tsx`, `jobFacts.ts` | Works |
| P11 | Research links | Glassdoor and LinkedIn company search | Overview tab | `jobFacts.ts` researchLinks | Works |
| P12 | Remove job | Remove with confirm and toast (no trash or undo) | Overview bottom, row menu | `store.ts` removeJob | Works |
| P13 | Liveness check | Re-reads saved board jobs; flags "Closed on the board"; never changes status | Pipeline + job page banner | `feed/liveness.ts`, `LivenessViews.tsx` | Works |
| P14 | Retire | Archive without rejecting | row menu | `store.ts` | Works |

## 4. Apply

| # | Function | What it does | Entry | Key files | Status |
|---|---|---|---|---|---|
| A1 | Mark applied | Sets Applied plus the date; drops out of Active | row, job header | `store.ts` setStatus | Works |
| A2 | JD screener | Paste a JD; rules flag SQL, coding loop, clearance, years, travel, mode; suggests a verdict; one click applies it | Screening tab | `jdScreener.ts`, `JdScreenPanel.tsx` | Works (rules only, no AI) |
| A3 | Screening editor | Verdict, mode, travel %, applicants, blockers, angle | Screening tab | `ScreeningEditor.tsx`, `screening.ts` | Works |
| A4 | Use template | Pick a template, fill it from the job, copy | Overview tab | `UseTemplate.tsx`, `templateCopy.ts` | Works |

## 5. Follow-up

| # | Function | What it does | Entry | Key files | Status |
|---|---|---|---|---|---|
| U1 | Follow-up clock | "Follow up in Nd" → "Follow up now" → Log follow-up resets it | row, Today | `jobState.ts`, `store.ts` logFollowUp | Works |
| U2 | Today: due follow-ups | Jobs whose follow-up is due | `#/today` | `TodayView.tsx`, `jobEvents.ts` | Works |
| U3 | Today: next 7 days | Upcoming interviews and events | `#/today` | `jobEvents.ts` upcomingEvents | Works |
| U4 | Interview log | Add or remove interview events per job | Interviews tab | `InterviewLog.tsx`, `JobInterviews.tsx` | Works |
| U5 | Add to calendar | Export upcoming events as .ics | Interviews tab | `ics.ts` | Works |
| U6 | To-dos + notes | Per-job checklist and one Notes field | To-dos tab | `TodosNotes.tsx`, `todos.ts` | Works |

## 6. Templates

| # | Function | What it does | Entry | Key files | Status |
|---|---|---|---|---|---|
| T1 | Templates list | Pinned first; search | `#/copy-deck` | `TemplatesList.tsx` | Works |
| T2 | Template editor | Write/Preview, token chips ([Company] and others) | `#/copy-deck/<id>` | `TemplateDetail.tsx`, `templateEditor.ts` | Works |
| T3 | Fill preview | Fill tokens from a picked job | editor "Fill for" | `templateFill.ts` | Works |
| T4 | Copy filled | Copy filled text | editor, A4 | `templateCopy.ts` | Works |
| T5 | Pin / Duplicate / Delete | Menu actions; Delete is confirmed | editor "…" | `copyDeckStore.ts` | Works |
| T6 | New snippet | Blank template | list | `copyDeckStore.ts` | Works |
| T7 | Restore starter set | Re-adds missing `tpl-*` defaults | list | `restoreStarterSnippets` | Works |

## 7. Insights

| # | Function | What it does | Entry | Key files | Status |
|---|---|---|---|---|---|
| I1 | Metric tiles | Applied (7 days), response rate, interview rate, median reply | Today, Insights | `Insights.tsx`, `metrics.ts` | Works |
| I2 | Funnel | Progress rows by stage | Today, Insights | `funnel.ts` | Works |
| I3 | Weekly applied trend | 8-week bucket data | none | `metrics.ts` weeklyApplied | **Placeholder**: computed and tested, never shown |

## 8. Tracks / setup

| # | Function | What it does | Entry | Key files | Status |
|---|---|---|---|---|---|
| K1 | Onboarding | 3 steps (track, location, first job) with Back and Skip | first run on Today / Discover | `Onboarding.tsx` | Works |
| K2 | Starter packs | Consulting · ServiceNow · Design systems · Trades · Blank | K1, New track | `curation/starterPacks.ts` | Works |
| K3 | Track switcher | Combobox over tracks | Discover header | `DiscoverHeader.tsx` | Works |
| K4 | New track | Create from a pack or blank | Discover header menu | `DiscoverHeader.tsx` | Works |
| K5 | Manage track | Rename, sections, links, delete; top up from pack | Discover "Manage track" | `ManageTrackDialog.tsx`, `curation/topUp` | Works |
| K6 | Getting started | 3 computed ticks; dismissible | Today | `GettingStarted.tsx`, `gettingStarted.ts` | Works |
| K7 | Sample data | Try with or clear sample data | Today first run | `demo/` | Works |
| K8 | Today notice | One-time "Today is home" note | Today | `TodayNotice.tsx` | Works |

## 9. Account / data

| # | Function | What it does | Entry | Key files | Status |
|---|---|---|---|---|---|
| D1 | Sign in (magic link) | Email link sign-in | Account menu, SyncNudge | `account/SignInDialog.tsx` | Works |
| D2 | Cloud sync | Blob v5 to Supabase; curation tables; retry when offline | automatic | `account/CloudSyncProvider.tsx`, `syncBlob.ts`, `curation/sync.ts` | Works |
| D3 | Sync nudge + dot | One-line nudge; dot on Account when unsynced | Today, Account | `SyncNudge.tsx`, `useUnsynced.ts` | Works |
| D4 | Sign out | Flushes first; confirms if the push fails | Account | `CloudSyncProvider.tsx` | Works |
| D5 | Delete my data | Removes cloud data | Account | `deleteMyData` | Works |
| D6 | Back up | Download a JSON backup | Account | `backup.ts`, `DataToolsProvider.tsx` | Works |
| D7 | Restore | Merge into or replace data | Account | `DataToolsProvider.tsx` | Works |
| D8 | Export CSV | Jobs as CSV | Account | `csv.ts` | Works |
| D9 | Theme | Light / dark | Account | `ColorMode.tsx` | Works |
| D10 | Density | Comfortable / compact spacing | Account | `Density.tsx` | Works |
| D11 | Send feedback | Opens the feedback link | Account | `AccountMenu.tsx` | Works |

## 10. System

| # | Function | What it does | Entry | Key files | Status |
|---|---|---|---|---|---|
| Y1 | Error boundary | Reload or reset local data after a crash | crash | `ErrorBoundary.tsx` | Works |
| Y2 | Hash routes | Back-compat slugs (`queue`, `copy-deck`, `apprenticeships`) | URL | `route.ts` | Works |
| Y3 | Toasts | Errors and confirmations | everywhere | HDS ToastProvider | Works |
| Y4 | Save flash | "Saved ✓" after edits | job page | `useSavedFlash.ts` | Works |
| Y5 | Rate budgets | Remotive 4 a day, GitHub 8 a minute and 40 an hour, probe politeness | F6, F17, F18 | `feed/githubBudget.ts`, `feed/probe.ts` | Works |

## What surprised me

- **Weekly trend (I3) is dead code.** It is built and tested but never drawn.
- **Teams (F18) is design-system specific on every track.** That is why the Consulting track shows design-system orgs, most with "no public board".
- **Remove has no undo or trash (P12).**
- **Remote OK is off (F8).** Several sources are unverified live: Jobicy, Workable, Recruitee, the YC mirror, GitHub, and the community `site:` clauses.
- **The header star (P7) is reported broken.** The fix is in PR #214, not yet on main.
- **Not counted here:** rapid apply (PR #218) and the wide sweep (#213) are not on main yet.
