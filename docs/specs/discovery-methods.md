# Spec: Hidden job discovery methods (board probing, design-system orgs, YC batches, community boards, big-company systems)

Status: draft, 2026-10-15. Adrian approved methods 2 to 6. Builds on `docs/specs/job-sources.md`
(in flight: liveness, targeting, Jobicy, Remote OK, Workable, Recruitee, per-track boards, By company,
saved filters, HN Freelancer thread, board cap removed) and `docs/specs/role-radar.md`. None of that
is respecced here.

## Objective

Find employers the user would never search for by name, then turn them into watched boards (live
openings) or outreach targets (no opening yet). Browser only: no server, no keys, no AI. Every new
fetch host goes in `connect-src` in `vercel.json` and in `FEED_SOURCE_HOSTS` in `src/csp.test.ts` in
the same slice.

## Verification note

This sandbox reached `boards-api.greenhouse.io`, `api.ashbyhq.com` and `api.github.com/rate_limit`
(200). It could not reach `docs.github.com`, `yc-oss.github.io`, `ycombinator.com`,
`apply.workable.com` or `*.recruitee.com` (DNS or proxy refusal), and a GitHub search call returned
403 through the proxy (cause unknown). So these are **unverified** and must be checked once in the
deployed app before each slice's source switch is turned on: the YC mirror URLs and CORS header,
GitHub search CORS and the 10 per minute figure (from memory of the REST docs: unauthenticated search
is 10 requests a minute, authenticated 30; core API 60 an hour per IP), the Workable and Recruitee
probe responses for a missing board, and every community-board `site:` clause below (checked only
against my knowledge that the sites exist, not by search).

## Shared module: the board probe (`src/feed/probe.ts`, used by methods 2 and 3)

- `slugCandidates(name): string[]`: lowercase, strip `inc|llc|labs|hq|co` suffixes, then `acme-labs`,
  `acmelabs`, `acme` (max 3, deduped). A pasted URL or slug skips derivation (`parseBoardUrl`).
- `probeBoard(board, fetchJson): Promise<'live' | 'none' | 'unknown'>` uses the existing
  `boardApiUrl`. 200 with a parseable job list (zero jobs counts as live, "no openings now") is
  `live`; 404 is `none`; anything else (429, 5xx, timeout, CORS failure) is `unknown`, never `none`.
- `probeCompanies(names, opts)`: async generator yielding results as they arrive (progressive).
  Order per company: all five ATS kinds for the first candidate; further candidates only if nothing
  hit. Worst case 15 requests for a company that is on none of them.
- Politeness: 6 requests in flight overall, at most 2 per host, 150 ms gap per host, abortable
  (`AbortSignal`), stops a host for the session after 3 consecutive 429s. 5 hosts means roughly
  25 to 30 requests a second at most; 500 companies finish in a few minutes and the UI never waits.
- Cache in `rjb_probe` (localStorage, `{ "<kind>:<slug>": { r, at } }`): `live` 30 days, `none` 14
  days, `unknown` not cached. Cap 5,000 entries, oldest evicted. Losing it costs a re-probe.
