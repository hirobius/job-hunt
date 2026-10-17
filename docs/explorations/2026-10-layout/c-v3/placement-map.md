# C v3 placement map (2026-10-17)

Every function in `../feature-inventory.md` (86) and where it lives in direction C v3. Source of truth: `placement.json` (the gallery and the Figma page read the same list).

**Gap fixes placed here (design only, no app code changed):** the weekly applied trend (I3) is shown in Insights; Teams (F18) searches with the track's own terms; Remove (P12) leaves an Undo row for 10 seconds.

**Dropped:** K8 Today notice. It announces Today as the home screen, and C has no Today.

**Not in the inventory but placed:** the wide sweep (#213, not on main) sits at the top of Find more → Search.

| # | Function | Status | Home | How |
|---|---|---|---|---|
| F1 | Apply now (featured sections) | Works | Companies (home) | "Your links" scope chip: the track's curated sections as company cards |
| F2 | Title search | Works | Find more · Title and ATS search | Find more → Title search, one row per board with Open |
| F3 | ATS search | Works | Find more · Title and ATS search | Find more → ATS search (community clauses unverified live) |
| F4 | Live postings | Works | Find more · Openings | Find more → Openings: the ranked list; also feeds the role counts on Companies |
| F5 | Source: HN Who is hiring | Works | Filters sheet | Filters → Sources toggle |
| F6 | Source: Remotive | Works | Filters sheet | Filters → Sources toggle, with its 4-a-day budget note |
| F7 | Source: Jobicy | Works (unverified live) | Filters sheet | Filters → Sources toggle, marked unverified |
| F8 | Source: Remote OK | Off | Filters sheet | Filters → Sources toggle, disabled and marked Off (legal notice unread) |
| F9 | Source: company boards | Works | Companies · Starred scope | Starred → Check now reads every starred board, "Read N of M" |
| F10 | Per-source retry | Works | Find more · Openings | Openings → one failed-source Alert with Retry |
| F11 | Targeting | Works | Filters sheet | Filters → Leave out, Level, Pay floor, each with a hidden-by count |
| F12 | Saved searches | Works | Filters sheet | Filters → Saved searches select + Save search |
| F13 | Openings / Companies view | Works | Companies (home) | Is the home screen: companies grouped from openings (Find more keeps the flat Openings list) |
| F14 | Fit from evidence | Works | Company | Fit badge on each role; evidence text lives in Filters → Your evidence |
| F15 | Watch a company | Works | Company | Star on a company = watch its board; also "Add a company" in Find more |
| F16 | Suggested companies | Works | Companies (home) | Card at the end of the list: Add suggested companies (N) |
| F17 | Find boards | Works | Find more · Boards and Teams | Find more → Boards: paste a list or load a YC batch (YC unverified live) |
| F18 | Teams | Partial | Find more · Boards and Teams | Find more → Teams, now searched with the track's own terms (fix noted; GitHub unverified live) |
| F19 | Outreach targets list | Works | Companies (home) | "To contact" scope chip on Companies |
| F20 | Find more like this | Works | Job · Overview | Job "…" menu → opens Find more seeded with the title |
| F21 | Location + work mode | Works | Companies (home) | Context button under search ("Spokane · Hybrid") opens a popover |
| F22 | Tile details | Works | Company | Company page facts: chips, phone, links |
| F23 | Set aside / restore tile | Works | Companies (home) | Company card "…" → Set aside; Filters → Show set aside |
| S1 | Quick add | Works | Pipeline (To apply) | Paste-a-link field at the top of the Pipeline |
| S2 | Save a tile | Works | Companies (home) | Save on a "Your links" card |
| S3 | Save a posting | Works | Company | One Save per role card |
| S4 | Quick-add URL params | Works | Pipeline (To apply) | No UI; lands on the Pipeline with a toast (system) |
| S5 | Dedup | Works | Pipeline (To apply) | No UI; "Already saved" state on a role's Save (system) |
| P1 | Pipeline list | Works | Pipeline (To apply) | Cards on phone; HDS Table on desktop |
| P2 | Status filter | Works | Pipeline (To apply) | Stage chips: To apply · Follow up · Applied · Interviewing · Offer · Closed |
| P3 | Search | Works | Pipeline (To apply) | Search field beside the paste field (icon on phone) |
| P4 | Sort | Works | Pipeline (To apply) | Sort select in the toolbar; sortable headers on desktop |
| P5 | Row next step | Works | Pipeline (To apply) | One button per card: Apply (opens the Apply sheet) or Log follow-up |
| P6 | Row menu | Works | Pipeline (To apply) | Card "…": Open posting, Star, Retire, Find more like this, Remove |
| P7 | Priority star | Partial | Job · Overview | Star in the job header shows filled + "Starred" text (PR #214 fix) |
| P8 | Job page | Works | Job · Overview | Job screen with tabs Overview · Screening · Interviews · To-dos |
| P9 | Job rail | Works | Job · desktop with rail | Desktop: list beside the open job |
| P10 | Overview facts + edit | Works | Job · Overview | Facts list + Edit button in the facts header |
| P11 | Research links | Works | Job · Overview | Overview → Research row |
| P12 | Remove job | Works | Pipeline · Follow up + This week | Remove → the card turns into "Removed · Undo" for 10 s (gap fixed) |
| P13 | Liveness check | Works | Pipeline (To apply) | One-line Alert: "2 saved jobs closed on the board" |
| P14 | Retire | Works | Pipeline (To apply) | Card "…" → Retire; Closed chip shows them |
| A1 | Mark applied | Works | Apply sheet | Apply sheet's primary button; sets the follow-up |
| A2 | JD screener | Works | Job · Screening | Screening tab → paste JD → Use suggestions |
| A3 | Screening editor | Works | Job · Screening | Screening tab fields below the screener |
| A4 | Use template | Works | Apply sheet | Apply sheet: pick a template, preview filled, Copy |
| U1 | Follow-up clock | Works | Pipeline · Follow up + This week | Card line "Follow up in 3 days"; Follow up chip |
| U2 | Today: due follow-ups | Works | Pipeline · Follow up + This week | Follow up stage chip (replaces Today) |
| U3 | Today: next 7 days | Works | Pipeline · Follow up + This week | "This week" list at the top of Follow up |
| U4 | Interview log | Works | Job · Interviews | Interviews tab: list + Add interview |
| U5 | Add to calendar | Works | Job · Interviews | Interviews tab → Add to calendar (.ics) |
| U6 | To-dos + notes | Works | Job · To-dos | To-dos tab: checklist + Notes |
| T1 | Templates list | Works | Templates sheet | Templates sheet (from Apply sheet or Account menu) |
| T2 | Template editor | Works | Template editor | Editor sheet with token chips, Write / Preview |
| T3 | Fill preview | Works | Apply sheet | Apply sheet preview is filled from the job |
| T4 | Copy filled | Works | Apply sheet | Apply sheet → Copy |
| T5 | Pin / Duplicate / Delete | Works | Template editor | Editor "…" menu |
| T6 | New snippet | Works | Templates sheet | Templates sheet → New template |
| T7 | Restore starter set | Works | Templates sheet | Templates sheet → Restore starter templates |
| I1 | Metric tiles | Works | Pipeline · Insights | Insights panel at the end of the Pipeline |
| I2 | Funnel | Works | Pipeline · Insights | Insights → stage funnel |
| I3 | Weekly applied trend | Placeholder | Pipeline · Insights | Insights → 8-week bars (gap fixed: now shown) |
| K1 | Onboarding | Works | First run | First run, step 1 of 3 |
| K2 | Starter packs | Works | Track sheet | Track sheet → New track from a pack; also first run |
| K3 | Track switcher | Works | Track sheet | Header track button opens the Track sheet |
| K4 | New track | Works | Track sheet | Track sheet → New track |
| K5 | Manage track | Works | Track sheet | Track sheet → Manage this track |
| K6 | Getting started | Works | Companies · first week | Card at the top of Companies in the first week |
| K7 | Sample data | Works | First run | First run → Try with sample data |
| K8 | Today notice | Works | Dropped | DROP: it announces Today as home, and C removes Today |
| D1 | Sign in (magic link) | Works | Sign in | Account menu → Sign in → dialog |
| D2 | Cloud sync | Works | Account menu | Automatic; status line at the top of the Account menu |
| D3 | Sync nudge + dot | Works | Account menu | Dot on the Account button; one line in the menu |
| D4 | Sign out | Works | Account menu | Account menu |
| D5 | Delete my data | Works | Account menu | Account menu (danger) |
| D6 | Back up | Works | Account menu | Account menu |
| D7 | Restore | Works | Account menu | Account menu |
| D8 | Export CSV | Works | Account menu | Account menu |
| D9 | Theme | Works | Account menu | Account menu |
| D10 | Density | Works | Account menu | Account menu |
| D11 | Send feedback | Works | Account menu | Account menu |
| Y1 | Error boundary | Works | Something broke | Full-screen fallback with Reload / Reset |
| Y2 | Hash routes | Works | Companies (home) | No UI; old slugs redirect to Companies / Pipeline (system) |
| Y3 | Toasts | Works | Company | Save → "Saved to Pipeline" toast |
| Y4 | Save flash | Works | Job · To-dos | "Saved" note beside Notes |
| Y5 | Rate budgets | Works | Find more · Boards and Teams | Caption under Teams / Boards: "GitHub: 6 searches left this minute" |
