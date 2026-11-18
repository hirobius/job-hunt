# Shell, routes and navigation

The two screens, the app bar, the Account menu, routes, return paths, focus, scroll, empty states and action feedback.

- **Empty, error and done states sit on the page background (redesign §5.11, #553/#554):** `src/hds-gaps/EmptyState`
  `onPage` (centred, room above and below, no card); `framed` (a raised panel) is left for not-found and
  "pick one" columns only. One filled key and one grey key, never a text button for a second choice: Apply empty
  "Track your first job" (Add job | Try with sample data), the load error (Try again), Documents' "No documents
  yet" (Add starter messages | Start from scratch, grey), Find's "No postings match yet" (`AutoScanViews.tsx` `NoResultsKeys`: signed out Scan now | Edit
  search profile (Scan now is also in the Account menu, #694); signed in Edit search profile alone, filled, as
  there is no Scan now signed in; it opens the Account menu's dialog through `jobDialogs.ts` `openSearchProfile`). **Find has one empty state, picked by cause, never by view (#694):** `ReviewView.tsx` `FindEmpty` (`data-empty-cause`): `none` (nothing read or nothing matches; search-x) "No postings match yet" with those keys; `caughtUp` (all saved or skipped; CircleCheck) "You’re all caught up", signed out Scan now alone, signed in Edit search profile filled (`NoResultsKeys caughtUp`); at lg it is the right column and the two columns stay (2026-11-13); `unreachable` (UX pass 2026-11-15: sources were asked and not one answered, `sourcesRead === 0` with failures; WifiOff) "Couldn’t reach your sources" with one filled key, Try again (`feed.refresh`), never "No postings match". Review has no filters since 2026-11-13, so there is no `filtered` cause. **Done:**
  with nothing left to apply to at all (To apply view, no search; Remote only aside) the Apply tab is
  `TrackerView` `DonePage`: the h1, then `ApplyDone.tsx` (the standard `hds-gaps/EmptyState` `centered` icon tile,
  `ListChecks`, no flame since 2026-11-13; "That is the list" (its title, not a heading); `applyDone.ts` `weekLine`: applied
  in the last 7 days and follow-ups due; the filled key Follow up (N) while some are due, else Find more jobs; the
  grey All jobs key sets the All jobs view and focus goes to its first job's title), the lg rail beside it. After
  the last Mark applied / Not a fit the tab lands there and its h1 takes focus. Pinned in `applyDone.test.ts(x)`,
  `emptyStates.test.tsx`, `rapidApply.test.tsx`, `e2e/rapid-apply.spec.ts`, `e2e/states.spec.ts`.
- **Keys (redesign §3, Adrian 2026-11-10, #537):** one filled key per decision, a grey key for a real
  second choice, and **An exit is underlined text** for every way out (Cancel, Not a fit, Continue
  without an account): `src/hds-gaps/ExitButton.tsx` = HDS `Button variant="link"` + HDS's
  `hds-touch-target` (44px at every width; G11, hds#1442). Its focus ring is on `::after`
  (hds#1167), which the `e2e/a11y.spec.ts` walk reads. `e2e/exit-style.spec.ts` pins it at 390 and 1440.

- **Two screens: Review and Apply (#471; Adrian 2026-11-05; ADR 0010, done in #493/#494/#495/#500).** Exactly two
  top tabs and no other full page. **Find was renamed Review (Adrian 2026-11-13):** the tab, its h1, `document.title`,
  the logo's name ("roleflame, Review"), routeLabel ("← Review") and the copy that names the tab say Review; the slug
  is `review` (`route.ts` `FIND_TAB = 'review'`; code identifiers such as `FIND_TAB`, `Today.tsx`, `FindHeader`,
  `findHash` keep their names), and `redirectOf` sends `#/find[/<fingerprint>]` to `#/review[/<fingerprint>]` in place
  (no history step; an old `?from=/find` reads as Review). Where a section below says Find, read Review. The Find
  box (Add job's "Type a company or title instead") and "Find more jobs" are verbs and keep the word. **Review's
  count (2026-11-13):** the Review tab shows the postings still to decide, the number the New chip showed until #714 removed it
  (`scanDetails.newToday`), as a `CountBadge` (99+, the chip's #694 fills; `TopTabCount.tsx`, a lazy chunk), none at 0;
  Apply has none. Below 400px the pill is hidden visually (`TopTabCount.css`, in its lazy chunk), so the app bar stays one row with no overlapping
  hit areas; the name keeps the count at every width ("Review 12"; `test/topTabs.ts`, `e2e/routes.ts` `topTab`)
  (Adrian 2026-11-13 chose this over the wrap). The Review page has no visible title: its h1 is `.sr-only` (`FindHeader.tsx`), so the tab is the one visible "Review". Pinned in `e2e/shell-controls.spec.ts` (320, 375, 390, 414).
  Each screen is a list beside a detail at lg (HDS `Sidebar`) and the list alone below lg; the
  selection is the route; Documents and Privacy and terms are dialogs in the page's URL. **This section is the current
  shell: where an older section below (Job routes, Final shell, Rapid apply, Pipeline panels, Return paths) says
  Pipeline, `#/queue`, Today, Apply mode or a Documents / Legal page, read it as history.** The top tabs are **Find** (slug `find`,
  `Today.tsx`, home; was "Today", `#/today`) and **Apply** (slug `apply`, `TrackerView.tsx`; was "Jobs" /
  "Pipeline", `#/queue`). **Routes (slice 1):** `#/apply/<jobId>` is a job's Apply view (`route.ts`
  `APPLY_TAB`, `jobId`); `redirectOf` (in place, no history step) sends `#/today` → `#/find`, `#/queue` →
  `#/apply`, `#/queue/<id>` → `#/apply/<id>` (origin and section kept); an old `?from=` reads as its new route
  (`originOf`, `routeLabel`). **There is no Apply mode, To apply panel or Start applying on Apply:** the tab is
  the walk. One job view (`JobPage`: header with Open application, Mark applied | Not a fit (`applyActions.ts`;
  a 700 ms double-tap guard on both; focus then goes to the new job's heading, or the list's), then (no Application kit since 2026-11-13) Details,
  Notes, Documents, Decks). Mark applied / Not a fit open the next job in the list as it shows (in place, before
  the answer lands, with Undo); the last one goes back to the list. At ≥ lg the Apply tab opens on the first job
  to apply to with the list column (`JobRail`) beside it; a pick replaces the history entry. **Below lg: one Apply
  screen (Proposal A, Adrian 2026-11-08).** The tab opens on the same job (no list page; `PipelinePage` is only the
  empty state; no filter bar on the job since #543; no search, filters, Sort or sample line anywhere since the
  control-free list, 2026-11-13), the sticky **walk control** (#542, `ApplyWalk.tsx`:
  one row, no box: the **view picker** (the open view's name, bold, caret inside, named "View: <name>"; since 2026-11-13 an HDS
  secondary `Button` drawn as a select by `ApplyWalk.css` `.rjb-view-picker`: the Find chips' fill (HDS Tag tokens) as a
  40px pill (its `::after`; HDS's `::before` is the press wipe) in a 44px hit area, no edge or shadow, its left edge on
  the page gutter under Find | Apply and the job title, `e2e/shell-controls.spec.ts`; an HDS Menu drawn as
  a sheet below sm by late.css `.rjb-menu-sheet`, shared with the Account menu, holding the seven views and "All jobs", each with its count; the "N filters" chip went with the filters, 2026-11-13), and on the right the "‹ 3 of 55 ›" pager over the filtered list, which only steps (`ApplyPager.tsx`,
  label "Jobs in the list"; "Not in this filter" for a job it hides; a 64px sideways swipe on the job steps it too);
  at 390 the view name truncates, never the pager; no pager at lg) and **Add job** (the job's More menu below lg, `RowMenu` `onAddJob`; the lg column has its own key). There is no list below lg: the All jobs bottom sheet (`AllJobsSheet.tsx`) went 2026-11-17, so the view picker and the pager are the only ways between jobs. Under the phone's Passed view the page shows the passed job as usual with the postings skipped in Review under it (`SkippedPostings` in `PassedList.tsx`, with Save); an empty view's state holds Show to apply and Add job. `TrackerView`'s `JobsList` is kept for tests (`src/test/allJobs.tsx` mounts it); delete it with the full rows of `JobRowList`.
  **One job list, sheet and lg column alike (#543):** `JobRowList.tsx` (+ `.css`), rows in an HDS NavList on one
  surface, never a Card per job: badges, the title (`rjb-clamp-2`, two lines), the company, place and one date;
  the title is the link, its hit area stretched over the row (`::after`, which carries the focus ring), so its name
  is its visible text (the rest describes it; `hds-gaps/NavListActionItem` is deleted); the open job is
  `aria-current` with the selected fill; **beside the job at lg (`JobRail`, `JobRowList brief`, Adrian 2026-11-15) a row
  is its badges, title and company only**, the place and date being the job page's beside it (Review's lg list
  cards likewise: `PostingCard` `brief` = title + company, no facts, pay or excerpt; below lg rows and cards keep
  their facts; pinned in `jobPage.test.tsx`, `review.test.tsx`); no row key (Follow up, Mark applied), no row menu, no posting glyph (the
  job page's header and More have them). Follow up and Next 7 days stay under the lg column only.
  `ApplyFilterBar`, `ApplyQueueSummary` and `JobListCard` are deleted. A pick pops the sheet's entry, then replaces the page's, so Back leaves
  the tab in one step; notices raised while it is open show in its footer (`saveNotice.noticeHost`). A job opened from
  elsewhere keeps its "← Back". The **Templates** disclosure is gone (#540), and the Application kit with it (2026-11-13):
  templates live in Documents. No posting
  glyph by a title on Apply (the header's Open application, or the menu's Open posting). A
  signed-in device with no jobs yet shows "Loading your jobs…" first (#478), at every width. **Find (slice 3):**
  `#/find/<fingerprint>` selects a posting; see Final shell. Save, Skip and Not this company share Apply's 700 ms guard (`answerGuard.ts`); after a decision on the selected posting, focus goes to the next one's title, else to Find's h1 (`focusRescue.focusNewHeading`). **Documents and Legal are dialogs (slice 4)** over the open page: `?documents=` / `?legal=` on its hash (see Documents library, Privacy and terms). **Company (slice 2):** `#/apply/company/<slug>`
  in the right column at lg (see Company page).
- **Structure (since simplify #383/#389):** `src/App.tsx` is the shell with two top tabs, **Review** (was Find)
  (`Today.tsx`, home) and **Apply** (`TrackerView.tsx`, slug `apply`), plus
  tab pages (a job, a posting, a Company) and two dialogs over them (Documents, Privacy and terms; #471 slice 4). `types.ts` holds the Job model.
  The old Trades / Discover / Companies screens are deleted (ADR 0009); their slugs redirect to Find.

- **Shell (#115 Phase 1; rev-3 mobile slice 1):** slim header, one row at every width (#548) = the body-size wordmark, a link home to Find (#620; the lockup inside
  never a heading: `role="img"` named by BRAND, #363; so the page title is always the biggest text) · **each page's own name is its one `h1`, inside `main`** (#363:
  Apply, Find, the job title, Documents, a Company, Legal; panel heads are `h2`, card titles `h3`; `focusRescue`
  focuses the page's h1; `e2e/a11y.spec.ts` keyboard walk fails on an h1 outside main) · top tabs (**Find · Apply**: links in a `nav` named "Sections", the open one `aria-current="page"`, styled as HDS tabs by `.rjb-top-tab`; not ARIA tabs, no tab panel (top tabs PR, 2026-11-08; HDS ask: Tabs as navigation links); tests use `test/topTabs.ts` / `e2e/routes.ts` `topTab`, `currentTab`) · the
  **Account** button: an HDS tertiary `Button iconOnly` in the ThemeToggle's 44px box with its 28px icon (#694; filled, Adrian 2026-11-13: `account/AccountGlyph.tsx`, an inline SVG, a solid content-primary circle with a person signed out or your initial signed in knocked out by an SVG mask, so the hole shows the bar in either theme; no .svg file; no grey Avatar disc; never a menu icon; named "Account"; no unsynced dot, Adrian 2026-10-22; it holds account, data, display and feedback). Page gutter: `PageShell`'s `clamp(1.25rem, 5vw, 4rem)` (20 on a phone, 64 from 1280; see Shell width below). `src/account/` is the account
  seam: `CloudSyncProvider` + `DataToolsProvider` own sync / backup / restore / CSV and expose
  `useCloudSync` / `useDataTools` (`accountContext.ts`); `AccountMenu` (an HDS Menu; below sm drawn as a bottom sheet with a grab handle and its own scroll, from sm a dropdown ≥ 16rem, by `src/theme/late.css`: late shell styles that ride the animated logo's chunk, off the first-load CSS budget; account menu PR 2026-11-08) holds sign-in/out, Documents, Search profile, Companies, Data (the
  **Data dialog**, below), theme and feedback; there is no sync banner and no Avatar dot (the menu's sync line says it);
  `SignInDialog` is the magic-link form. Errors are HDS **Toasts** (`ToastProvider` in `main.tsx`;
  tests wrap App in one); `src/hds-gaps/toastAnnouncer.ts` (#365) mutes Radix's assertive announcer and says each toast
  itself: politely (errors assertively), "Title. Description". Shell behaviour is pinned at the route seam in `src/shell.test.tsx`, incl. the Account menu order
  (**8 items in 4 groups, redesign §5.9, #549**; 9 signed out, with Scan now, #694; the Dark theme row left for the app bar's ThemeToggle, #688: who | things | display | about. Who: **one tight identity header** (Adrian 2026-11-15, `IdentityHeader` in `AccountMenuRows.tsx`, `.rjb-account-id` in late.css): a primary line (ui, semibold, truncated) over a caption-size secondary line, 4px apart; signed out "On this device only" over the caption "Sign in to sync your jobs across devices." (`SIGN_IN_STATE`, `SIGN_IN_BENEFIT`) and **"Sign
  in" as a grey key** (`signInCopy.ts` `SIGN_IN_ITEM`; HDS secondary `Button` as the
  `Menu.Item`, `.rjb-menu-key`); signed in the email (screen readers hear "Signed in as <email>": the words are `.sr-only`) over the sync line ("Synced" with a 12px check), a divider, then Retry sync when it failed, and
  Sign out. Things = Documents, Search profile, Scan now / Stop scan (signed out only, #694), Companies, Data. Display = **Pause animations**,
  a toggle that shows its state and keep the menu open (`src/hds-gaps/MenuToggleItem.tsx`: an HDS Menu.Item with role
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
  on its message when its Edit message / Write a message editor comes back. **View memory** (`viewMemory.ts` `useRemembered`, in memory per page load, written at once so a row unmounting in the same commit keeps its value): coming back restores what was being done, not only the page. Apply mode's open rows and a half-typed kit field / custom answer (open + draft); Review new (pages shown and the read rows, so Back shows them with no new read). A magic link
  returns to the page the sign-in was asked from (`account/signInReturn.ts`). Pinned in
  `src/route.test.ts`, `src/returnPaths.test.tsx`, `scrollMemory.test.ts`, `tabMemory.test.ts`,
  `routeLabel.test.ts`; E2E `e2e/return-paths.spec.ts` (390 and 1440, with the browser's Back).
- **Final shell (simplify #383 + amendment 2, Q6; PR from `claude/simplify-shell`):** exactly **two top tabs,
  Today · Jobs** (renamed Find · Apply in #475, see Two screens above; slugs `find` · `apply` since #471).
  **No Companies tab:** `route.ts` `redirectOf` sends `#/discover/*` and `#/apprenticeships` to `#/today` (the
  snapshot reads them as Today, the URL is rewritten in place with no history step, `navigate` / `goBackTo` never
  write one); never redirect anywhere else. The old Discover screens are deleted (#389, ADR 0009). An empty hash
  and a sign-in error land on Today; there is no setup screen (see First run).
  `Today.tsx`, top to bottom: **the short header** (`FindHeader.tsx`, #544, redesign §5.1): the sr-only h1 "Find" and
  nothing else (no page-bar tools since the Deck went, 2026-11-13). **No More menu and no scan line on Find (#694, Adrian
  2026-11-13):** Scan now / Stop scan (signed out only) is the Account menu's, beside Search profile; when the sources were
  last scanned lives only in Scan details (the Search profile dialog); Review's polite `role="status"` says "N postings,
  M new". **No Sort on Find (Adrian 2026-11-13):** newest first, always (`sortRows(…, 'newest')`; an older remembered
  `review:sort` is not read; Apply's Sort went too, 2026-11-13). `ReviewView`'s `header` is a function given the new
  count and whether a posting is selected (then "Find" is a `p`, the posting's title the h1). Then **Review**
  = `ReviewView` itself (`label="New postings" scanStatus`; no visible heading since 2026-11-12: an sr-only h2 "New
  postings" (`Panel titleHidden`)). **List only (Adrian 2026-11-13):** no Deck, no List | Deck switch and **no filter
  row**: the New / Remote chips and the Remote only control are gone; Review follows the Search profile's work mode only
  (remote by default; an older remembered `review:filters` / `review:mode` / `review:card` is not read; Apply's Remote only
  follows the profile too since 2026-11-13). At lg the list starts under the tabs. **No pager below lg (Adrian 2026-11-14):** the "[‹][›] 1 of N" row of #714 is gone; in a list that
  scrolls, its arrows only jumped the page (`FindList.css` keeps only the window spacer). A step past the pages
  shown by ↑ / ↓ at lg shows enough pages first (`showUpTo`), so its card is there to scroll to. **Late postings wait (Adrian
  2026-11-15, the layout-jump fix):** `heldPostings.ts` `useHeldPostings`: once the list has settled (its read fully
  answered) or the person has started reading it (a scroll, tap or key on the page), a posting that arrives later is
  held, never put in above the cards on screen; a sticky "N new postings" key (HDS secondary, ArrowUp; `.rjb-find-new`
  in `FindList.css`, zero height so it floats over the list and nothing moves when it comes or goes) puts them in,
  scrolls to the top and focuses the top card's title; Review's polite status says "N new postings". Postings of the
  first load show as they come; the selected posting is never held; a change to the Search profile or the Sources (a
  company followed) fills the list as a first load again, so a new company's jobs still show at once (2026-10-28);
  when none of the shown cards is left, everything shows. Pinned in `heldPostings.test.ts`, `review.test.tsx`,
  `e2e/review.spec.ts`. **No empty flash while a read runs (Adrian 2026-11-15, a phone recording):** `useFeed` keeps the last read that listed more on screen until the new read settles (rebuilt with today's decisions and saves), and says `settled`; until then Review shows its skeleton, never its empty state; signing in from signed out keeps the Review count (`CloudSyncProvider` clears it only on a sign-out or a switch). Pinned in `e2e/review-no-flash.spec.ts` (a DOM recorder, 390, signed out and in). **At lg** ↑ / ↓ move
  the selection through the list (in place; its card scrolls into view, `block: 'nearest'`), never while focus is in a
  text field, select, menu, listbox or dialog, or a menu / dialog is open. Browse
  **auto-loads** its next page (`autoLoad.ts` `useAutoLoad`: an IntersectionObserver sentinel one viewport before the
  end, disconnected on unmount; off without IntersectionObserver or under prefers-reduced-data); "Load more (N)" stays as
  the fallback, one card gap below the cards, and the polite status says "Loaded N more". A Browse card shows
  `CompanyLogo` before the company, or "Company not stated" (its More, which would hold only Not this company, is then
  absent), and two lines of the text already held (`BrowseExcerpt`, never fetched, all-caps runs title-cased for display by
  `feed/capsCase.ts`), "Show more" / "Show less" in place (`aria-expanded`) and "Read the full posting" only when open.
  At lg a card's title selects the posting. **New companies
  left Find (#618, Adrian 2026-11-12):** the scan's found companies (`NewCompanies`, Follow / Ignore with Undo) are
  the Companies dialog's **Found** list. **Two columns (#471 slice 3):** `ReviewView` given a `header` lays
  Find out (**below lg there is no posting page since 2026-11-08:** the card's title is the link out to the posting
  (#544), an old `#/find/<fingerprint>` link scrolls to its card and drops the fingerprint, and after a
  decision focus goes to the next card's title): at ≥ lg HDS `Sidebar` (list column 26rem: header, Daily picks, Review) beside
  `PostingDetail` (the job page's template since #546: title block, More with Not this company, Save / Skip / Open
  posting, then the Description; the first posting when the tab opens, #546); below lg the list is the tab. The selection is the
  route, `#/find/<fingerprint>` (`route.postingOf` / `findHash` / `selectPosting`, URI-escaped): shareable, survives
  a reload. **At lg Browse opens on the first posting (Adrian 2026-11-12, #546, like Apply's first job; in place, an
  effect in `ReviewView`), so the detail is never empty; a decided posting is never picked again while its card
  collapses (`deciding`); with no posting left **the two columns stay** and `FindEmpty` (caught up, or nothing matches)
  is the right column (Adrian 2026-11-13), focus going to Find's h1; below lg nothing is selected when the tab opens.** A pick replaces the history entry at lg and pushes below lg (Back
  returns to the list); a decision on the selected posting selects the next one in the list (in place). The
  selected card is `aria-current` (`.rjb-selected`). **Apply and Follow up left Find** (each item shows on one tab
  only): Follow up is on the Apply list; `today.ts` and Resume applying are gone. Followed and Ignored
  companies are the Account menu's **Companies** item (`CompaniesDialog.tsx`, lazy; `companiesList.ts` reads the
  Feed's Sources: followed = boards + companies, A to Z, once by name; ignored = the muted Sources; one list at a
  time, Ignore = `muteCompany`, Follow again = `unmuteCompany`, plus `followCompany` for one with no Source; then Suggested (#576) and
  Found (#618), each only while it has rows; it opens on the first list with rows). Merges #426
  (Jobs keep list, one-page job page, no fit badge); "Find more like this" left the job menu with the ATS search. Pinned in `todayHome.test.tsx`, `review.test.tsx`,
  `companiesList.test.tsx`, `route.test.ts`, `e2e/today.spec.ts`, `e2e/review.spec.ts`, `e2e/auto-scan.spec.ts`.

- **The page bar (2026-11-12, a phone recording, #679):** Find / Apply (the `.rjb-segs` nav of links,
  `aria-current`, never a radio group) left the app bar for the **page bar**, the first row of `main`
  (`.rjb-page-bar` in App, `.rjb-main` keeps the 24 page rhythm under it) at top left, where the page title was; the
  app bar is the logo and Account, one row. No visible "Find" / "Apply" title: each page keeps its h1 as
  HDS `.sr-only` (focusRescue still focuses it; a job's title h1 stays visible). A page's own tools go
  to the bar's right through `PageBar.tsx` `InPageBar` (Find has none since the Deck went, 2026-11-13) (no scan line on Find since #694: it is Scan details')
  (a portal into App's slot, `pageBarSlot.ts`; inline when there is no bar, as in a unit test). Pinned in
  `appNav.test.tsx`, `shell.test.tsx`, `figmaRules.test.ts`.

- **Theme toggle + burn (#688):** the app bar's HDS `ThemeToggle` (left of the Account button, 44px; its own name
  "Switch to dark/light theme", no aria-pressed, HDS's contract) is the one theme switch; `src/burn/ThemeBurnToggle.tsx`,
  a lazy chunk with a 44px hold (`.rjb-theme-toggle-hold`). `ColorMode.burnToggle(at)` reveals the new theme from the
  tap point (the button's centre from the keyboard): `src/burn/burn.ts` (lazy, `importFresh`) runs a View Transition,
  holds it open and clips the new snapshot to `burnField.ts`'s front (`clip-path: path()`, a thin char band ahead of it).
  `BURN` is **locked** (Adrian 2026-11-13: 970 ms, cell 6.5, fps 10…; the char band's flat fill is `edgeColor` offtone (old surface darkened) | cobalt (`--primitive-color-blue-500`) | flame (`--primitive-color-cobalt-400`) at `edgeOpacity`; `burnField.test.ts`). **Generative (#690 follow-up):** `BURN.seed` is `null` in the app, so each burn picks a fresh seed (`random01`: `crypto.getRandomValues`, else `Math.random`) and a small variation (`pickVariant`: noise offset and rotation, ±10% on scale and gain, clamped), fixed for that burn (no flicker); a numeric seed (tests, the tuner, a recording) gives the same field every run. **The edge and the reveal share one geometry (#695 follow-up, Adrian's iPhone recording):** the edge layer
  (`burn.ts` `overlay`) is sized in px from the burn's own `innerWidth` × `innerHeight`, the same w × h as the field and
  the reveal clip, never `100vw`/`100vh` (on iOS `100vh` is the large viewport, which stretched the edge beside the
  hole); pinned in `burn/burnGeometry.test.ts`, `e2e/theme-toggle.spec.ts`. No View Transitions,
  reduced motion or Pause animations = an instant swap. Both theme-color metas take the page background on every
  swap (`ColorMode.syncThemeColor`). Save on Find flies the card to the Apply tab, which pulses (`saveFlight.ts`
  `saveRow`); the card burn is off (open choice). The Account sheet shows no focus ring on a row the pointer or a
  tap highlights (late.css); opened by the keyboard, the first row takes focus with its ring, also when the rows'
  chunk lands late. Pinned in `burnField.test.ts`, `colorModeBurn.test.tsx`, `shell.test.tsx`, `e2e/theme-toggle.spec.ts`.

- **Shell controls (Adrian 2026-11-09):** Find / Apply look like an HDS SegmentedControl (`.rjb-segs` / `.rjb-seg`
  in base.css, HDS tokens) but stay a `nav` of links with `aria-current="page"`, because HDS SegmentedControl is a
  radio group (ask: `docs/hds-upstream-asks/segmented-nav.md`, G7 hds#1438); **one app-bar row at every width (#548):**
  logo · Find / Apply · Account (the phone's 52px second row is gone; below sm the segments' sides narrow to 6 and the
  row's minimum gap is 4, so it fits at 375 and 390; where it cannot fit, a 320 screen, it wraps the tabs under the logo). Concentric corners (hds#1470): `.rjb-segs` sets
  `--seg-rail-radius`, `--seg-rail-pad` (= its real padding) and `--seg-inner-radius`, which `.rjb-seg` takes. The tabs
  show **a count on Review only** (see Two screens, Review's count: `TopTabCount.tsx`, `scanDetails.newToday`; Apply has
  none, the To apply view chip keeps its number; the bar wraps at 320, `e2e/shell-controls.spec.ts`). Review and Apply are equal segments (`.rjb-segs`
  `grid-template-columns: 1fr 1fr`, label centred, the whole segment the target, 44px tall on a phone): the link's name is its label and count ("Review 12"; `test/topTabs.ts`). **The logo is the home link (#620):** `.rjb-logo-link` around the `.rjb-logo` box (its 44px min-height is the target), named "roleflame, Review", never a heading;
  a plain click opens Find at its root from anywhere (on Find, back to its root, or to the top at the root), unlike
  a tab tap, which reopens where the tab was left. Find has no List / Deck switch since 2026-11-13 (list only). Segment pills
  nest in their track (`--seg-inner-radius` = rail radius less its pad) and draw the ledge as a gradient clipped by
  that radius (never a box shadow: the focus outline stays the one ring). The app bar's theme switch (`ThemeBurnToggle`) draws its icon at 28px, and the Account button
  matches it (the same 44px box and 28px icon, #694) (a base.css gap, registered in `docs/hds-upstream-asks-0.9.md`). Apply's **Remote only** has no control since
  2026-11-13: it **follows the Search profile's work mode, as Review does** (`usePipelineView` / `getPipelineView` set
  `remoteOnly` when `profile.mode === 'remote'`; the old per-device `rjb_apply_remote_only` key is left unread).
  `visibleJobs` keeps `keptUnderRemote`, Review's rule: `isRemoteJob` (#614: the job's mode when set, else
  `classifyRemote` on title + location, where a list offering remote among places, "Portland, OR, or Remote within
  Canada", counts) or a job with no mode and no place ("Remote not stated"); and **every count follows it**: the view
  chips (`filterCounts(…, remoteOnly)`), the pager and All jobs. A view change (named view or the profile's mode)
  that hides the open job opens the list's first job in place (`followView.ts`; none: at lg the job stays and the list
  says "No jobs match", below lg the page shows the view's empty state "Nothing under “…”" and no pager); search typing never moves it, and the lg rail has no "Not in this filter" card. **lg list
  column header (#614; control-free 2026-11-13):** Jobs + Add job, the chips, then the jobs. A closed job shows by its
  Closed badge on the row and the job's header (the "N closed on the board" status line and `useClosedOnBoard` are
  gone). Clear sample data is the Account menu's (only while sample jobs exist, `ClearSampleRow` in
  `AccountMenuRows.tsx`, `clearSample`). `.job-rail` pads its scroll box by a ring's width on every side (given back by a
  negative margin), so rings and the selected fill are never clipped (`e2e/sheet-gutter.spec.ts`). Pinned in `appNav.test.tsx`, `review.test.tsx`, `remoteOnly.test.tsx`,
  `e2e/shell-controls.spec.ts`.

- **Action feedback (#212):** every action answers within 300 ms: a toast, a state change with motion, or
  the item it made scrolled into view and flashed. `src/feedback.ts` (`flashRow`, `collapseRow`, `highlightNew`
  with `useHighlight`, `starClass`) drives `[data-motion=flash|collapse]` and `.rjb-pop` in `base.css` (HDS motion
  tokens only; reduced motion keeps the state and toast, drops the movement; so does the Account menu's **Pause animations**: `motionPref.ts` sets `data-rjb-motion="paused"` on `<html>` (`theme-init.js` at boot), `motionOk()` reads the choice, and `motionTokens.test.ts` fails on a raw length or curve in CSS or a keyframe animation with no off rule for both). Flash and collapse are an attribute,
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

- **Quick-add URL params** (handled in `App.tsx`): `?add=<url>`, `?applied=<url>`,
  `?status=<Status>&u=<url>`, optional `&t=<label>` — power the iOS shortcut /
  bookmarklet / Gmail-scan one-tap links. The URL is cleaned through the route seam
  (`navigate(…, true, { search })`), never a raw `history.replaceState`: route.ts must know the
  hash it is on, or a sheet's pop waits ~2 s for a hashchange that never comes (`shell.test.tsx`).
  Never rewrite the URL outside `route.ts`.