- Results are `Board` values. Keeping one adds a tile to the track's `Watched companies` group (the
  existing watch path), so the board cap removal means no limit on kept boards, but a scan reads
  watched boards progressively (first 25 immediately, the rest in the background, rows appear as each
  board answers; the feed's existing 1h in-memory cache applies).
- Tests: candidates table, 200/404/429/timeout mapping, ordering and early stop, concurrency never
  above 6 (fake timers), cache TTLs, abort.

## Method 2. Automatic board discovery

**Source of company lists**
1. Pasted list (default, always works): names, slugs or board URLs, one per line, up to 500.
2. YC batches (method 4 supplies the list); a "Probe this batch" action feeds names to the probe.
3. Companies from method 3 (design-system orgs).

**Interface:** `discoverBoards(input, opts)` wraps `probeCompanies`, dedupes against boards already
watched, returns `{ found: Board[]; missed: string[]; unknown: string[] }`.

**UI (Discover tools, not Live postings):** a "Find boards" panel: textarea, Start, a progress line
("84 of 200 checked, 31 boards found"), a result list with ATS badge and open-role count, "Watch"
per row and "Watch all", and "Not found" and "Couldn't check" collapsed below with a retry for the
second. Uses HDS `Textarea`, `Button`, `Progress`, `Tag`, `Disclosure`. Cancel button during a run.

**Tests:** pasted-list parsing (names, URLs, junk lines, over 500 is trimmed with a note); dedupe
against watched; progress ordering; panel renders found, missed and unknown groups; keep adds a tile.

## Method 3. Companies with a public design system on GitHub

**Source:** GitHub REST search, keyless.
`GET https://api.github.com/search/repositories?q=topic:design-system+topic:design-tokens&sort=stars&per_page=50&page=N`
(topics ANDed; also run `topic:design-system` alone). api.github.com sends CORS headers (documented
for browser use). Terms: unauthenticated, 10 search requests a minute per IP, 60 core requests an hour;
read `x-ratelimit-remaining` and `x-ratelimit-reset` on every response.

**Org to company to board:** keep repos whose `owner.type === 'Organization'`. For each org (deduped)
call `GET /orgs/<login>` (core budget, 60 an hour) for `name`, `blog`, `description`, then: company
name from `name`; careers via probing `slugCandidates(name)` and the org login; the blog URL kept as
"Website". Anything unresolved still shows as an outreach target with repo, stars and a Google
careers link (`atsSearchUrl` with the org name).

**Budget:** `src/feed/githubBudget.ts` holds a token bucket (search 8 a minute, leaving headroom; core
40 an hour), persisted in `rjb_gh_budget`. Cap one run at 3 search pages (150 repos) and 30 org
lookups, then "Load more" later. On 403 or 429 with `x-ratelimit-remaining: 0`, stop and show "GitHub
asks us to wait until 14:32". Cache search pages 24 hours and org lookups 7 days in localStorage.
Respect `Retry-After`.

**Interface:** `findDesignSystemOrgs(fetchJson, budget): AsyncGenerator<OrgTarget>`;
`OrgTarget = { login, company, website?, repo, stars, topics[], board?: Board, openRoles?: number }`.
Filter noise: skip archived and forks, require `stars >= 20` by default.

**UI:** in the By company view (job-sources section 4) as an "Outreach targets" section: companies
with no opening, showing repo, stars, "Open roles: 0" or the count if a board was found, "Watch
board" and "Save as target". Also reachable from Discover tools as "Find design-system teams".
Outreach is a saved company entry, not a Job.

**Tests:** query URL builder; org-type filter; fork and archive skip; budget bucket (fake clock, 429
handling, persisted reset); company mapping table; unresolved org still listed; page cap respected.

## Method 4. Recently funded: YC batches only

**Source:** the community mirror of YC's directory, `https://yc-oss.github.io/api/` (GitHub Pages,
static JSON, served with open CORS in practice): `batches/<batch>.json` (for example
`batches/winter-2026.json`) and `companies/all.json`, with `name, slug, website, one_liner,
team_size, industries, tags, batch, status, isHiring`. **Unverified here.** It is unofficial (YC
owns the data), so credit "YC directory (community mirror)" and keep a pasted-list fallback. Do
not use ycombinator.com's own search, which sits behind an embedded Algolia key.
Fallback if the mirror is gone: user pastes a batch list (method 2 input).

**Interface:** `src/feed/yc.ts`: `parseYcCompany(raw)` (all fields optional), `fetchBatch(batch,
fetchJson)`, `recentBatches(now)` (the last 4 batches by season and year). Filter `status ===
'Active'`, optionally `isHiring`. Feeds `discoverBoards` and shows in the same "Find boards" panel
as a "YC batch" picker.

**Later, server option (not built):** funding news and databases (Crunchbase, Dealroom, TheirStack,
Funded.fyi style) need a key or scraping. A tiny serverless function could hold the key and cache
results. Out of scope.

## Method 5. Design-systems community boards (Google lane)

Add to `HIDDEN_BOARDS` in `src/jobsData.ts` (all no API, Google lane only):
`Smashing Jobs` (`smashingmagazine.com/jobs`), `Design Systems Slack jobs channel` (the Slack is
members only and not indexed; add a plain link row "Join Design Systems Slack" instead of a `site:`
clause), `Design Systems Jobs` (`designsystems.com` jobs listings: `site:designsystems.com jobs`),
`Into Design Systems` (`intodesignsystems.com` community; clause `site:intodesignsystems.com`),
`Dribbble Jobs` (present; narrow to `dribbble.com/jobs`), `Working Not Working` (present),
`Authentic Jobs` (`authenticjobs.com`), `Dynamite Jobs` (`dynamitejobs.com`), Remotive is already a
feed source and LinkedIn blocks Google, so both are skipped.
`site()` currently takes a bare host; extend `HiddenSite` with an optional `path` so
`site:smashingmagazine.com/jobs` works. A row needing a path clause or a non-search link uses a new
optional `href` that bypasses Google. **Every host above is unverified from this sandbox**; the slice
adds a table test that each clause is a valid `site:host[/path]` and that `searchAllUrl` still fits
32 words, plus a manual check list in the PR.

## Method 6. Large-company job systems (Google lane)

