# Spec: Job sources, supercharged (liveness, new adapters, per-track boards, By company, targeting)

Status: draft, 2026-10-15. Follows `docs/specs/role-radar.md` ("turn over every stone possible and
really narrow down and explicitly target their search") and `docs/research/job-sources.md`.
Folds in #86 (By company) and the decision in #87 (key-backed sources).

## Ground rules

- Browser only. No server, no keys, no AI. Sync code (`src/account/`, `src/curation/sync.ts`, blob
  shape) is untouched unless Adrian asks.
- Every adapter takes the injected `FetchJson` and returns `Posting[]` (`src/feed/types.ts`). Tests
  run on canned payloads and never touch the network.
- **Unverified hosts.** This session cannot reach jobicy.com, himalayas.app, remoteok.com,
  apply.workable.com, recruitee.com, arbeitnow.com or themuse.com. Each adapter below is written
  from the documented response shape. Its parser must treat every field as optional (`str`/`arr`/
  `obj` in `sources/http.ts`), and each adapter ships behind a source switch (see S3) until it has
  answered once in the deployed app. Failure is already isolated and named per source
  (`describeError` in `fetchFeed.ts`).
- Any new host goes in `connect-src` in `vercel.json` and in `src/csp.test.ts` in the same slice.
  Put the origin in a `FEED_HOSTS` list in the test so adding a source cannot skip it.

## 1. liveness (re-check saved jobs)

Interface (`src/feed/liveness.ts`, pure plus one async function):
- `boardOfJobUrl(url): { board: Board; ref: string } | null`. Reuses `parseBoardUrl` and extracts
  the posting ref from the job URL (Greenhouse `/jobs/<id>`, Lever `/<slug>/<uuid>`, Ashby
  `/<slug>/<uuid>`; Workable and Recruitee once S3 lands).
- `checkLive(jobs, fetchJson): Promise<Map<jobUrl, LiveCheck>>` where
  `LiveCheck = { state: 'open' | 'closed' | 'unknown'; checkedAt: string }`.
- Stored locally in `rjb_liveness` (`{ [dedupKey]: LiveCheck }`), not in the `Job` record and not
  synced. This keeps the sync blob unchanged. It is a cache, so losing it costs one re-check.

Rules:
- Group saved jobs by board, fetch each board once (6 at a time, reusing the feed's limiter), and
  look the job up by ref. Found means `open`. A reachable board without it means `closed`.
- A network error, 4xx/5xx or an unparseable board means `unknown`. **Never mark closed on a
  failure.** A 404 board is `unknown` with a "board moved?" hint, not `closed`.
- Only jobs with a board URL and a status of Saved or Applied are checked. Jobs on other sites
  (LinkedIn, company pages) show nothing, not "unknown".
- Runs on demand ("Check which are still open") and once per session on Pipeline open, at most once
  per 6 hours per board. No background timers.

UI: job page and row show "Checked live Oct 15" (caption, secondary tone). A closed job gets a
`Tag` "Closed on the board" and a "Closed" filter chip in the Pipeline. It never changes status
automatically.

Tests: ref extraction table per ATS; open, closed, unknown (500, timeout, 404, empty body); one fetch
per board for ten jobs; cache TTL; non-board URLs skipped.

Acceptance: a saved Ashby job whose posting was removed shows "Closed on the board" after a check;
an offline check changes nothing and says it could not check.

## 2. New keyless feed adapters

All five follow the Remotive pattern: one `parseXJob` (pure, table-tested on a canned payload) plus
one `fetchX(term, fetchJson)`, a `SOURCE_LABEL` entry, and a task in `fetchFeed.ts`. `FeedSourceId`
gains `jobicy | himalayas | remoteok`; `BoardKind` gains `workable | recruitee`.

**Jobicy** (`sources/jobicy.ts`)
- `GET https://jobicy.com/api/v2/remote-jobs?count=50&tag=<term>`; response `{ jobs: [...] }`
  with `id, url, jobTitle, companyName, jobGeo, jobType[], pubDate, jobDescription` (HTML) and
  optional `annualSalaryMin/Max`, `salaryCurrency`. Map `mode: 'remote'`, `jobType` into the text as
  "Job type: ..." (so the `contract` signal sees it), `jobDescription` through `htmlToText`.
- Terms: keep Jobicy as the source and use its canonical `url`; poll at most hourly (the 1h
  in-memory cache already enforces it); honour 429 (`describeError` already says rate-limited);
  sanitized text only (`htmlToText`). Only the last 7 days appear, so the row says "last 7 days".
- `tag` is 3 to 50 characters. Shorter terms skip the source silently.

**Himalayas** (`sources/himalayas.ts`)
- Documented shape unconfirmed. Spec the adapter against `GET https://himalayas.app/jobs/api/search?q=<term>`
  with `{ jobs: [{ title, companyName, applicationLink | guid, locationRestrictions[], pubDate,
  description, minSalary, maxSalary, employmentType }] }`, and **confirm against
  `himalayas.app/docs/openapi.json` before coding the parser**. Read its terms for attribution.
  Default if terms are silent: link to the Himalayas page and show the source badge.

**Remote OK** (`sources/remoteok.ts`)
- `GET https://remoteok.com/api`. The first array element is a legal notice object and must be
  dropped. Jobs carry `id, url, position, company, location, tags[], date, description, salary_min,
  salary_max`. Filter by term client-side (the API has no search).
- Attribution is a hard rule: link to the job's Remote OK `url` followed (no `nofollow`), show
  "Remote OK" as the source on every row, never use their logo. A test fails if the row's source
  label is missing or the link is rewritten. Read the live `legal` string once and paste it into the
  adapter's header comment.

**Workable** and **Recruitee** (watchable boards, `sources/ats.ts`)
- `parseBoardUrl` learns `apply.workable.com/<slug>` and `<slug>.recruitee.com`.
- Workable: `GET https://apply.workable.com/api/v1/widget/accounts/<slug>?details=true`;
  `{ name, jobs: [{ shortcode, title, url, city, state, country, telecommuting, employment_type,
  published_on, description }] }`. Mode: `telecommuting` true means remote. The unofficial widget
  endpoint may change, so a missing `jobs` array is an error message, not an empty board.
- Recruitee: `GET https://<slug>.recruitee.com/api/offers/`; `{ offers: [{ id, title, careers_url,
  location, remote, created_at, description, employment_type_code }] }`. Company name is the
  `<slug>` via `prettySlug` unless `company_name` exists.
- `boardApiUrl`, `canonicalBoardUrl`, `watchBoard`'s "not a board" message and `liveness` ref
  extraction all take the two new kinds. `NOT_A_BOARD` lists all five systems.

CSP additions (`vercel.json`, `csp.test.ts`): `https://jobicy.com`, `https://himalayas.app`,
`https://remoteok.com`, `https://apply.workable.com`, `https://*.recruitee.com`.

Tests per adapter: canned payload parses, missing fields tolerated, junk rows dropped, non-http URL
dropped (the feed already filters), Remote OK legal row skipped, Jobicy short-term skip.

Acceptance: with the CSP in place, each adapter shows up as a named source in the feed's source list
with a count or an actionable error. None blocks the others when it fails.

## 3. Per-track starter directory

Today `STARTER_DIRECTORY` (`src/radar/directory.ts`) is one design-systems list read by every track.
A trades track gets software companies in its Live postings.

Decision: **data keyed by starter pack, seeded into the track as a curation group.**
- `PackContent` (`src/curation/packContent.ts`) gains `boards: string[]`. `seedPack` files them as
  tiles in a `Watched companies` group. The track owns and edits them (Manage track), they sync
  with the rest of curation, and `boardUrlsFor` already feeds them to Live postings. No new store.
- `STARTER_DIRECTORY` becomes `DIRECTORY_BY_PACK: Record<packId, string[]>`. The design-systems pack
  gets today's 23. Consulting and ServiceNow get implementation-services employers. Trades gets
  only boards that exist (few trades employers use these ATSs; ship what answers, not placeholders).
- Existing tracks: Live postings shows "Add suggested companies (N)" when the track's label matches
  a pack, filing them into `Watched companies` in one action. No match shows nothing. The feed no
  longer reads a global list, so a trades user never sees software boards.
- Every starter board is verified live before it ships (the existing directory test pattern, run
  once when network allows). A board that 404s is dropped from the list.

Tests: each pack's boards parse with `parseBoardUrl`; no duplicates; `seedPack` creates the group
and tiles; suggest action is idempotent (second click adds 0); trades track feed reads no software
boards.

Acceptance: new design-systems track starts with its 23 watched boards; a new trades track starts
with none of them.

## 4. "By company" view (#86)

- `src/feed/byCompany.ts`: `groupByCompany(ranked): CompanyGroup[]` per #86: normalized name (case,
  punctuation, "Inc"/"LLC" suffixes stripped; blank skipped); `{ company, count, bestScore,
  signals, newestPostedAt, top: RankedPosting[3], boards: Board[] }`; sorted by best score, then
  count. Deriving `boards` uses `parseBoardUrl` on each posting URL.
- UI in `LiveFeedPanel`: an Openings / Companies `SegmentedControl`, state in the URL hash like the
  other Discover sub-tabs. A row shows name, count, signal tags, newest posted, top 3 links.
- A **Watch** button when a posting resolves to an unwatched board. A **Save company** is not in
  scope (companies are not Jobs).
- Outreach angle: the row copy line reads "3 openings mention your search" rather than inventing
  facts. Nothing is stored.

Tests: grouping table (casing, suffixes, blank, same company across sources), ordering, signal
union, top-3 cap, board derivation. Component: toggle round trip, axe clean, 390px.

Acceptance: switching to Companies groups the current results without refetching; Watch files a tile.

## 5. Search targeting

Feasible from today's data (no new fields from sources): title/text, location, `mode`, `postedAt`,
the `contract`/`founding` signals. Salary exists only in some payloads (Jobicy, Himalayas, Remote OK
add it).
- **Exclude terms:** `excludeTerms: string[]` applied in `match.ts` to title and text using
  `termRegex`; a posting matching any is dropped and counted ("hidden by 2 exclusions").
- **Seniority:** reuse `Category.seniority` (`entry | experienced | any`). Rules on the title only:
  `entry` drops senior/staff/principal/lead/director; `experienced` drops intern/junior/entry. Text
  never decides. Table-tested like `inferMode`.
- **Salary floor:** add optional `salaryMin`/`salaryMax`/`currency` to `Posting`; adapters fill it
  when a source gives it. A floor hides postings whose max is below it and **keeps postings with no
  salary** (default), with a switch "Only show postings with a salary". Parsing salary from free
  text is out of scope (too error-prone).
- **Saved filters:** a named bundle `{ term, location, mode, exclude, seniority, salaryFloor,
  contractOnly }` in local storage (`rjb_feed_filters`, per track id). One-tap recall; not synced.
- Everything runs after fetch, so it costs no extra requests.

Tests: exclusion with plural/hyphen forms, seniority table, salary keep/drop incl. missing salary,
filter save/load round trip with corrupt storage.

Acceptance: the user can exclude "manager", pick entry level, and see the count hidden by each rule.

## Build order and slices

Order: S1 liveness, S2 targeting, S3 adapters, S4 per-track boards, S5 By company, S6 saved filters.
(S1 and S2 are independent wins. S3 comes after S1 so liveness covers the new board kinds. S5
depends on S3 only for more data.) Each slice is at most 5 files and ends with typecheck, lint,
vitest; slices S5 and S6 add a headless Chromium pass at desktop and 390px.

1. **S1 liveness.** `feed/liveness.ts` + test, a small `useLiveness` hook, row/page caption, Pipeline
   filter chip. Accept: section 1 acceptance.
2. **S2 targeting rules.** `feed/targeting.ts` + test, `types.ts` salary fields, `LiveFeedPanel`
   controls (exclude input, seniority, floor). Accept: section 5 acceptance, counts shown.
3. **S3 adapters.** `sources/jobicy.ts`, `sources/remoteok.ts`, `sources/himalayas.ts` (with tests),
   `fetchFeed.ts` + `types.ts`, `vercel.json` + `csp.test.ts` (this slice may touch 6 files:
   split as S3a Jobicy + Remote OK + CSP, S3b Himalayas after its OpenAPI is read, S3c Workable +
   Recruitee in `ats.ts`). Accept: section 2 acceptance per adapter.
4. **S4 per-track boards.** `radar/directory.ts`, `curation/packContent.ts`, `curation/starterPacks.ts`,
   suggest action in `LiveFeedPanel`, tests. Accept: section 3.
5. **S5 By company.** `feed/byCompany.ts` + test, panel toggle, hash route, Watch button.
   Accept: section 4.
6. **S6 saved filters.** `feed/savedFilters.ts` + test, panel UI. Accept: filter survives reload,
   corrupt storage renders defaults.

## Boundaries

No server function, no API keys, no AI, no scraping of HTML pages, no storing of source data beyond
the existing 1h memory cache and Remotive's budget store. Liveness and filters live in local
storage only. Do not touch `src/account/` or blob/table shapes. No Upwork, LinkedIn, Indeed,
Wellfound. Board rule holds: boards and searches, never one-off postings in curated tiles.
Source terms are shown in code comments and honoured by tests (attribution, polling interval).

## Open questions (recommended default each)

1. **Build #87 (key-backed server function) now?** Default: no. Keep the issue's own default
   (neither by 2026-11-15); revisit after a month of use with S3 and S4 live. If yes later, Adzuna
   behind `api/postings.ts` (250/day cap) is the first pick; TheirStack only if lead-gen by company
   matters more than breadth.
2. **Hold each new adapter until it answers live?** Default: ship each behind a per-source toggle
   that is on by default, and turn it off in code if the first deployed check shows no CORS.
3. **Where is liveness stored?** Default: local `rjb_liveness`, not synced. Syncing it means a Job
   field and blob change, which is sync code and Adrian's call.
4. **Should closed jobs change status or archive?** Default: never automatically; flag only.
5. **Trades directory.** Default: ship only boards that answer; accept that trades coverage comes
   mostly from curated links and Google lanes, not APIs.
6. **Himalayas terms.** Default: read the OpenAPI and site terms in S3b; skip the source if
   attribution or storage rules conflict with in-memory display.
7. **We Work Remotely RSS.** Default: skip (needs a CORS proxy and its terms bar storing data).

## Board sources through /api/boards (2026-10-28, branch `claude/src-boards`)

Answers open questions 6 and 7. RSS and JSON feeds without CORS headers are read by one same-origin
edge function, `api/boards.ts` → `src/feed/sources/boardsHandler.ts`: `?src=<id>` picks a **fixed**
upstream URL (never an open proxy), the board's adapter parses it, and the answer `{ postings }`
carries an hour of shared CDN cache (plus an hour in the instance), so all users together read each
board about hourly. 60 upstream reads / 10 min per IP (cache hits are free); a body over 8 MB is refused; text is cut to 4,000
chars. Nothing is stored beyond that cache. The browser only talks to 'self', so the CSP and
`legal.ts` THIRD_PARTIES are unchanged (like `/api/sam`). Client half: `sources/proxied.ts`
(re-checks every field, http(s) links only; a partial answer makes the next read skip the session
cache). A whole-feed board is read once per search, like a watched board; a search board (Himalayas)
once per term. Postings come back unfiltered: the feed's phrase rule (`rankPostings`, so "system
design" is never "design system"), must include, or on a scored track the scorer decides what is
listed, as for every source. Switches in `SOURCE_ENABLED` (`fetchFeed.ts`).

| Source | Feed | State | Terms kept |
| --- | --- | --- | --- |
| designsystems.jobs (`dsjobs`) | `designsystems.jobs/feed` (RSS, newest ~20) | **On.** Verified live 2026-10-28 | Links to its own page, named on every row; hourly |
| We Work Remotely (`wwr`) | Design + Front-End Programming category RSS | **On.** Unverified live | "Attribute the links back to WWR": its link as given, named on every row; hourly |
| Remote OK (`remoteok`) | `remoteok.com/api` (direct, CORS-open) | **Off.** Live `legal` notice still unread (sandbox network refuses the host) | Followed link to its URL, "Remote OK" named, no logo |
| Working Nomads (`workingnomads`) | `workingnomads.com/api/exposed_jobs/` (JSON) | **Off.** Unverified live, terms not found | Its link, named on every row |
| Himalayas (`himalayas`) | `himalayas.app/jobs/api/search?q=` (JSON, search) | **Off.** Reported terms bar redistribution to aggregators: read them first | Link to the Himalayas page, named |
| Authentic Jobs (`authenticjobs`) | `authenticjobs.com/feed/?post_type=job_listing` (WP Job Manager RSS) | **Off.** Feed URL is the plugin's default, unverified | Its link, named |
| Dribbble Jobs | none | **Not built.** No public jobs RSS or API (only IFTTT and paid scrapers) | n/a |

Other design-system / UX boards: none with a public, keyless feed was found that could be checked
from the build sandbox (its network policy allows designsystems.jobs only). To turn a source on:
read its feed and terms from a normal network, update its adapter's header, flip its switch, and
note the date here. Server-side (the `sync-postings` cron) still reads only designsystems.jobs.
