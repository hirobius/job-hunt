# Feature roadmap: RoleForge

Working backlog for the tracker. Ordered by impact on actually landing a job.
The tracker stores each item as `{label, url, status}` in localStorage and mirrors
to Supabase as one JSON blob, so adding fields below needs **no DB migration**,
just a bigger object per row.

Legend: ⬜ todo · 🔧 in progress · ✅ done

---

## Phase 1, The "apply engine" (highest ROI: raises reply rate)

- ✅ **Applied date + status pipeline**, when status flips to _Applied_, stamp the
  date. Foundation for everything below. (Status pills already cycle
  Saved → Applied → Interviewing → Offer → Rejected.)
- ✅ **Follow-up nudges**, flag any _Applied_ item with no movement after ~7–10
  days as "⏰ follow up". Most offers come from the nudge, not the first send.
- ✅ **Active queue**: the default view shows what is still _Saved_ plus anything
  you pinned; applying drops a job out of it, so you always know what to do next.
- ✅ **Funnel analytics** (cut 2026-10-17, no longer in the app), small dashboard: applied this week, total, **reply
  rate**, interview conversion. Tells you if the problem is volume or resume.

## Phase 2, Tracking depth (better interviews, less re-work)

- ✅ **Per-job notes**, JD snapshot, why you want it, prep notes.
- ✅ **Recruiter / contact field**, name, referral source.
- ✅ **Priority / star + sort**, keep your 3 dream jobs above the 40 maybes.
  Priority pinning shipped early; the **Sort menu shipped later** (it was marked done
  before it existed). Now real: Recently added (default, newest first, with due
  follow-ups floated to the top), Follow-up due first, Applied date, Status, Salary,
  A–Z, retired always last, priority floats within its group (`src/jobSort.ts`).
- ✅ **Resume-version tag**, record which resume variant you sent per app.
- ✅ **Salary field**, target vs offered.

## Phase 3, Application throughput tools

- ✅ **Cover-letter template copy board**, a few reusable templates
  (IT support / SOC / GRC) with `[Company]`/`[Role]` merge blanks and a Copy
  button each. Fill 2 blanks, send. (Now the Documents library, #227: `#/copy-deck`, opened
  from the Account menu, with Versions, a Sent copy per job and `[Variable]` chips filled for a
  saved job. Apply mode lists every Outreach message filled for the job it shows.)
- ✅ **JD ↔ resume keyword match**, paste a job description, highlight the ATS
  keywords your master skill list is missing. Quick in-app self-check; deep
  tailoring done by the assistant (see Phase 4).
- ✅ **Company research quick-links**, per saved job, auto-build Glassdoor /
  LinkedIn / levels.fyi / careers-page links (same trick the board already uses).

## Navigation & UX

- ✅ **URL-synced navigation**, hash routing (no react-router): two tabs, Companies
  (`#/discover`, home) and Pipeline (`#/queue`), plus pages for a job (`#/queue/<id>`), Apply mode
  (`#/apply/<id>`), a Company (`#/company/<slug>`) and Documents (`#/copy-deck`). They restore on
  refresh and back-forward, and each sets the page title. Today (`#/today`) is retired and
  redirects to Companies; the Titles tool is folded into Live postings' Calibrate
  (`#/discover/titles` redirects). Quick-add deep links land on the Pipeline (`src/route.ts`,
  `src/App.tsx`).
- ✅ **Sort, Saved filter, skeletons, empty states, autosave feedback**, see Phase 2
  for sort; the Pipeline also has Status and Sort menus and a Clear filters button,
  lazy views show layout-matched skeletons, empties use a shared `EmptyState`, and
  detail-field autosave shows a "Saved ✓" flash.
- ✅ **Accessibility**, tab/tabpanel ARIA associations, a named filter group, and one
  shared visible focus-visible ring; colour contrast (incl. the Interviewing chip) is
  AA-audited in `src/theme.contrast.test.ts`.

## Phase 3b, Live discovery

- ✅ **Live postings** (Companies → Live postings): real openings from Hacker News "Who is hiring",
  Remotive, Jobicy and the Greenhouse, Lever, Ashby, Workable and Recruitee boards you watch.
  Matched to the track's terms and ranked. Flags contract and first-hire roles. Reads every watched
  board, 6 at a time. One click saves a posting to the Pipeline. No backend and no keys.
- ✅ **Role radar**: paste your evidence, and each posting shows fit and gaps. A Strong fit filter
  and a "What these postings ask for" roll-up sit above the list. Starter packs bring a directory
  of boards to watch.
- ✅ **Wider ATS search** (Companies → ATS search): 18 hiring systems and 3 large per-tenant systems
  through Google, a set of freelance, startup and remote boards, and a Contract only switch.
- ✅ **Track sync**: a refused write shows a toast and Retry sync in Account. A journal replays it.
  An empty cloud never wipes local tracks. Sign-out warns about unsynced tracks.

## Phase 4, The unfair advantage (assistant-driven, not in-app code)

These use the assistant's Gmail / Calendar / Drive access, no other tracker can.

- ⬜ **Inbox triage**, scan mail for confirmations / rejections / interview
  invites; report status changes.
- ⬜ **Auto-schedule**, interview email → Calendar event + prep reminder +
  follow-up reminder for silent apps.
- ⬜ **Weekly digest**, "3 apps quiet >10 days, 1 interview Thursday, here's prep
  - a tailored pitch."
- ⬜ **Per-JD cover letter / résumé tailoring**, paste a posting, get tailored
  bullets + missing keywords + a cover letter.

## Known limits

- No backend for job data; browsers block reading other sites (CORS), so
  **auto-importing a job's details from a pasted link isn't possible in-app**.
  Manual quick-fields or assistant-as-importer are the realistic paths.
- Don't hoard scraped posting URLs, they expire fast. Use filtered-search
  **funnels** + save the specific reqs that fit.
