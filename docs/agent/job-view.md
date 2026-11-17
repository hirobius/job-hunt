# Job view

The job page: keys by state, the action dock, title block, notes, links, dates, the Company page and posting links.

- **Keys by state, sections with content (redesign §5.5 States, #540):** `src/dockKeys.ts` `dockKeys` is the one
  table of keys per state (`{ id, rank }` rows: filled / grey / exit; #575's table and #540's merged into it): to
  apply with a link, to apply with no link (`applicationLink`: the stored URL does not parse as http(s); a "No
  application link" fact, `AddLinkDialog.tsx` (its Link field takes focus) → `setJobUrl`, then focus on Open
  application; `checkJobLink` in `store.ts` refuses a link a browser cannot open or another job's before anything is
  saved, #593), follow-up due (Copy follow-up, then Mark followed up and Close out, those two with Undo, in `applyActions.ts`;
  More keeps "Follow up…" for the dialog), Interviewing (Add interview), else no dock. The "Templates (N)"
  disclosure (`ApplyTemplates`, `templatesOpen.ts`, `.rjb-template-row`, `ApplySheet.css`) is deleted. Pinned in `dockKeys.test.ts`, `jobPage.test.tsx`,
  `e2e/job-states.spec.ts`.
- **No Application kit on the job view (Adrian 2026-11-13):** the "Copy into the form" panel (`ApplySheet.tsx`,
  #539's copy chips, the kit's message rows and Custom answers) is deleted. The kit's data is kept: `applyKit.ts`
  (`rjb_apply_kit`, blob v6) stays in storage, sync, Back up and the merge, and its name still fills `[Your name]`.
  A stale template pick is no longer cleared (nothing reads it on screen). Pinned in `rapidApply.test.tsx`.

- **Action dock (redesign §5.5, #535/#536):** `src/hds-gaps/ActionDock.tsx` (+ `.css`, `fieldFocus.ts`; G1,
  hds#1432; in the JobPage chunk, nothing in base.css). Below lg it is a fixed dock portalled to `body` (a
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
  title when none is left. The dock is `position: fixed; bottom: 0` on body and never moves on scroll or overscroll (iOS rubber-band and the home-screen web app raised it half-way up, fix/dock-ios-scroll): `useDockLift` writes `--rjb-dock-lift` on visualViewport resize only, non-zero only while a keyboard is open (`keyboardOpen`) and a field has focus (`dockLift`); `html:has(.rjb-dock)` sets `overscroll-behavior-y: none` (no pull-to-refresh on dock pages only). It reserves one row for one key (`data-rows`) (#593). Pinned in `e2e/dock-ios-scroll.spec.ts` (Chromium iPhone 13 emulation).
  Pinned in `ActionDock.test.tsx`, `dockKeys.test.ts`, `rapidApply.test.tsx`, `jobPage.test.tsx`, `e2e/action-dock.spec.ts`.
- **Job Notes: a Save key (Adrian 2026-11-13, in place of saving while typing):** `TodosNotes.tsx` `NotesField` saves
  on its Save key (HDS secondary, on only while there are unsaved changes) and still on blur, tab hide, pagehide and
  unmount; beside the key a caption `role="status"` (polite) says "Saved to this job" after a save, empty again on the
  next edit (`notesSave.ts` `NOTES_STATUS`). "From when you saved it: …" shows the older `note` only when Notes does
  not already hold its text (`olderNoteLine`). **Copy** (Adrian 2026-11-16) is a second grey key beside Save: it copies
  what the field shows, saved or not (`templateCopy.ts`; a failed copy's toast holds the text), off while the field is
  empty, "Notes copied" on success. Pinned in `notesSave.test.ts`, `jobPage.test.tsx`.
- **Title block (redesign §5.5, #538):** `JobTitleBlock` in `JobHeader.tsx`: title (h1, `typography.title`,
  `rjb-break`), company or "Company not stated", HDS `Card.Facts` (place, pay or "Pay not stated", date), then
  `dueBadgeOf` (`jobDates.ts`) as an amber `src/hds-gaps/IconBadge.tsx` (G6, hds#1437) for Closing soon or
  Follow-up due. `JobBadges` drops the fit chips and the Saved chip everywhere (the verdict stays in the data).
  Pinned in `jobTitleBlock.test.tsx`, `e2e/title-block.spec.ts`.

- **One detail template at 1440 (#546, redesign §5.4):** `src/DetailHeader.tsx` (`DetailTitleBlock` + `DetailHeader`)
  is the one header for a saved job (`JobHeader`) and a Find posting (`ReviewView` `PostingDetail`): Back, the title
  block (h1, company or "Company not stated", HDS `Card.Facts`, then the badges; a posting's source is a neutral
  badge there, no blue New), More beside it (a posting's holds Not this company), one action row (`ActionDock`:
  Save filled, Skip grey, Open posting icon for a posting), then the content (a posting's "Description" `Panel`).
  **List cards carry no keys at 1440** (`PostingCard keys={!onOpen}`): the detail column has them; below lg each
  card keeps its own. **Find at lg opens on the first posting** (Adrian 2026-11-12; see Final shell). Shared by the JobPage and Today chunks, never the entry. Pinned in `review.test.tsx`,
  `figmaRules.test.ts`, `e2e/review.spec.ts` (`templateOf`: the posting's and the saved job's headers measure the same).

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

- **Company page (#230; #471 slice 2):** `#/apply/company/<slug>` (`route.companyHash` / `openCompany`,
  `companySlugOf`; the old `#/company/<slug>` redirects there in place) renders `CompanyPage` in the Apply tab:
  the company's Jobs, Documents and Notes, with Back (to the job it was opened from, else Apply). At ≥ lg the
  Apply list (`JobRail`, no row marked) sits beside it, as beside a job. The job page's Details Company fact links to it (only when the job has a company).
  An unknown slug shows a skeleton until `useCloudSync().settled`, then "No company here" (#303).
  Each Documents row links to its editor via `linkTo` (Back says "← <Company>"; an uploaded final copy is
  text only, #304). Notes are "Note 2 of 3" when several, each with a soft Remove + Undo; a notes-only
  company's last note goes back from the page and its Undo puts the note back without reopening it (#305, #593).

- **Posting links (Adrian 2026-10-22: anywhere a job is listed, its posting is one tap away).** A
  saved job's title opens its page in the app; `PostingLink.tsx` (`JobPostingLink` for a Job) is the
  quiet icon link to the posting right beside it (HDS icon-only Button as an `<a target=_blank>`,
  named "Open posting for <title> at <company>", tooltip "Open posting", nothing for a non-web
  URL). It sits beside the title, never inside a link: the Pipeline table and cards, the Follow up
  and Next 7 days rows, the closed-on-the-board list, Recently removed, the Company page, the job
  page header (all through `PostingTitle` / `JobPostingTitle`: the title shrinks and wraps anywhere,
  so a long unbroken title never runs under the link or pushes it off screen). **Apply rows carry no posting
  icon** (the lg column, since #543; Adrian accepts it, #640): the posting is one tap away
  through More → Open posting, and the job page's header has it. Its
  target overflows the title's line (`.rjb-posting-link` in `base.css`), so rows keep their rhythm,
  and is stacked above the text there, so all of it takes the tap; 44x44 on a phone. Unsaved listings (Find's Browse cards) have no page:
  below lg their title is the link out, with HDS's external icon (#544; at lg it selects the posting). Apply mode keeps Open application.
  **Labelled external links are HDS Button `external` (HDS 0.44):** Open application (the dock's key) and the
  follow-up dialog's Open posting show HDS's arrow after the label, which nudges on hover and focus (still under
  reduced motion); no leading ExternalLink icon. Icon-only posting links keep their icon.
  Pinned in `PostingLink.test.tsx`, the surface suites and `e2e/posting-links.spec.ts` (hit-tests
  every target: each pixel takes the tap, no overlap with another control; long titles at 390).
- **Company logos (2026-10-22):** `CompanyLogo.tsx` is an HDS `Avatar` per company (the To apply stack, Pipeline table and cards, job header (the 24px `inline` mark before the name, as on Find cards and Apply rows, 2026-11-13), job rail, Company page, Companies and dream rows): letter first, the logo only once `new Image()` has loaded it at 16px or more (lazy, no referrer; errors and DuckDuckGo's tiny placeholder keep the letter). `companyLogo.ts` is the one table-tested rule for the domain (company website first, then the posting's host; never a job board, ATS or aggregator host, `*.example.com`, localhost, IPs). Icons come from `icons.duckduckgo.com` (`img-src`, `legal.ts` THIRD_PARTIES, `csp.test.ts`); e2e specs abort that host, so baselines show letters.

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
