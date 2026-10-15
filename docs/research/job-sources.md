# Job source research for the Live postings feed

Researched 2026-10-15. Goal: more sources of postings for design-systems, design-engineering and frontend roles, plus contract/freelance work, callable from the browser with no key where possible.

## Read this first: what was and was not verified

The research sandbox only reaches an allowlist of hosts. A `curl` to most job sites returned a proxy 403 (not the site's answer), and the fetch tool could not resolve most hosts either. So:

- **CORS was actually tested for only 4 endpoints** (table below, marked "tested"). Everything else is marked **untested**. Do not trust an untested CORS cell.
- **Terms and endpoints come from official pages only where marked "official"** (Remotive and Jobicy READMEs on github.com were fetched directly; Adzuna, USAJOBS, SmartRecruiters, WWR, Personio and Teamtailor official pages were quoted through search results). The rest rely on third-party write-ups (Apify actor pages, JobsPipe, dev.to) and are marked "secondary". Re-check before building.
- No "design system" search was run against any API, because none of the hosts were reachable. Fit is judged from each source's filters and audience.

To close the CORS gap, run this from any normal machine and paste the output back:

```sh
for u in \
  "https://remoteok.com/api" \
  "https://himalayas.app/jobs/api?limit=5" \
  "https://jobicy.com/api/v2/remote-jobs?count=5&tag=design" \
  "https://www.arbeitnow.com/api/job-board-api" \
  "https://www.themuse.com/api/public/jobs?page=1&category=Design%20and%20UX" \
  "https://weworkremotely.com/categories/remote-design-jobs.rss" \
  "https://apply.workable.com/api/v1/widget/accounts/workable?details=true" \
  "https://api.smartrecruiters.com/v1/companies/smartrecruiters/postings" \
  "https://smartrecruiters.recruitee.com/api/offers/" \
  "https://api.ashbyhq.com/posting-api/job-board/ashby"; do
  echo "== $u"; curl -sI -H "Origin: https://job-hunt-jade.vercel.app" "$u" | grep -iE "^HTTP|access-control"
done
```

Also test a real `GET` (not just `HEAD`), since some servers only add CORS headers to GET.

## Summary table

CORS cells: **tested** = measured here. **untested** = unknown, assume a browser call may fail until checked.

| Source | Kind | Key? | CORS | Terms (short) | Verdict |
|---|---|---|---|---|---|
| Remotive (already in) | JSON API | no | tested: `access-control-allow-origin: *` | Link back + name Remotive; max ~4 calls/day | in use |
| Greenhouse boards (already in) | ATS JSON | no | tested: `*` | public board data | in use |
| Lever (already in) | ATS JSON | no | tested: `*` | public board data | in use |
| Jobicy | JSON API + RSS | no | untested | Keep Jobicy as source + canonical URL; poll at most hourly; no spam use | add from the browser now (after CORS check) |
| Himalayas | JSON API | no (secondary) | untested | Not read; check `himalayas.app/docs` | add from the browser now (after CORS + terms check) |
| Remote OK | JSON API + RSS | no | untested | Followed link back to the job URL + name Remote OK; no logo; they suspend violators | add from the browser now (after CORS check) |
| We Work Remotely | RSS per category | no | untested (RSS rarely sends CORS) | Attribute links back; separate API terms ban storing data | needs a small server function (CORS), terms unclear |
| Arbeitnow | JSON API | no | untested | Not read | add from the browser now, but low fit (Germany-heavy) |
| The Muse | JSON API | optional (500/hr keyless, 3,600/hr with key) | untested | Not read | add from the browser now (after CORS check), moderate fit |
| Adzuna | JSON API | yes (app_id + app_key, self-serve) | tested: reached, HTTP 400 without key, no ACAO header | 25/min, 250/day, 1,000/week, 2,500/month; all queries through Adzuna | needs a small server function (key) |
| USAJOBS | JSON API | yes (free key + email as User-Agent) | untested | US federal jobs only | not worth it (wrong market), and needs a server |
| Jooble | JSON API | yes (free on request) | untested | Not read | needs a small server function (key), low priority |
| Careerjet | JSON API | yes (publisher key, needs end-user IP + user agent) | untested | Not read | needs a small server function (key); awkward |
| Upwork | GraphQL | yes (OAuth, approval) | untested | Automation/bot use restricted | needs server + approval; not worth it |
| Freelancer.com | REST | yes (OAuth, approval in days) | untested | Not read | needs server + approval; low fit |
| Workable | ATS JSON (widget) | no (secondary) | untested | undocumented endpoint | add from the browser now as a watched-company type (after CORS check) |
| Recruitee | ATS JSON (careers site API) | no (official docs, via secondary quote) | untested | public careers API | add from the browser now as a watched-company type (after CORS check) |
| SmartRecruiters | ATS JSON | conflicting: docs say API key, vendors say keyless | untested | Not read | verify first; maybe |
| Personio | ATS XML feed | no | untested | per-company feed, enabled by the employer | maybe; needs an XML parser, EU-heavy |
| Teamtailor | ATS RSS | no | untested | documented RSS per company | maybe; RSS, CORS unlikely |
| Breezy HR | ATS JSON | no (secondary) | untested | URL format disputed | maybe, low priority |
| BambooHR | ATS JSON | no (secondary) | untested | undocumented, can break | not worth it |
| Workday | ATS JSON (POST) | no (secondary) | untested | undocumented, some tenants 403 | not worth it from a browser |
| Rippling | ATS (HTML/`__NEXT_DATA__`) | n/a | untested | no documented public feed | not worth it |
| Pinpoint | ATS RSS | no | untested | `/jobs.rss` per company (secondary) | not worth it |
| JazzHR | ATS | key per customer | untested | public boards are HTML | not worth it |
| Homerun | ATS | not found | untested | no public API found | not worth it |
| LinkedIn | none | partner-only | n/a | closed | not allowed |
| Indeed | none | Publisher API retired | n/a | closed | not allowed |
| Wellfound | none | no public API | n/a | bot-protected | not allowed / not worth it |
| YC Work at a Startup | none | no official API found | n/a | scrapers only | not worth it |
| Built In, Welcome to the Jungle / Otta | none found | n/a | n/a | no public API found | not worth it |
| Contra, Toptal, Braintrust, A.Team, Gun.io, Malt, Fiverr, Working Not Working, Dribbble | marketplaces / boards | n/a | n/a | no public job-read API found | not worth it |

## Per-source notes

### Already in the app (checked, nothing to change)

- **Remotive** has the rules the code already enforces: `GET https://remotive.com/api/remote-jobs?search=...`, fetch at most 4 times a day, blocked above 2 requests a minute, listings are shown 24 hours after publication, link back to Remotive's job URL and name Remotive, do not pass Remotive jobs to third-party job sites (Jooble, Google Jobs, LinkedIn named), do not use them to collect sign-ups. CORS tested: `access-control-allow-origin: *`. Official: https://github.com/remotive-com/remote-jobs-api
- **Greenhouse** `https://boards-api.greenhouse.io/v1/boards/<slug>/jobs` and **Lever** `https://api.lever.co/v0/postings/<slug>?mode=json`: both tested, both `access-control-allow-origin: *`.

### Job APIs and feeds

**Jobicy** (best new keyless source)
- Endpoint: `GET https://jobicy.com/api/v2/remote-jobs?count=50&tag=design%20system` (no auth). Official README, fetched: https://github.com/Jobicy/remote-jobs-api and https://jobicy.com/jobs-rss-feed
- Params: `count` 1-200, `cursor`, `geo` (e.g. `usa`, `europe`, `anywhere`), `industry`, `tag` (keyword, 3-50 chars). `?get=industries` / `?get=locations` list valid slugs.
- Only the last 7 days of postings. Good for "fresh openings", poor for a deep archive.
- Terms (official): no per-use permission needed; keep Jobicy as the source and keep the canonical Jobicy URL; do not present listings as your own; poll no more than once an hour; honour `Retry-After` on 429; sanitize `jobDescription` HTML before rendering; no spam or misleading job databases.
- CORS: untested.
- Fit: `tag` search supports "design system", "frontend", "design engineer". Verdict: add from the browser now, after the CORS check.

**Himalayas**
- Docs/OpenAPI are at `https://himalayas.app/api` and `https://himalayas.app/docs/openapi.json` (named on its own Apify profile, https://apify.com/himalayas). Third-party actors cite `/jobs/api` (browse) and `/jobs/api/search` (search), free, no auth. Not confirmed against Himalayas itself.
- Terms, rate limits, attribution: not found. Read the OpenAPI spec and the site terms before adding.
- Fit: remote-only, has search and company/salary data, so likely good for frontend and design-systems. Verdict: add from the browser now after CORS and terms are checked.

**Remote OK**
- `GET https://remoteok.com/api` (JSON; first array element is a legal notice), plus an RSS feed. Free, no key (Remote OK help article, found via search: https://remoteok.featurebase.app/help/articles/3140840-is-there-an-api-or-rssjson-feed-of-remote-jobs).
- Terms (secondary quotes of the `legal` field): followed (no `nofollow`) link back to the job's Remote OK URL, name Remote OK as the source, no use of the Remote OK logo; violators get access suspended. Read the live `legal` string before shipping.
- CORS: untested. Fit: tag-based, many frontend roles. Verdict: add from the browser now after the CORS check; render the attribution link on every row.

**We Work Remotely**
- RSS: all jobs plus per-category feeds, e.g. `https://weworkremotely.com/categories/remote-design-jobs.rss` and `https://weworkremotely.com/remote-job-rss-feed` (official page: anyone may use it, attribute links back to WWR).
- Separate API terms (https://weworkremotely.com/api-terms-and-guidelines): send applicants through the WWR site; commercial use allowed unless it replaces WWR; scraping, saving or storing WWR data is prohibited; rate limits apply. It is unclear whether these cover the RSS feed. Ask hello@weworkremotely.com if it matters.
- CORS: RSS endpoints usually send none, untested. Verdict: needs a small server function (CORS), and keep in-memory only, never persisted.

**Arbeitnow**
- `GET https://www.arbeitnow.com/api/job-board-api` (official blog, no key, JSON, `next`/`prev` paging, `visa_sponsorship` filter): https://www.arbeitnow.com/blog/job-board-api. A UK mirror exists at `arbeitnow.co.uk`.
- Mostly German/EU roles, so weak fit for a US/Spokane-centred user. Verdict: low priority.

**The Muse**
- `GET https://www.themuse.com/api/public/jobs?category=Design%20and%20UX&page=1`. Key optional: 500 requests/hour without, 3,600 with (secondary: API directory profiles, e.g. https://apis.apievangelist.com/store/themuse-jobs-api/). Rate-limit headers are returned.
- Mostly large-company career listings, with a "Design and UX" category. CORS and terms not checked. Verdict: add from the browser now after the CORS check, moderate fit.

**Adzuna** (key)
- Self-serve `app_id` + `app_key` at https://developer.adzuna.com. Terms (official, https://developer.adzuna.com/docs/terms_of_service): default 25 hits/minute, 250/day, 1,000/week, 2,500/month; all queries must go through Adzuna; no multiple accounts; Adzuna has absolute discretion over access; commercial use has a 14-day trial period. Attribution clause not found in the part read.
- CORS: tested the base host, reached it, got HTTP 400 without credentials and no `access-control-allow-origin`. A browser call would also expose the key.
- Verdict: needs a small server function (keeps the key, caches under the 250/day cap). Best aggregator once a server exists.

**USAJOBS** (key): `https://data.usajobs.gov/api/search`; headers `Host`, `User-Agent` = the email used to request the key, `Authorization-Key` (official, https://developer.usajobs.gov/Guides/Authentication). US federal jobs only. Not worth it.

**Jooble** (key, free on request): API key in the URL, JSON `keywords` + `location`; sources disagree on GET vs POST. Docs not read. Needs a server function. Low priority.

**Careerjet** (key): v4 `https://search.api.careerjet.net/v4/query`, publisher API key via HTTP basic auth, `user_ip` and `user_agent` required (a 403 otherwise). A browser cannot truthfully supply the end-user IP, so this only works through a server. Low priority.

**LinkedIn, Indeed**: LinkedIn jobs access is partner-gated; Indeed's Publisher API was retired (year disputed, 2023 or 2024) and its current APIs are partner-only. Neither returns a public job feed. Not allowed.

**Wellfound / AngelList**: the old AngelList API is gone; Wellfound's API articles are for employers connecting an ATS; the site is bot-protected. No sanctioned feed. Not worth it.

**YC Work at a Startup, Built In, Welcome to the Jungle / Otta**: no official public API found; only third-party scrapers (YC). Not worth it.

### Freelance / contract

None of these offers a keyless, browser-callable job feed.

- **Upwork**: GraphQL at `https://api.upwork.com/graphql`, OAuth 2.0 bearer token. Needs a client ID and shared secret from an approved key request; job search uses a "marketplace job postings" read scope (community SDK guidance, not Upwork's wording). Secondary commentary says Upwork treats job-watcher bots as prohibited automation, and approval depends on your use case. Official portal: https://www.upwork.com/developer/documentation/graphql. Verdict: needs a server and approval; likely refused for a personal job-watcher. Not worth it for now.
- **Freelancer.com**: REST API at developers.freelancer.com; OAuth, approval reportedly takes a few business days; `projects` search exists (secondary). Skews to low-budget micro-projects. Needs a server. Low fit.
- **Contra**: has a client-facing "public job feed" inside the product; no developer API found. https://contra.com/faq/clients/jobs
- **Toptal, Braintrust, A.Team, Gun.io**: curated talent networks where you apply to be vetted; no public job-read API found. Applications are the product, not a feed.
- **Fiverr, Malt**: service marketplaces, no job-read API found.
- **Dribbble jobs**: Dribbble has a developer API, but it is about shots/users, not a jobs feed. Job listing is a paid employer product. No feed found.
- **Working Not Working**: nothing found.
- Practical route for contract design-systems work: watch the remote boards above (Jobicy, Himalayas, Remote OK, WWR use contract/freelance tags or job types), keep the existing HN "Who is hiring?" source (many "freelancer" and "contract" posts), and use the `contract` signal already in `src/feed/match.ts`.

### More ATS board APIs (extend "Watch a company")

These all work per company, so they only help once you know the company's slug. That fits the existing "watched company" tile mechanism, which detects the ATS from the tile URL.

- **Workable**: `https://apply.workable.com/api/v1/widget/accounts/<slug>?details=true`. Keyless, one call returns the whole board, no pagination; unofficial widget endpoint (secondary: https://dev.to/zsevic/integration-with-workable-public-jobs-api-3nk4). The documented SPI v3 API needs a bearer token (https://help.workable.com/hc/en-us/articles/115012771647). Workable hosts many small design-led startups. Add as a watched-company type after the CORS check.
- **Recruitee**: `https://<company>.recruitee.com/api/offers/`. Recruitee's careers-site API "does not require authorization" (quoted from its docs by a secondary source, https://jobspipe.dev/blog/recruitee-api-jobs). Separate token API at `api.recruitee.com` is a different thing. Add as a watched-company type after the CORS check.
- **SmartRecruiters**: `https://api.smartrecruiters.com/v1/companies/<id>/postings`. Vendors say keyless; SmartRecruiters' own Posting API page says API key only (https://developers.smartrecruiters.com/docs/posting-api). Test before committing.
- **Personio**: XML feed at `https://<account>.jobs.personio.com/xml?language=en`, enabled by the employer, no credentials (official: https://support.personio.de/hc/en-us/articles/29375445597725). XML, EU-heavy.
- **Teamtailor**: append `.rss` to a company's jobs URL, e.g. `https://career.teamtailor.com/jobs.rss` (official: https://support.teamtailor.com/en/articles/11171756-rss-feed-how-to-guide). RSS, so CORS is unlikely.
- **Breezy HR**: keyless JSON; sources disagree on `https://<company>.breezy.hr/json` vs `https://app.breezy.hr/json/<company>`. Not every customer enables it.
- **BambooHR**: `https://<sub>.bamboohr.com/careers/list`. Undocumented (the page's own feed); can change without notice.
- **Workday**: `POST https://<tenant>.wd<N>.myworkdayjobs.com/wday/cxs/<tenant>/<site>/jobs` with `{limit, offset, searchText, appliedFacets}`. Undocumented; some tenants 403 and a browser POST needs CORS. Not worth it from the browser.
- **Rippling, Pinpoint, JazzHR, Homerun**: Rippling and JazzHR public boards are HTML pages with no documented cross-company feed; Pinpoint publishes `/jobs.rss` per company (secondary); Homerun nothing found. Skip.

## Recommended next 5 to add

1. **Jobicy.** Documented, keyless, explicit fair-use terms, a `tag` keyword search that matches "design system" or "frontend", remote-friendly, and a 7-day window that suits "what is new". Smallest, safest add. Confirm CORS first.
2. **Himalayas.** Free, keyless (per secondary sources), has a search endpoint and an OpenAPI spec, remote-first, so likely the best volume of design/frontend roles. Read its terms and CORS first.
3. **Workable + Recruitee as watched-company types.** The feed already pulls any tile whose URL is a Greenhouse/Lever/Ashby board; these two cover many small product/design-led companies the others miss, with no new UI. Confirm CORS for each.
4. **Remote OK.** Large remote tech list with tags and a known attribution rule. Render the followed link back and the "Remote OK" credit, and read the live `legal` field before shipping.
5. **We Work Remotely design RSS via one tiny server function** (also the place to host Adzuna later). The "remote-design-jobs" feed is the most on-topic category feed found, but RSS needs a CORS proxy and the terms are unclear about storing data. Do this only if you build the function anyway, then add Adzuna behind it (under its 250/day cap).

Skip: Upwork, Freelancer.com and the vetted networks (approval or no feed), LinkedIn/Indeed/Wellfound (closed), USAJOBS (wrong market), Workday/BambooHR/Rippling (fragile or undocumented).

## CSP note

Each added source host must go into `connect-src` in `vercel.json` and `src/csp.test.ts`, or the feed goes silent (per CLAUDE.md). Hosts for the top picks: `jobicy.com`, `himalayas.app`, `remoteok.com`, `apply.workable.com`, `*.recruitee.com`.
