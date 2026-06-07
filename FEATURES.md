# Feature Roadmap — Career Apply Board

Working backlog for the tracker. Ordered by impact on actually landing a job.
The tracker stores each item as `{label, url, status}` in localStorage and mirrors
to Supabase as one JSON blob — so adding fields below needs **no DB migration**,
just a bigger object per row.

Legend: ⬜ todo · 🔧 in progress · ✅ done

---

## Phase 1 — The "apply engine" (highest ROI: raises reply rate)
- ⬜ **Applied date + status pipeline** — when status flips to *Applied*, stamp the
  date. Foundation for everything below. (Status pills already cycle
  Saved → Applied → Interviewing → Offer → Rejected.)
- ⬜ **Follow-up nudges** — flag any *Applied* item with no movement after ~7–10
  days as "⏰ follow up". Most offers come from the nudge, not the first send.
- ⬜ **Up Next queue** — pinned view of the next 5 *Saved* (or starred) items to
  work, so you always know what to do without scrolling. Chunk through it.
- ⬜ **Funnel analytics** — small dashboard: applied this week, total, **reply
  rate**, interview conversion. Tells you if the problem is volume or resume.

## Phase 2 — Tracking depth (better interviews, less re-work)
- ⬜ **Per-job notes** — JD snapshot, why you want it, prep notes.
- ⬜ **Recruiter / contact field** — name, referral source.
- ⬜ **Priority / star + sort** — keep your 3 dream jobs above the 40 maybes.
- ⬜ **Resume-version tag** — record which resume variant you sent per app.
- ⬜ **Salary field** — target vs offered.

## Phase 3 — Application throughput tools
- ⬜ **Cover-letter template copy board** — a few reusable templates
  (IT support / SOC / GRC) with `[Company]`/`[Role]` merge blanks and a Copy
  button each. Fill 2 blanks, send.
- ⬜ **JD ↔ resume keyword match** — paste a job description, highlight the ATS
  keywords your master skill list is missing. Quick in-app self-check; deep
  tailoring done by the assistant (see Phase 4).
- ⬜ **Company research quick-links** — per saved job, auto-build Glassdoor /
  LinkedIn / levels.fyi / careers-page links (same trick the board already uses).

## Phase 4 — The unfair advantage (assistant-driven, not in-app code)
These use the assistant's Gmail / Calendar / Drive access — no other tracker can.
- ⬜ **Inbox triage** — scan mail for confirmations / rejections / interview
  invites; report status changes.
- ⬜ **Auto-schedule** — interview email → Calendar event + prep reminder +
  follow-up reminder for silent apps.
- ⬜ **Weekly digest** — "3 apps quiet >10 days, 1 interview Thursday, here's prep
  + a tailored pitch."
- ⬜ **Per-JD cover letter / résumé tailoring** — paste a posting, get tailored
  bullets + missing keywords + a cover letter.

## Known limits
- Single static file, no backend; browsers block reading other sites (CORS), so
  **auto-importing a job's details from a pasted link isn't possible in-app**.
  Manual quick-fields or assistant-as-importer are the realistic paths.
- Don't hoard scraped posting URLs — they expire fast. Use filtered-search
  **funnels** + save the specific reqs that fit.
