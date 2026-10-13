# Feature Roadmap — Hirebius (formerly Career Apply Board)

Working backlog for the tracker. Ordered by impact on actually landing a job.
The tracker stores each item as `{label, url, status}` in localStorage and mirrors
to Supabase as one JSON blob — so adding fields below needs **no DB migration**,
just a bigger object per row.

Legend: ⬜ todo · 🔧 in progress · ✅ done

---

## Phase 1 — The "apply engine" (highest ROI: raises reply rate)

- ✅ **Applied date + status pipeline** — when status flips to _Applied_, stamp the
  date. Foundation for everything below. (Status pills already cycle
  Saved → Applied → Interviewing → Offer → Rejected.)
- ✅ **Follow-up nudges** — flag any _Applied_ item with no movement after ~7–10
  days as "⏰ follow up". Most offers come from the nudge, not the first send.
- ✅ **Up Next queue** — pinned view of the next 5 _Saved_ (or starred) items to
  work, so you always know what to do without scrolling. Chunk through it.
- ✅ **Funnel analytics** — small dashboard: applied this week, total, **reply
  rate**, interview conversion. Tells you if the problem is volume or resume.

## Phase 2 — Tracking depth (better interviews, less re-work)

- ✅ **Per-job notes** — JD snapshot, why you want it, prep notes.
- ✅ **Recruiter / contact field** — name, referral source.
- ✅ **Priority / star + sort** — keep your 3 dream jobs above the 40 maybes.
  Priority pinning shipped early; the **Sort menu shipped later** (it was marked done
  before it existed). Now real: Recently added (default, newest first, with due
  follow-ups floated to the top), Follow-up due first, Applied date, Status, Salary,
  A–Z — retired always last, priority floats within its group (`src/jobSort.ts`).
- ✅ **Resume-version tag** — record which resume variant you sent per app.
- ✅ **Salary field** — target vs offered.

## Phase 3 — Application throughput tools

- ✅ **Cover-letter template copy board** — a few reusable templates
  (IT support / SOC / GRC) with `[Company]`/`[Role]` merge blanks and a Copy
  button each. Fill 2 blanks, send.
- ✅ **JD ↔ resume keyword match** — paste a job description, highlight the ATS
  keywords your master skill list is missing. Quick in-app self-check; deep
  tailoring done by the assistant (see Phase 4).
- ✅ **Company research quick-links** — per saved job, auto-build Glassdoor /
  LinkedIn / levels.fyi / careers-page links (same trick the board already uses).

## Navigation & UX

- ✅ **URL-synced navigation** — hash routing (no react-router): the top-level tab,
  Discover's sub-tab, and the active career pillar all live in the hash
  (`#/queue`, `#/discover/titles`, `?pillar=<id>`) and restore on refresh /
  back-forward. Queue is the default landing view; quick-add deep links still work
  (`src/route.ts`).
- ✅ **Sort, Saved filter, skeletons, empty states, autosave feedback** — see Phase 2
  for sort; the Tracker also has a Saved filter and a scrollable filter row on mobile,
  lazy views show layout-matched skeletons, empties use a shared `EmptyState`, and
  detail-field autosave shows a "Saved ✓" flash.
- ✅ **Accessibility** — tab/tabpanel ARIA associations, a named filter group, and one
  shared visible focus-visible ring; colour contrast (incl. the Interviewing chip) is
  AA-audited in `src/theme.contrast.test.ts`.

## Phase 3b — Live discovery

- ✅ **Live postings feed** (Discover → Live postings) — real openings from Hacker News "Who is
  hiring", Remotive, and Greenhouse/Lever/Ashby boards you watch, phrase-matched to the track's
  terms and ranked; flags **contract-friendly** and **first-hire** roles; one-click save to the
  Queue. Keyless and browser-side (all four APIs allow CORS), so no backend was needed.

## Phase 4 — The unfair advantage (assistant-driven, not in-app code)

These use the assistant's Gmail / Calendar / Drive access — no other tracker can.

- ⬜ **Inbox triage** — scan mail for confirmations / rejections / interview
  invites; report status changes.
- ⬜ **Auto-schedule** — interview email → Calendar event + prep reminder +
  follow-up reminder for silent apps.
- ⬜ **Weekly digest** — "3 apps quiet >10 days, 1 interview Thursday, here's prep
  - a tailored pitch."
- ⬜ **Per-JD cover letter / résumé tailoring** — paste a posting, get tailored
  bullets + missing keywords + a cover letter.

## Known limits

- Single static file, no backend; browsers block reading other sites (CORS), so
  **auto-importing a job's details from a pasted link isn't possible in-app**.
  Manual quick-fields or assistant-as-importer are the realistic paths.
- Don't hoard scraped posting URLs — they expire fast. Use filtered-search
  **funnels** + save the specific reqs that fit.
