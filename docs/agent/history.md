# History

Notes on screens and models that were replaced. Read these only to understand old data or old links. The current rules are in the other files.

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

- **Calm list shell (PR #208) and "Today is gone" (#236)** are history: the final shell above brought Today
  back as home and removed Companies.

- **Discover (#131), Live postings, Calibrate, wide sweep (#213), title filter (#223), Contracts / SAM.gov (#275),
  Find boards, Check a list, Teams, Add a company, dream company rows, the tile board and Manage track** were deleted
  in #389 (ADR 0009). Their stores stay readable (sync, Back up, CSV) and feed the v12 move; the pure helpers the
  auto-scan uses (probe, identity check, YC / GitHub / Adele leads, `companySource`, `teamRoles`) stay.
  `feed/liveList.ts` stays as the breadth guard's baseline. `/api/sam` is gone; `SAM_GOV_API_KEY` can go from Vercel.

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

## 2026-07 — screening pipeline (history)

_The 2026-07 pillar / track / Discover model (ADR 0006) was replaced by one Search profile and one Sources list
(ADR 0009), and its trades / consulting content by design systems only (2026-10-29)._ What still stands from it:

- **Screening pipeline on jobs (#60).** Additive `Job` fields — `verdict` (match/stretch/reach),
  `mode`, `blockers[]`, `angle`, `screenedAt` — normalized on read in
  `src/screening.ts` (which also strips the retired `travelPct` / `applicants` from old records).
- **Rules-based JD screener (#61).** `src/jdScreener.ts`: deterministic keyword rules, no AI.
- **Supabase (#31).** `tracker` + `categories`/`groups`/`tiles` tables with RLS. `pillarStore` + `pillars.ts`
  are retired (#99); curation syncs through its own tables. Merges rely on CI (see Build / deploy /
  verify).
