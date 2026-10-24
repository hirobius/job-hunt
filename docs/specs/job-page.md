# Spec: Job detail (redesign Phase 4, #130, part of #115)

## Objective

A job seeker opens a saved job and sees one clear page, not one long inline form.
- Desktop (at least HDS `lg`, 1024): the Pipeline list on the left, the selected job on the right, at `#/queue/<jobId>`. Clicking another row swaps the job without leaving the page.
- Phone: the job is a full page with a Back link (as today).
- Success: the next step is visible without scrolling; screening is one click away, not two; every field that exists today is still reachable; no data, sync or backup change.

## What exists today

- `src/route.ts`: `Route.jobId`, `jobHash(id)`, `openJob(id | null, replace?)`. Done in #127; unchanged here.
- `src/App.tsx`: renders `route.jobId ? <JobPage jobId/> : <TrackerView/>` inside `Container maxWidth="max"`.
- `src/JobPage.tsx` (56 lines): resolves `findJobById`, waits for `useCloudSync().settled`, then `openJob(null, true)`; shows `PageHeader` (back button as `breadcrumb`) over `<JobCard defaultDetailsOpen/>` at the 760 content measure. While unknown and unsettled it shows an `EmptyState` "Job not found".
- `src/JobCard.tsx` (380 lines): does everything: eyebrow, title, status badge, pin, `RowMenu`, icon facts, screening chips, source host, actions (Mark applied, `UseTemplate`, Follow-up), `TodosNotes`, and a `Disclosure` "Details" holding field inputs, `ScreeningEditor`, `InterviewLog`, Notes, contact/résumé, research links. Owns the "Saved ✓" flash.
- `src/TrackerView.tsx`: owns filter, search and sort state locally; renders `JobListCard` at every width (the table was cut 2026-10-24). Titles link to `jobHash(jobIdOf(url))`.
- `src/jobRow.ts`: `rowView`, `titleOf`, `primaryAction`, `STATUS_TONE`. `src/JobRowParts.tsx`: `RowMenu` (includes Delete via `removeJob`), `RowPrimaryAction`, `StatusBadge`.
- `src/hds-gaps/useBreakpoint.ts`: `useAtLeast('sm' | 'md' | 'lg')` via `matchMedia`; narrow layout when there is no `matchMedia`.
- Tests: `src/jobRoute.test.tsx` (route seam through `App`), `src/pipeline.test.tsx`.

## Design

### Layout per breakpoint
- **At least `lg`:** `Sidebar` with the rail first, detail second (`sideWidth` about 22rem, `contentMin` about 50%). The shell is already `Container maxWidth="max"`. The rail scrolls on its own (sticky, `max-height` to the viewport); the detail scrolls with the page.
- **Below `lg`:** detail only. `JobPage` chooses with `useAtLeast('lg')`, because HDS `Sidebar` is CSS-only wrapping and would stack the rail above the job. The Back link (`PageHeader breadcrumb`) goes to `#/queue`.
- `#/queue` (no job) is unchanged: full-width table or cards.

### The rail (new `JobRail`)
- A compact list of the same filtered and sorted jobs the Pipeline shows. Each row is a link to `jobHash(id)` with `aria-current="page"` on the open job: title, one facts line, status `Badge`, a dot for follow-up due. No row actions (they live in the detail).
- Filter, search and sort move out of `TrackerView` into a small shared view-state module (`pipelineView.ts`, `useSyncExternalStore`, in memory), so the rail shows what the list showed. The rail has a search `Input` only; filter and sort are read, with a link "Change filters" that goes to `#/queue`.
- If the open job is filtered out of the rail, show it pinned at the top with a note "Not in this filter".

