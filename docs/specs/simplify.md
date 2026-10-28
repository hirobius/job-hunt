# Simplify RoleForge (spec summary)

The full spec, with the inventory, three designs and phone mocks, is [`simplify.html`](simplify.html). This file is the text summary of the decision.

## Decision (Adrian, 2026-10-28)

Adrian picked **design C, the Today home**, on one hard condition: **no loss of breadth.** He wants as many distinct design-system openings as possible, in a list he can click through and apply from.

- **Today** is the home page. It has three buttons (Review new, Apply, Follow up) and the line "N new today from M sources".
- **Review new** shows the same Feed two ways:
  - **Browse** (the default) is a list you can sort and filter. Open any posting, or Save or Skip it inline.
  - **Deck** is the one-card option.
- **Find** is one paste box. Paste a job link to save a Job, a board or company to follow it, or words to add titles to the profile.
- **Sources** is one synced list: boards of every kind, followed companies, and feeds.
  - Saving a job follows its company.
  - A dream company becomes a star on its Source.
  - **Add sources** helpers fill the list: Check a list, YC, GitHub org search, and the Adele seed.
- **Search profile** replaces tracks. It holds titles (the wide sweep runs over all of them), related titles, must include, leave out, pay floor, level, location and work mode. The design-systems scorer stays as it is (it sorts, it never hides). It is stored as `profiles[]` with one entry.
- **Feed** is one module that reads every source there is today:
  - feeds: HN (Who is hiring and Freelancer), Remotive, Jobicy, and the designsystems.jobs RSS
  - boards: Greenhouse, Lever, Ashby, Workable, Recruitee, SmartRecruiters, Teamtailor and Personio

  It has two adapters: the browser (signed out) and the server `postings` table (signed in).
- **Search elsewhere** keeps the Big job boards and ATS search as links.
- **Skip** hides that one posting, never its company. **Not this company** is a separate, explicit action that mutes the Source.
- **Breadth guard:** a recorded fixture test counts distinct postings from the same inputs, once through today's pipeline and once through the new Feed. It fails if the new Feed returns fewer.

## Data after (blob v12)

The blob keeps `jobs`, `documents`, `kit`, `trash` and `copydeck` (legacy), and adds three fields:

- `profiles[1]`
- `sources[]`: `{ kind, ref, label, star?, muted? }`
- `decided[]`: `{ fingerprint, verdict, at }`, by posting only, never by company

The server keeps three tables: `tracker`, `postings` and `sync_log`. `watched_companies` and `skips` are never deployed. The curation tables are frozen, then dropped after 30 days.

## Amendment 2 (relayed 2026-10-28)

- **Auto-scan** replaces every manual discovery control. It runs on the server cron twice a day and on the client when the app opens. One scan finds companies (YC, GitHub orgs, Adele, earlier lists), probes their boards, reads every board and feed over every title, scores everything, and re-checks saved jobs' boards. The only UI left is **Scan now** and "Last scanned hh:mm".
- **New companies** show their matching jobs at once, with **Follow / Ignore**.
- **Breadth first (amendment 3, supersedes the gates above):** the app's one job is to collect every design-system opening posted anywhere. A posting is listed when it passes two checks:
  - **the inclusion check:** its title or description names a design-system role, under the existing phrase rules (`feed/mustInclude.ts` `termRegex`)
  - **Adrian's profile filters:** leave out, location, mode, pay floor and level

  Everything else is counted as "N not design-system roles". There are no fit tiers. The scorer, Fit and screening stay as they are: they may sort or badge, never hide, and they get no new work. The server pre-filters with Postgres full-text search on the inclusion and leave-out terms.
- **Preview:** tapping a Browse row opens a short in-app sheet with the details, why it is listed, and Save / Skip / Not this company. **Open posting** is one tap away.
- **Jobs stays a top tab** (Today · Jobs). A proposal to simplify it hard is in section 7b of the spec, for Adrian to review.
- **Bug #417:** the board probe needs an identity check. It matched "Forward" to three different boards.

## What Adrian loses

- More than one track
- The curated tile boards (offered once as a links file)
- SAM.gov
- Calibrate as its own panel (its settings fold into the profile; saved searches give way to the Browse filter)
- Manual discovery buttons (the auto-scan does their work; Scan now covers "now")

## Slices (labelled needs-adrian)

1. #382: Safety rails. A guard stops older tabs from overwriting newer synced data, and the breadth guard fixture lands.
2. #383: Today home. The tabs become Today and Jobs.
3. #384: Blob v12 and the migration from v11.
4. #385: The Find box.
5. #386: The Feed and Review new (Browse with the preview, the inclusion check as the only gate, plus the Deck).
6. #387: The server adapter, with a full-text pre-filter on the inclusion terms.
7. #388: Onboarding becomes the Search profile form.
8. #415: Auto-scan.
9. #416: Simplify Jobs and the Pipeline (a proposal for Adrian to review first).
10. #389: Remove the old screens and manual controls.
11. #390: Cleanup.

Bug: #417, the board probe identity check.
