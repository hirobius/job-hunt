# Every design-system job: where they are and how RoleForge can read them

Researched 2026-10-28 (five parallel research passes plus live checks from the build container).
Goal (Adrian): aggregate every design-system job posted on the internet, legally, with no paid key
where possible. Builds on `docs/research/job-sources.md` (2026-10-15), which covered general
remote/ATS sources; this one is scoped to design-system roles and ranks by yield.

## Read this first

- **Live checks.** The container's proxy reached only some hosts. Everything marked **live** was
  measured on 2026-10-28. Everything else is **official** (from the source's own pages via search)
  or **secondary** (third-party write-ups). Untested CORS cells are unknown, not "no".
- **Counts are estimates** unless marked live. "DS jobs" = roles about design systems work
  (designer, engineer, lead, design technologist).
- **The big finding:** design-system roles live on company ATS boards (Greenhouse, Lever, Ashby,
  Workday…) and on the two niche boards that crawl those ATSs. General remote boards and design
  boards carry almost none (Remotive: **0 of 10** results for "design system", live). So "every
  DS job" is mostly a _company coverage_ problem, not a _job board_ problem.

## What the app reads today

| Where                                       | Sources                                                                                                                                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser (`src/feed/sources/`)               | HN "Who is hiring?" + "Freelancer?" (Algolia), Remotive, Jobicy (on), Remote OK (off), SAM.gov (Contracts track); company boards: Greenhouse, Lever, Ashby, Workable, Recruitee, SmartRecruiters, Teamtailor, Personio |
| Browser, company discovery                  | GitHub design-system orgs (`dsOrgs.ts`), YC mirror `hiring.json`, UXPin Adele snapshot, the board probe (`feed/probe.ts`)                                                                                              |
| Server (`supabase/functions/sync-postings`) | `watched_companies` on **Greenhouse, Lever, Ashby only**; designsystems.jobs RSS (morning run). Not yet deployed.                                                                                                      |

**Bug found (live):** `src/feed/sources/hn.ts` picks threads with `tags=story,author_whoishiring`.
Since late 2025 the monthly "Freelancer? Seeking freelancer?" thread is posted by `jon_north`
(Oct 2026 = item 49922572), so the app has been reading only the Oct 2025 freelancer thread. Fix is
in the top 5.

## Source by source

Columns: access · key · terms · rate limit · DS jobs (at a time unless noted) · CORS · in app?

### Niche design-system boards

| Source                                                                              | Access                                                                                                                                                                                                                                                      | Key | Terms / attribution                                                                                                                                                                                                                                              | Limits                                 | DS jobs                                                                            | CORS                               | In app               |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------- | -------------------- |
| **designsystems.jobs**                                                              | RSS `/feed` (newest **20** only); `sitemap.xml` lists **112** live job pages + **689** company pages; each job page has schema.org `JobPosting` JSON-LD (title, datePosted, hiringOrganization + website, location, employmentType, description) — **live** | No  | No terms page (all 404); `robots.txt`: `Allow: /` (**live**). Its disclaimer says it syncs from Greenhouse, Lever, Ashby, Workday, Workable, Personio, SmartRecruiters "and others" and that the original listing is authoritative. Link to its page, credit it. | None stated; sitemap `lastmod` per URL | **112 live**; ~10 new/week (feed spans 13–27 Oct)                                  | No ACAO header (**live**) → server | RSS only (20 of 112) |
| **Into Design Systems** jobs (jobs.intodesignsystems.com)                           | HTML + a keyless read-only **MCP server** at `/mcp` (search, read posting, stats, companies)                                                                                                                                                                | No  | Terms not reachable; the MCP is pitched for a user's own AI agent, not app-to-app. **Ask the operator first.**                                                                                                                                                   | Unknown                                | **225–259** (its Sept 2026 hiring report; secondary) — the largest curated DS list | Unknown → server                   | No                   |
| designbetter.careers `/design-jobs/design-systems`                                  | HTML                                                                                                                                                                                                                                                        | —   | Unknown                                                                                                                                                                                                                                                          | —                                      | a few dozen (secondary)                                                            | —                                  | No (link)            |
| weloveproduct, @DSJobBoard (X), DS House / Coalition, zeroheight / Supernova boards | HTML / social / none                                                                                                                                                                                                                                        | —   | —                                                                                                                                                                                                                                                                | —                                      | ~0 or dormant                                                                      | —                                  | Skip                 |

### Design boards

| Source                                                                                      | Access                           | Key     | Terms                                                      | DS jobs  | Verdict          |
| ------------------------------------------------------------------------------------------- | -------------------------------- | ------- | ---------------------------------------------------------- | -------- | ---------------- |
| Dribbble Jobs                                                                               | HTML only                        | —       | Terms ban automated access (secondary; paid scrapers only) | < 10     | Link only        |
| Behance / Adobe Talent                                                                      | HTML                             | —       | —                                                          | low      | Link only        |
| Working Not Working                                                                         | members-only                     | account | invite-only                                                | low      | Skip             |
| Coroflot                                                                                    | RSS per listing (secondary)      | no      | Core77 terms unread                                        | 0–3      | Maybe, low yield |
| Authentic Jobs                                                                              | RSS (secondary)                  | no      | unknown                                                    | 0–3      | Maybe, low yield |
| UXJobsBoard, IxDA, Smashing Jobs, Design Jobs Board UK, Uxcel, UX Collective, Designer Fund | HTML                             | —       | —                                                          | low each | Skip / link      |
| Krop                                                                                        | shut down early 2024 (secondary) | —       | —                                                          | 0        | Skip             |

### Remote boards

| Source                                            | Access                                        | Key      | Terms / attribution                                                                                   | Limits            | DS jobs      | CORS                         | In app    |
| ------------------------------------------------- | --------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- | ----------------- | ------------ | ---------------------------- | --------- |
| Remotive                                          | JSON `/api/remote-jobs`                       | No       | Link to Remotive URL + name Remotive; 24 h delay; no sign-up capture (official, in the live response) | 4/day             | **0 (live)** | `*` (live)                   | Yes       |
| Jobicy                                            | JSON v2 + RSS                                 | No       | Keep Jobicy as source + canonical URL                                                                 | ≤ 1/hour          | 0–3          | untested                     | Yes (on)  |
| Remote OK                                         | JSON `/api` (first item = legal notice)       | No       | Followed link back + "Remote OK"; no logo                                                             | —                 | 0–3          | untested (host blocked here) | Yes (off) |
| Himalayas                                         | JSON `/jobs/api`, `/jobs/api/search`, OpenAPI | No       | Link back; don't resubmit to other job boards; drop expired (secondary)                               | ~60/min?, 20/page | 2–8          | untested                     | No        |
| We Work Remotely                                  | RSS per category                              | No       | Attribute to WWR; API is for posting only                                                             | —                 | 0–2          | likely none → server         | No        |
| 4dayweek.io                                       | JSON `/api/v2/jobs` + RSS                     | No       | Link back (official dev page)                                                                         | 60/min/IP         | 0–2          | untested                     | No        |
| Working Nomads                                    | JSON `/api/exposed_jobs/`                     | No       | none found                                                                                            | —                 | 0–2          | untested                     | No        |
| The Muse                                          | JSON `/api/public/jobs`                       | optional | none found                                                                                            | 500/h keyless     | 0–3          | untested                     | No        |
| Arc.dev, Remote.co, JustRemote, NoDesk, Arbeitnow | HTML / paid / DE-heavy                        | —        | —                                                                                                     | —                 | ~0           | —                            | Skip      |

### Startup boards

| Source                       | Access                                             | Terms                                     | DS jobs                          | Verdict              |
| ---------------------------- | -------------------------------------------------- | ----------------------------------------- | -------------------------------- | -------------------- |
| Wellfound                    | HTML, logged-out 403                               | bans automated access (secondary)         | 5–15                             | Link only            |
| YC Work at a Startup         | HTML; yc-oss mirror JSON (~1,400 hiring companies) | WaaS terms not found; mirror is community | companies, not jobs              | Keep mirror (in app) |
| Otta / Welcome to the Jungle | HTML only                                          | no API                                    | 3–10                             | Link only            |
| Built In                     | HTML only                                          | no API                                    | 5–15                             | Link only            |
| Levels.fyi jobs              | HTML only                                          | no API                                    | 3–10                             | Link only            |
| HN Jobs (YC job stories)     | Algolia `tags=job` / Firebase                      | none                                      | **0 ever** match "design system" | Skip                 |

### Aggregators

| Source                                                   | Access / key                                                                          | Terms                                                                                                                                            | Limits          | DS jobs         | Verdict                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | --------------- | ----------------------------------- |
| **TheirStack**                                           | `POST /v1/jobs/search`, key, **200 credits/mo free** (1 credit/job, official pricing) | commercial API; title filters `job_title_or` / `job_title_pattern_or`                                                                            | free tier small | ~200–500 global | **Add** (server; best title filter) |
| Adzuna                                                   | free app_id + key                                                                     | 25/min, 250/day, 1,000/week, 2,500/month; every row shows a "Jobs by Adzuna" label; commercial use is a 14-day trial then licence (official ToS) | as stated       | ~30–150         | Maybe (ask Adzuna re: commercial)   |
| Jooble                                                   | free key on request                                                                   | terms not found; links via Jooble                                                                                                                | —               | ~50–150         | Maybe                               |
| Careerjet                                                | publisher key; must send end-user IP + UA                                             | affiliate program                                                                                                                                | —               | ~30–100         | Maybe, awkward                      |
| Fantastic.jobs                                           | RapidAPI, ~$1 per 1k jobs, trial                                                      | ATS-derived, 54 ATSs                                                                                                                             | —               | ~150–400        | Maybe (cheapest paid)               |
| SerpApi / SearchApi / Serper / ScrapingDog (Google Jobs) | key; SerpApi 250 searches/mo free                                                     | Google sued SerpApi (Dec 2025, DMCA §1201) — source may not last                                                                                 | 50/h free       | ~100–300        | Maybe, legal risk                   |
| Google Jobs direct                                       | no API                                                                                | scraping Google is not allowed                                                                                                                   | —               | —               | **Not allowed**                     |
| LinkedIn (incl. `jobs-guest`)                            | partner-only                                                                          | User Agreement §8.2 bans scrapers; hiQ lost on contract ($500k + injunction)                                                                     | —               | many            | **Not allowed**                     |
| Indeed                                                   | Publisher API retired                                                                 | ToS bans extraction                                                                                                                              | —               | many            | **Not allowed**                     |
| Glassdoor, ZipRecruiter, Talent.com                      | closed / partner-only                                                                 | —                                                                                                                                                | —               | —               | Skip                                |
| JobSpy-style scrapers                                    | open-source scrapers of the above                                                     | break each site's ToS                                                                                                                            | —               | —               | **Not allowed**                     |
| USAJOBS                                                  | free key                                                                              | official                                                                                                                                         | 500 rows/page   | 0–5             | Skip (wrong market)                 |
| Coresignal                                               | trial only, then $49+/mo                                                              | licence                                                                                                                                          | —               | ~200–500        | Skip                                |
| Common Crawl JobPosting                                  | bulk, monthly                                                                         | open data                                                                                                                                        | —               | stale           | Research only                       |

### ATS public job APIs

| ATS                                              | Endpoint                                                                                         | Key                                                                            | Live / CORS                                          | Find its companies                                                       | Verdict                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Greenhouse                                       | `boards-api.greenhouse.io/v1/boards/<slug>/jobs`                                                 | No                                                                             | **200, `*` (live, figma: 142 jobs)**                 | Common Crawl CDX `job-boards.greenhouse.io/*` + `boards.greenhouse.io/*` | In app + server                                                                                    |
| Lever                                            | `api.lever.co/v0/postings/<slug>?mode=json`                                                      | No                                                                             | **200, `*` (live, spotify: 89)**; 404 = not on Lever | CDX `jobs.lever.co/*`                                                    | In app + server                                                                                    |
| Ashby                                            | `api.ashbyhq.com/posting-api/job-board/<slug>`                                                   | No                                                                             | **200, `*` (live, ramp: 172)**                       | CDX `jobs.ashbyhq.com/*`                                                 | In app + server                                                                                    |
| Workable                                         | `apply.workable.com/api/v1/widget/accounts/<slug>?details=true`                                  | No                                                                             | untested                                             | CDX `apply.workable.com/*`                                               | Browser only; add to server                                                                        |
| Recruitee                                        | `<slug>.recruitee.com/api/offers/`                                                               | No                                                                             | untested                                             | crt.sh `%.recruitee.com`                                                 | Browser only; add to server                                                                        |
| SmartRecruiters                                  | `api.smartrecruiters.com/v1/companies/<id>/postings` (limit/offset)                              | No (docs disagree)                                                             | untested                                             | —                                                                        | Browser only                                                                                       |
| Teamtailor                                       | `<slug>.teamtailor.com/jobs.json` — **no source documents this path**; documented is `/jobs.rss` | No                                                                             | untested                                             | crt.sh                                                                   | Browser only; check path                                                                           |
| Personio                                         | app uses `search.json` (undocumented); documented public feed is `<slug>.jobs.personio.de/xml`   | No                                                                             | untested                                             | crt.sh                                                                   | Browser only; add `/xml` fallback                                                                  |
| **Gem**                                          | public "Job Board API" (help.gem.com); exact path unconfirmed                                    | No (per vendors)                                                               | untested                                             | CDX `jobs.gem.com/*`                                                     | **Best new ATS** (startup-heavy)                                                                   |
| BambooHR                                         | `<sub>.bamboohr.com/careers/list` (undocumented)                                                 | No                                                                             | untested                                             | crt.sh                                                                   | Maybe, low yield (SMB)                                                                             |
| Breezy                                           | `<co>.breezy.hr/json` (some turn it off)                                                         | No                                                                             | untested                                             | crt.sh                                                                   | Maybe, low yield                                                                                   |
| Pinpoint                                         | `<co>.pinpointhq.com/jobs.rss`                                                                   | No                                                                             | untested                                             | crt.sh                                                                   | Low priority                                                                                       |
| Rippling                                         | no confirmed public JSON; scrapers read `__NEXT_DATA__`                                          | —                                                                              | —                                                    | CDX `ats.rippling.com/*`                                                 | Skip until an endpoint is confirmed                                                                |
| Workday CXS                                      | `POST <tenant>.wd<N>.myworkdayjobs.com/wday/cxs/<tenant>/<site>/jobs`                            | none, but undocumented; Cloudflare bot protection, scrapers spoof fingerprints | unlikely CORS                                        | tenant robots/sitemaps                                                   | **Links only** (keep current rule): undocumented, bot-protected, getting past it is the legal line |
| iCIMS, Jobvite, Comeet, Taleo, SuccessFactors    | partner/customer keys                                                                            | yes                                                                            | —                                                    | —                                                                        | Links only                                                                                         |
| JazzHR, Dover, Polymer, Homerun, Join, Factorial | no public feed found                                                                             | —                                                                              | —                                                    | —                                                                        | Skip                                                                                               |

**Enumerating companies per ATS.** No ATS lists its customers. What works and is allowed:
Common Crawl CDX index (open data; path-style ATSs: Greenhouse, Lever, Ashby, Workable, Gem,
Rippling), certificate transparency via crt.sh (subdomain-style ATSs: Recruitee, Teamtailor,
BambooHR, Breezy, Pinpoint, Personio), and curated company lists (designsystems.jobs company pages,
Into Design Systems' companies tool, Adele, awesome-design-systems, yc-oss). Automating Google
`site:` searches is not allowed. Both crt.sh and Common Crawl are too heavy for a browser: run them
in an offline script that writes candidate slugs, then let the existing probe confirm them.
Neither host was reachable from this container, so no counts.

### Community sources

| Source                                                              | Access                          | Key                   | Terms                                                        | DS jobs                                         | CORS                 | Verdict                           |
| ------------------------------------------------------------------- | ------------------------------- | --------------------- | ------------------------------------------------------------ | ----------------------------------------------- | -------------------- | --------------------------------- |
| HN "Who is hiring?"                                                 | Algolia                         | No                    | fine                                                         | **1–2 per thread (live: Oct 1, Sep 1, Aug 2)**  | echoes Origin (live) | In app                            |
| HN "Freelancer?"                                                    | Algolia                         | No                    | fine                                                         | 0–3/mo                                          | yes                  | In app, **broken** (see bug)      |
| HN all comments "design system"                                     | Algolia                         | No                    | fine                                                         | 57 comments since 9 Sep (live), mostly not jobs | yes                  | Skip (noise)                      |
| Reddit (r/DesignSystems, r/UXDesign, r/forhire…)                    | OAuth Data API; `.json`/`.rss`  | OAuth for 100 QPM     | commercial use needs enterprise access (2023, secondary)     | < 5/mo                                          | server               | Skip for now                      |
| Slack/Discord (zheroes `#jobs`, DS Slack, Storybook, Figma Friends) | membership + bot                | yes                   | needs admin-installed bot                                    | unknown                                         | no                   | **Not allowed** for a third party |
| Newsletters (Design Systems News, Dan Mall, Smashing…)              | RSS                             | No                    | content RSS                                                  | ~0 job listings                                 | —                    | Skip                              |
| Bluesky `searchPosts`                                               | `api.bsky.app`                  | No                    | public AppView; `public.api.bsky.app` search reportedly 403s | ~3000/5 min/IP (secondary)                      | server               | Maybe, experiment                 |
| Mastodon tag timelines                                              | per instance                    | No                    | per instance                                                 | very low                                        | —                    | Skip                              |
| LinkedIn posts, X                                                   | —                               | —                     | ToS ban scraping; X API paid                                 | —                                               | —                    | **Not allowed**                   |
| GitHub `topic:design-system` orgs                                   | Search API                      | keyless 10 search/min | fine                                                         | companies, not jobs                             | yes                  | In app                            |
| awesome-design-systems (alexpate)                                   | raw README, **153 rows (live)** | No                    | licence unchecked                                            | companies                                       | yes (raw GitHub)     | Add as seed (like Adele)          |

## Ranking: new DS jobs per unit of effort

Effort: S = under a day, M = 1–3 days, L = a week+. "New" = not already reachable by the app.

| #   | Source                                                                                             | New DS jobs                                                          | Effort | Key      | Notes                                |
| --- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------ | -------- | ------------------------------------ |
| 1   | designsystems.jobs full catalog (sitemap + JSON-LD)                                                | **+92 now** (112 − 20), ~10/week                                     | S      | No       | Server already reads its RSS         |
| 2   | DS company lists → watched boards (designsystems.jobs' 689 companies + awesome-design-systems 153) | high: every future DS role at those companies, straight from the ATS | M      | No       | Uses existing `discoverBoards`       |
| 3   | Into Design Systems MCP                                                                            | +100–200 beyond #1 (est.)                                            | S–M    | No       | **Blocked on operator permission**   |
| 4   | TheirStack free tier (title filter)                                                                | catches unwatched companies; capped ~200 rows/mo                     | S      | Free key | Server                               |
| 5   | HN freelancer thread fix                                                                           | +0–3/mo                                                              | XS     | No       | Bug fix                              |
| 6   | Server sync for Workable/Recruitee/SmartRecruiters/Teamtailor/Personio                             | depends on #2                                                        | M      | No       | Browser adapters exist               |
| 7   | Gem ATS                                                                                            | startup boards nobody reads                                          | M      | No       | Confirm path first                   |
| 8   | Himalayas                                                                                          | +2–8                                                                 | S      | No       | Read terms first                     |
| 9   | Adzuna                                                                                             | +30–150, many dupes                                                  | M      | Free key | Branding + commercial question       |
| 10  | Common Crawl / crt.sh enumeration                                                                  | widest coverage, mostly non-DS companies                             | L      | No       | Offline script                       |
| —   | Remotive, Jobicy, Remote OK, WWR, 4dayweek, Muse                                                   | ~0–3 each                                                            | S each | No       | Low yield; keep what's in, don't add |
| —   | LinkedIn, Indeed, Glassdoor, Google direct, Wellfound, Dribbble, Slack/Discord                     | —                                                                    | —      | —        | Not allowed: links only              |

## The 5 to add next: adapter specs

### 1. designsystems.jobs full catalog (server)

- **Where:** `src/tracks/sources.ts` (new `readDesignSystemsJobs`), called from `sync-postings` on
  the morning run, replacing the RSS read (keep RSS as the fallback when the sitemap fails).
- **Read:** `GET https://designsystems.jobs/sitemap.xml`. Keep `<url>` entries whose path is
  `/companies/<company>/<job>` (3 segments). Each has `<lastmod>`.
- **Diff:** skip URLs already in `postings` (`source = 'designsystems.jobs'`, `source_id = path`)
  whose `lastmod` is not newer. First run ≈ 112 page reads, later ~2–5 a day.
- **Per job:** `GET` the page, parse the one `<script type="application/ld+json">` `JobPosting`:
  `title`, `datePosted`, `hiringOrganization.name` + `.sameAs` (company website, also feeds the
  logo rule), `jobLocation[].address`, `employmentType`, `description` (sanitize with
  `feed/html.ts`), `url`. Map to `Posting` with `source: 'designsystems.jobs'`.
- **Closed:** a job URL gone from the sitemap counts as a miss for `mark_missed_postings`.
- **Politeness:** sequential, 1 request/second, `User-Agent: RoleForge (+https://roleforge-app.vercel.app)`.
  Credit "designsystems.jobs" on each row and link to its page (it is the source we read).
  Send the operator a heads-up via its contact form.
- **Tests:** a fixture sitemap + one job page; table tests for path filter, JSON-LD parse, diff.

### 2. Design-system company lists → watched boards

- **Inputs:** (a) designsystems.jobs company pages from the same sitemap (`/companies/<slug>`, 689
  now; page JSON-LD / `sameAs` gives name + website); (b) `alexpate/awesome-design-systems` README
  (153 rows, read from raw.githubusercontent.com; check its licence before shipping a snapshot);
  (c) the Adele snapshot (already in).
- **Server path:** a weekly job in `sync-postings` (or a script that writes a migration) runs each
  name through the probe rules (`slugCandidates` → Greenhouse/Lever/Ashby/Workable/Recruitee/
  SmartRecruiters/Teamtailor/Personio; 404 = none, anything else = unknown) and upserts live boards
  into `watched_companies` with `origin = 'ds-list'`. A company already watched is untouched.
- **Browser path (now):** same flow as `AdeleSeed.tsx`: a "Add companies that hire for design
  systems (N)" row under More ways to find companies, behind the probe's own limiter.
- **Filter:** the DS track's scorer already rejects non-DS roles, so watching big boards is safe.
- **Also:** extend `sync-postings` to read the five ATS kinds the browser already parses (spec 6
  in the ranking), or the probe's finds on those ATSs stay browser-only.
- **Tests:** list parsers on fixtures; seeding is idempotent.

### 3. Into Design Systems (server, after permission)

- **Gate:** email the operator asking to read the job board from a server for a
  personal tracker, with a link back on every row. Build only on a yes. Until then: a link tile.
- **Read:** MCP over streamable HTTP at `https://jobs.intodesignsystems.com/mcp`: JSON-RPC
  `initialize`, then `tools/list`, then `tools/call` for the search tool (empty / "design system"
  query, paged) and the read-posting tool for new ids only.
- **Map:** posting id → `source_id`, link to the board's page, credit "Into Design Systems".
- **Dedupe:** against designsystems.jobs and ATS rows by `fingerprint` (company + normalized title).
- **Cadence:** once a day, sequential. Tool names and shapes are **unverified**: pin them in a
  fixture on the first live call.

### 4. TheirStack free tier (server)

- **Key:** `THEIRSTACK_API_KEY` as a Supabase function secret (list it in `docs/secrets.md`).
  Never in the client, so CSP is unchanged; add TheirStack to `legal.ts` `THIRD_PARTIES` as a
  processor note.
- **Call:** `POST https://api.theirstack.com/v1/jobs/search` with `job_title_or: ["design system",
"design systems", "design technologist"]`, `posted_at_max_age_days: 3`, `limit: 20`, sorted by
  date. 1 credit per job and 200 credits a month means **one call every 3 days at 20 rows**: run it
  on its own cron, record credits used in `sync_log`, stop at 180. Excluding companies already in
  `watched_companies` (if its company exclude filter takes a list; unverified) spends credits only on new coverage.
- **Use:** prefer the row's ATS URL; when it is a Greenhouse/Lever/Ashby board, also upsert that
  board into `watched_companies` (so the company is read free forever after). That turns paid
  credits into permanent coverage.
- **Tests:** fixture response; credit guard.

### 5. Fix the HN freelancer thread pick (browser)

- **Where:** `src/feed/sources/hn.ts` `fetchHn` / `pickFreelancerThreads`.
- **Change:** find freelancer threads by title, not author: add
  `search_by_date?query=%22Seeking%20freelancer%22&tags=story&hitsPerPage=6` and keep stories whose
  title matches `/^Ask HN: Freelancer\? Seeking freelancer\? \(/`, newest 2 months; keep the
  whoishiring read for "Who is hiring?". Dedupe by thread id (two authors post some months).
- **Tests:** `hn.test.ts` case with a `jon_north` thread. No new host.

## Not allowed (do not build)

LinkedIn (including the guest jobs endpoint), Indeed, Glassdoor, ZipRecruiter without a contract,
scraping Google, JobSpy-style scrapers, Wellfound and Dribbble fetching, reading Slack/Discord
channels without the workspace's consent, and getting past Workday's bot protection. Keep these as
outbound search links on "Big job boards".

## Sources

designsystems.jobs [feed](https://designsystems.jobs/feed), [sitemap](https://designsystems.jobs/sitemap.xml),
[disclaimer](https://designsystems.jobs/disclaimer) (all live) ·
[Into Design Systems jobs](https://jobs.intodesignsystems.com/), [its MCP](https://jobs.intodesignsystems.com/mcp),
[hiring report](https://jobs.intodesignsystems.com/design-system-hiring-report) ·
[Remotive API](https://github.com/remotive-com/remote-jobs-api) · [Jobicy API](https://github.com/Jobicy/remote-jobs-api) ·
[Himalayas (Apify)](https://apify.com/himalayas/remote-jobs) · [4dayweek developers](https://4dayweek.io/developers) ·
[WWR RSS](https://weworkremotely.com/remote-job-rss-feed) · [Adzuna ToS](https://developer.adzuna.com/docs/terms_of_service) ·
[TheirStack pricing](https://theirstack.com/en/pricing) · [IPWatchdog on Google v. SerpApi](https://ipwatchdog.com/2025/12/26/google-sues-serpapi-parasitic-scraping-circumvention-protection-measures/) ·
[LinkedIn prohibited software](https://www.linkedin.com/help/linkedin/answer/a1341387) ·
[hiQ settlement](https://www.proskauer.com/blog/hiq-and-linkedin-reach-proposed-settlement-in-landmark-scraping-case) ·
[noble-ronin/ats-job-apis](https://github.com/noble-ronin/ats-job-apis) · [Gem Job Board API](https://help.gem.com/databases/gem-help-center/the-job-board-api) ·
[Personio XML feed](https://support.personio.de/hc/en-us/articles/29375445597725) ·
[HN Algolia API](https://hn.algolia.com/api) · [Bluesky searchPosts](https://docs.bsky.app/docs/api/app-bsky-feed-search-posts) ·
[zheroes Slack](https://zeroheight.com/slack) · [awesome-design-systems](https://github.com/alexpate/awesome-design-systems)