### The job page (header, then sections)
1. **Header** (`PageHeader level=2`): title, status `Badge`, pin toggle, one primary action (Mark applied or Log follow-up from `primaryAction`), `RowMenu` (Delete leaves the menu on this page, see 7).
2. **Overview** (default): facts as `MetadataList` (company, location, seniority, salary, source host, applied, follow-up clock), a "Saved ✓" flash, editable in place: a single "Edit details" `Disclosure` holds the title/company/location/seniority/salary inputs; contact/referral and résumé version sit under it. Templates (`UseTemplate`) and research links sit here as secondary buttons.
3. **Screening**: the fit line (one compact line: verdict, mode, blockers) above `ScreeningEditor`. The paste-a-JD screener (`ScreenJdDialog` logic) is inline here, not a dialog.
4. **Contacts and interviews**: contact line and `InterviewLog` with the .ics export.
5. **To-dos and notes**: `TodosNotes` and the Notes `Textarea` (today in two places).
6. Sections 2 to 5 are `Tabs` (as #130 says). Tab count shows on the label when non-empty ("To-dos (3)"). The open tab is kept in the URL query-free local state, reset to Overview when the job changes.
7. **Delete last:** `DestructiveSection` at the bottom of Overview, with the existing confirm. Remove "Delete" from `RowMenu` only on the job page.

### Interactions, keyboard, focus, route
- Opening a job from the list scrolls the detail to top (kept from today). Moving between rail rows keeps focus on the clicked link; the detail heading is not focused by default.
- On phone, after Back the list restores its scroll position (browser behaviour with hash routes; verify, do not build).
- After Delete: `openJob(null, true)` and a toast. Keyboard: tabs follow the ARIA tab pattern (HDS `Tabs`); the rail is a normal link list (Tab order), no roving focus.
- Unknown id: unsettled shows a `Skeleton` page ("Looking for this job; it may still be syncing"); settled does `openJob(null, true)` as today. Never flash "not found" for a job that is about to sync in.
- Empty sections have one-line teaching empty states, not blank tabs (no interviews yet, no to-dos).

### What moves out of JobCard
`JobCard` shrinks to the parts shared with nothing else, then is deleted: facts, screening chips and actions become `JobHeader`, `JobOverview`, `JobScreening` (new files); `ScreeningEditor`, `InterviewLog`, `TodosNotes`, `UseTemplate` are reused as they are. The Details `Disclosure`, `defaultDetailsOpen` and the duplicated Notes field go away.

## HDS components used (real exports in 0.24.1)

Root: `Sidebar` (`side`, `sideWidth`, `contentMin`, `gap`), `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent`, `MetadataList` (`items`, `variant`), `Breadcrumb`, `Disclosure`, `Badge`, `Button` (incl. `iconOnly`), `Card`, `Input`, `Textarea`, `Menu`, `Stack`, `Switcher`, `Box`, `Text`, `InlineLink`, `Skeleton`, `EmptyState`, `AlertDialog` or `Dialog` for delete, `useToast`.
Patterns (`@hirobius/design-system/patterns`): `PageHeader`, `DestructiveSection`.

Gaps (each a file in `src/hds-gaps/` naming its upstream ask, filed in #133):
- **No drawer, sheet or split-view that collapses**: `Sidebar` does not switch layouts. Stand-in: the existing `useAtLeast('lg')`; no new file.
- **`Tabs` has no overflow cue**: four short tabs fit at 390; reuse `TabsOverflowFade` if a fifth tab ever appears.
- **List selection**: HDS has no selectable list or `aria-current` list item. Stand-in `hds-gaps/RailList.tsx` (a `ul` of `InlineLink` rows with `aria-current`). Ask: a `NavList` or selectable `ListItem`.

## Testing

- Route seam through `App` (extend `src/jobRoute.test.tsx`; a new `src/jobPage.test.tsx` for sections): `#/queue/<id>` opens that job; at wide (stub `matchMedia`) the rail and detail both render and the open row has `aria-current="page"`; at narrow only the detail renders and Back returns to `#/queue`; clicking a rail row changes the route and the heading; unknown id shows the skeleton until `settled`, then replaces to `#/queue`; each tab shows its content; editing a field updates the store; Delete asks, removes, and returns to the list.
- Pure: view-state module (filter/sort shared by list and rail) with table tests; `jobRow` additions if any.
- a11y: `vitest-axe` through `App` at `#/queue/<id>`, both layouts (extend `src/a11y.test.tsx`): one `h1`, tab roles, rail `nav` labelled.
- Gallery (`npm run gallery`): add the job route at 1440 and 390, light and dark, with each tab; run before and after each slice. Axe-in-Playwright on those routes (#133).
- `npm run verify` and `npm run test:e2e` stay green; no `[preview]` commits unless asked (CLAUDE.md build budget).

## Slices (each ships alone; each at most 5 files, plus its tests)

1. **Page header and Overview.** `JobPage.tsx`, `JobHeader.tsx`, `JobOverview.tsx` (facts as `MetadataList`, edit-details disclosure, templates, links), trim `JobCard.tsx` use. Done when: the job page has the header (status, one primary action, menu) and Overview; no fields lost; the list still works. Delete stays in the menu for now.
2. **Tabs.** `JobScreening.tsx` (fit line, inline `ScreeningEditor`, inline JD screener), `JobPage.tsx`, `TodosNotes`/`InterviewLog` moved under tabs. Done when: four tabs, counts on labels, Notes appears once, screening is one click away; tests per tab.
3. **Delete last.** `DestructiveSection` on Overview, confirm and toast, remove Delete from `RowMenu` on this page, delete `JobCard.tsx` and its dead props. Done when: nothing imports `JobCard`; the row menu elsewhere is unchanged.
4. **Shared list state.** `pipelineView.ts` (filter, search, sort), `TrackerView.tsx` reads it. Done when: behaviour on `#/queue` is identical and the state survives opening a job and Back (test).
5. **Two-pane desktop.** `JobRail.tsx`, `hds-gaps/RailList.tsx`, `JobPage.tsx` (`Sidebar` at `lg`). Done when: at least 1024 shows rail and detail with `aria-current`; below shows detail only; "Not in this filter" case; gallery shots updated.
6. **Polish and guards.** Empty states per tab, skeleton for unsettled unknown id, focus and scroll checks, axe in gallery, update `CLAUDE.md` (Job routes, Pipeline rows) and #130 checklist.

Slices 1 to 3 need no layout change and can ship first; 4 and 5 are the risky ones.

## Boundaries

- **Always:** HDS components and tokens only; sentence case; one primary action in the header; keep `#/queue/<jobId>` and quick-add URLs working; keep tap targets at least 40px on phone; run `npm run verify` before any push.
- **Ask first:** changing the `Job` type or backup format; adding a route segment (a tab in the URL); merging to `main` or adding `[preview]`; changing `Tabs` to a single scrolling page.
- **Never:** touch sync code (`src/account/`, `syncBlob.ts`, Supabase), the store's persistence, or the CSP; add dependencies; add AI features; add a local UI primitive layer (`hdsOnly.test.ts`); use GitHub Actions.

## Open questions (recommended default)

1. Tabs or one scrolling page with disclosures? Default: Tabs, as #130 and #115 decided; revisit only if tabs hide too much on phone.
2. Does the active tab go in the URL (`#/queue/<id>/screening`)? Default: no; local state, reset on job change. Keeps `Route` unchanged.
3. Should the rail share the Pipeline's filter and sort? Default: yes, read-only, via the shared view-state module (slice 4).
4. Rail at `lg` (1024) or wider? Default: `lg`; a 22rem rail plus a 50% detail fits. Raise to a wider token if it feels cramped in the gallery.
5. Where does the JD screener live? Default: inline in Screening; keep `ScreenJdDialog` only if another screen still opens it.
6. Does "Edit details" stay collapsed? Default: collapsed on a job that has a title and company; open for a new job with only a URL.
7. Delete: confirm dialog or undo? Default: confirm (`AlertDialog`); HDS `Toast` has no action button, so no undo.
