# Apply screen

The saved list, named views, Add job, Export links and the tracker model.

- **One saved list (redesign §5.3, #534):** Apply is the saved list. Find's Save (primary, plus icon) toasts
  "Added to Apply: <title>" with Open and Undo; a double Save is a no-op (`alreadyInApply`); Undo toasts survive
  navigation for their full timeout (no route dismissal in `saveNotice.ts`). The star
  left the UI (StarButton, the menu's Star/Unstar, the Starred view, `.rjb-icon-filled`, `.rjb-pop*`); the
  `priority` field stays in the data, backups and CSV (and still sorts). More's last item is "Remove from Apply"
  ("Removed from Apply: <title>", Undo; focus to the next title). Pinned in `e2e/saved-list.spec.ts`, `e2e/review.spec.ts`.

- **Add job (redesign §5.10, #551):** `src/AddJobDialog.tsx`, its own component so any host opens it (`AddJob.tsx`
  is the button; the All jobs sheet, #543): the Job link field (helper "The title fills in from the link. You can
  edit it after."), Add job (filled) and "Type a company or title instead" (grey; turns the dialog into the Find
  box). No Cancel key: Close (the X), Escape, the scrim and Back cancel, focus back on the opener. Below sm a
  bottom sheet (`.rjb-bottom-sheet`, now `src/hds-gaps/BottomSheet.css`, lazy with All jobs and Add job; only
  the handle's `display: none` stays in base.css) above the keyboard (`AddJobDialog.css`), Add job at full width
  over the grey key; from sm HDS's centred dialog, Add job at the right. Pinned in `TrackerView.test.tsx`,
  `findBox.test.tsx`, `e2e/add-job.spec.ts`, `e2e/sheet-gutter.spec.ts`.

- **Named views (#541, redesign phase 2):** the Status select is gone. `pipelineView.ts` `Filter` is a named view:
  **To apply** (Saved, not set aside, not closed; sorted by closing date first, then the Sort's order, newest by
  default), **Follow up** (`deriveJobState(…).followUp.due`), **This week** (#640, Adrian 2026-11-12: `weekDateOf`, an
  interview or event from today through the next 6 days (`upcomingEvents`) or a Saved job's closing date in that
  window (`respondByJobs`), soonest first; it replaces the phone's lost Next 7 days section), **Interviewing**
  (Interviewing or Offer), **Applied**,
  **Recently closed** (`isClosed`: gone from the board or past its day; #602, where closed jobs collect and each is
  removed or kept; the automatic check is #602's own work), **Passed** (Adrian 2026-11-13, `passed.ts` +
  `PassedList.tsx`: jobs marked Not a fit or set aside (`archived`), each row with Delete (`removeWithUndo`: to Recently
  removed, Undo; Delete forever stays there), then "Skipped in Find": the `decided[]` Skips not `hidden`, newest
  first, with Save (`addJobDetailed`, verdict saved, Undo skips again), Undo skip (`decided.undo`, back in Find, Undo
  skips again) and Delete (`decided.hide`: `hidden: true`, stamped now so the later decision wins a merge; still
  decided, so it never comes back in Find; Undo lists it again). A Skip now keeps the posting's `title`, `company` and
  an http(s) `url` on its `decided` entry (`feed/decided.ts` `decide`; additive fields, sanitized, in sync, backup
  and the three-way merge, no blob bump); an older Skip has only its fingerprint and lists as "Skipped posting" with no
  link and no Save. The Passed count is its jobs (under the profile's Remote only) plus its listed Skips
  (`filterCounts(…, skipped)`); pinned in `passed.test.tsx`, `jobViews.test.tsx`), then **All jobs** (every job, set-aside ones too: the old
  Saved / Offer / Rejected / Retired / Closing soon filters went with the select). `JobViews.tsx` draws them as HDS `Tag` chips (`role="group"`
  "Views", `aria-pressed`, a `Badge` count, amber on Follow up while one is due), with no description line under them
  (2026-11-13): at the top of the lg list column (`JobRail`) and in the Jobs list (the All jobs sheet); on a phone the
  walk row's view picker picks them (#542). Default view To apply. **Control-free list (Adrian 2026-11-13):** no
  search, no Sort (newest first; To apply closing soonest first, This week soonest first), no Remote only switch, no
  status line, no sample line; `PipelineView` is `{ filter, remoteOnly? }` and only the view is the person's choice. Pinned in `pipelineView.test.ts`, `jobViews.test.tsx`.

- **Export links (2026-10-22):** one `ExportLinksHost` dialog (mounted in `DataToolsProvider`, open
  scope in `exportLinks.ts`) opened from the Account menu's Data dialog only (after Export CSV; #416 took it off the Jobs
  panel, #550 moved it into Data) on **All saved jobs**; its **This view** scope is the Jobs list as filtered (`visibleJobs`). Format Links only / With title and company; read-only
  Preview; Copy (`copyFilled`, falls back to selecting the text) and Download .txt
  (`linksFilename`: `<slug>-links-YYYY-MM-DD.txt`). `buildLinkList` skips non-web links (counted),
  dedupes, keeps order. Pinned in `exportLinks.test.ts`, `exportLinksDialog.test.tsx`,
  `e2e/export-links.spec.ts`.

- **Tracker model:** default "Active" filter = not-yet-applied (Saved) + pinned;
  applying drops a job out of the active queue. Follow-up loop: due 7 days after applying or the
  last follow-up. Every "Follow up" button (Pipeline Follow up section, Pipeline row, job header) opens the one
  `FollowUpHost` dialog (`FollowUp.tsx`, mounted in `App`; open job in `followUpFlow.ts`): the
  follow-up template filled via `templateFill.fillSnippet`, Copy message → Mark as sent (resets the clock; Undo in
  the dialog, since HDS Toast has no action slot) or Snooze 3 days (`Job.snoozeUntil`, normalized
  on read, syncs with the job). Closing changes nothing. Weak titles auto-derive from
  the URL. Board triage (pin / set-aside) lives in `tileTriage.ts` + `tileState.ts`;
  planned consolidation: saving also floats the tile (issue #13).