Workday, SuccessFactors, Taleo, iCIMS and Oracle Recruiting are per-tenant and mostly unauthenticated
only through undocumented endpoints (Workday `https://<tenant>.wd<N>.myworkdayjobs.com/wday/cxs/<tenant>/<site>/jobs`
is a POST, not CORS-open as far as known, and tenant strings are not guessable). **No live feed from
the browser.** Add to the ATS lane (`ATS` list) with clauses:
- Workday (present): `site:myworkdayjobs.com`; add `site:wd1.myworkdayjobs.com OR site:wd5.myworkdayjobs.com`
  variant only if the 32-word budget allows (it likely does not, skip).
- SuccessFactors: `site:successfactors.com OR site:successfactors.eu inurl:career`.
- Taleo: `site:taleo.net inurl:careersection`.
- iCIMS (present as `careers.icims.com`): change to `site:icims.com inurl:jobs` since tenants are
  `careers-<name>.icims.com`.
- Oracle Recruiting: `site:oraclecloud.com inurl:CandidateExperience`.
Later server option: a small function that POSTs to a company's Workday `cxs` endpoint (tenant
supplied by the user), caches 1h, and returns JSON. Needs a server because of CORS and politeness.
Tests: the same clause validity table as method 5, plus `searchAllUrl` word count.

## CSP hosts

Add to `connect-src` and `FEED_SOURCE_HOSTS`: `https://api.github.com` (method 3), `https://yc-oss.github.io`
(method 4), `https://apply.workable.com` and `https://*.recruitee.com` (probe for method 2; may
already land via job-sources S3, do not duplicate; `*.recruitee.com` needs a wildcard, so add the
test case for a wildcard host). Greenhouse, Lever and Ashby are already allowed. Methods 5 and 6 add
no hosts (links only).

## Slices (each 5 files or fewer; typecheck, lint, vitest; UI slices add Chromium at desktop and 390px)

1. **S1 Community and big-company Google lane (methods 5, 6).** `jobsData.ts`, `jobsData.test.ts`,
   `HiddenSite` type tweak, `DiscoverView.tsx` (path/href rows). Accept: new rows appear, every
   clause valid, Search All still within 32 words, Slack row opens its link.
2. **S2 Probe core (method 2 engine).** `feed/probe.ts`, `probe.test.ts`, `sources/ats.ts` (Workable
   and Recruitee kinds if not yet landed), `vercel.json`, `csp.test.ts`. Accept: 200 names probe with
   no more than 6 in flight, cache hit skips network, 429 backs off.
3. **S3 Find boards panel (method 2 UI).** `feed/discoverBoards.ts` + test, `FindBoardsPanel.tsx`,
   Discover tools wiring, watch path. Accept: paste 20 names, see boards appear as they answer, Watch
   adds a tile, cancel stops requests, unknown retry works.
4. **S4 YC batches (method 4).** `feed/yc.ts` + test, picker in `FindBoardsPanel.tsx`, `vercel.json`,
   `csp.test.ts`. Accept: pick a batch, active companies feed the probe; mirror down shows a plain
   message and the paste box still works.
5. **S5 GitHub design-system orgs engine (method 3).** `feed/githubBudget.ts` + test,
   `feed/dsOrgs.ts` + test, `vercel.json`, `csp.test.ts`. Accept: 150 repos max per run, stops on
   rate limit with a reset time, org without a board still returned.
6. **S6 Outreach targets UI (method 3).** `OutreachTargets.tsx`, By company integration, saved target
   store `feed/targets.ts` + test. Accept: targets listed with stars and open-role count, Save as
   target persists across reload, Watch board adds a tile.

## Boundaries

- Always: show progress and let the user cancel; label unknown as unknown; link out to the company.
- Ask first: a server function, any key, GitHub auth tokens, storing company lists in the sync blob
  (default: local only; watched tiles already sync as curation).
- Never: guess a board as live without a 200; scrape pages from the browser; send the user's lists
  to a third party; fetch Workday or SuccessFactors endpoints directly; treat a funded company as an
  opening.

## Open questions (each with a recommended default)

1. Cap on a pasted list? Default 500 per run, with a note; no cap on kept boards.
2. Should unknown probe results retry automatically? Default no; one "Retry unknown" button.
3. GitHub token for higher limits? Default no (keyless is the rule); revisit with a server.
4. Minimum stars for design-system orgs? Default 20, adjustable in the panel.
5. YC batches to offer? Default the last 4 (about 2 years), active companies only.
6. Where do outreach targets live if By company slips? Default a flat list in Discover tools.
7. Are the unofficial YC mirror and unverified community clauses acceptable? Default yes behind a
   source switch, confirmed once in the deployed app, per the job-sources ground rule.
