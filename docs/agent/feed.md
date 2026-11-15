# Feed, sources and scans

How postings are read, matched, scored, deduped and scanned, in the browser and on the server.

- **Feed + Review new (simplify 5/9, #386):** Review new is on Today (`ReviewView`). `feed/feed.ts` is the Feed:
  `buildFeed(read, profile, sources, …)` lists **every design-system posting, newest first, no fit tiers** (Adrian
  2026-10-28): every posting read that passes the work mode (no term gate; the profile's mode, **remote** by default:
  on-site/hybrid out, a posting that does not say stays and reads "Location not stated"), then the plain inclusion check
  (`profile.designSystemRule`: the design-system phrase on the title, or a related title that is on; `targeting.phrases`
  keeps the scorer out) and the profile filters; minus saved jobs, Skips (by posting fingerprint, `tracks/score.ts`
  `fingerprint`) and muted companies; the rest are counted ("N not design-system roles"). Reads go through the
  `PostingReader` seam (`feed/reader.ts`; `browserReader` = `fetchFeed` sweeping every profile title); `useFeed` keeps
  the rows up while a changed request reads, and a source or title added since reads only what was added
  (`mergeReads`), so a new company's jobs show at once. **Inputs (#388): the synced Search profile and Sources**
  (`useFeedInputs` → `feed/profile.ts` `searchProfileOf` / `feedSourcesOf`: titles on + ATS roles on + related titles;
  every board and followed company + the keyless feeds). `feed/decided.ts` is the Feed's view of the synced stores:
  Skips are `src/decided.ts` (`decided[]`), muted / followed companies are Sources (`muteCompany` returns its Undo);
  it used to keep its own object under the same `rjb_decided` key, which a pull dropped, so `moveLegacyDecided`
  (`main.tsx`, before sync) moves an old one over once. `rjb_feed_seen` (first-seen days, "N new today") stays local.
  A row's title opens an in-app preview (`PostingPreview`, Back closes it) with Open posting beside the title and in
  the preview. Save = `notifySaved` + `follow.ts` (a board posting follows its board as a Source, else the company by
  name; Undo takes both back). **Breadth guard** (`feed/breadth.test.ts` on `breadth.fixture.ts`): the deleted Live
  postings' list (`feed/liveList.ts`, kept as the baseline) at its widest; the Feed must list every design-system
  posting it lists, and every one the recorded answers hold; it fails otherwise. Pinned in `feed/feed.test.ts`, `review.test.tsx`, `e2e/review.spec.ts`.
- **Dedupe v2 + one remote classifier (#576 items 9, 10):** `src/tracks/roleKey.ts` (pure, `.ts`, no imports) is
  the one "same role" rule for the browser's Feed (`feed/match.ts` rank) and the server sync (`score.ts` `dedupe`):
  `roleKey` = `normCompany` (case, punctuation, "the", Inc/LLC/Ltd/GmbH/Co… at the end of the name only, #670) + `normTitle` (Sr → Senior, Eng →
  Engineer…; **seniority kept**, so Senior and Staff never merge; no company = no merge). `dedupeRoles` keeps the best
  source (`sourceRank`: company board, then designsystems.jobs / manual, aggregators, remote boards and HN, social);
  across sources the place is ignored, within the kept source two places stay. No alternates field: only the best copy
  is kept. **`score.ts` `fingerprint` is unchanged** (it strips seniority; `decided` Skips are stored by it). **Remote:**
  `feed/mode.ts` `classifyRemote(line)` → `{ mode: remote|hybrid|onsite|unstated, offersRemote, region? }` (synonyms
  Anywhere / Distributed (not "distributed systems") / WFH / work from home; "3 days in office" is hybrid; a line that
  only rules remote out is on-site; "Remote (US only)" → region US) is behind `inferMode`, `remoteVerdict` (auto-scan
  and rotation remote only), `isRemoteJob` and the server feeds (`tracks/feeds/dsRole.ts` `isRemoteRole`). Pinned in
  `tracks/roleKey.test.ts`, `feed/classifyRemote.test.ts`, `feed/mode.test.ts`.
- **Remote Rocketship (2026-10-22):** a "Big job boards" link (`BOARDS`, tag "Remote only",
  `modes: ['remote','any']`, shown through `boardsFor(mode)`): `https://www.remoterocketship.com/?sort=DateAdded&jobTitle=<first ticked title>`.
  Link only: no API (its paid one needs a personal key; a later bring-your-own-key slice), no fetch, so CSP and
  `legal.ts` are unchanged. The query form is **unverified live** (the host was unreachable from the build container).
- **Must include / systems-only (Adrian 2026-10-23):** `feed/mustInclude.ts` holds the phrase rules every
  inclusion check uses (`termRegex`, `passesInclude`: whole words, "systems" ↔ "design system", never "ecosystem";
  **phrases break at separators**: a spaced hyphen, en/em dash, `, | / : ; & · •`; a hyphen inside a word joins).
  **A design system rule reads the title only** (`hasRelatedTitles`), so Design Engineers never come in through a
  description; **one exception (Adrian 2026-11-15): a product-design title (`track-config.ts` `PRODUCT_DESIGN_TITLE`:
  Product / UX / UI / Visual / Interaction Designer) is listed when its description shows at least
  `BODY_SIGNALS_TO_LIST` (2) of the scorer's body signals** (`feed/include.ts` `bodyConfirms`; one mention of "design
  system" is not enough; same guard as the related titles). The scorer has the same titles as adjacent at the same
  bar, and a phone's light read fetches their descriptions (`bodyCanConfirm`). The design systems plan searches the
  term feeds for its first design-system title, "design systems", then the related titles that are on (`plan.ts` `designSystemsTerms`, first 3 kept); **related titles** = Design Technologist and Design Engineer (design / UX engineer; #581, Adrian
  2026-11-11) (`related` absent = on, `relatedOff` ids). **One design engineer guard,
  `tracks/designRoleGuard.ts`** (pure, word rules: hardware, electrical, RF, ASIC, PCB, civil, process (not "design
  process"), a lone "tool", mechanical-sense product design engineer, "system design engineer"…; interns too) is used
  by the related-title pass, `feeds/dsRole.ts` `isDsRole` and the scorer's `DESIGN_ENGINEER_STRONG` (a lookahead
  built from `NOT_UI_DESIGN_SOURCE`); pinned in `tracks/designEngineer.test.ts`. The check itself (`passesInclude`,
  `keepIncluded`, `relatedCounts`, `mentionsAny`) is `feed/include.ts`, so the guard stays out of the entry. The per-track
  store (`rjb_must_include`, blob **v11**, incl. `atsOff` and a Contracts track's stored `naics`, `cleanNaics`) stays
  readable and feeds the v12 move; its editors (Calibrate, Manage track) are gone. `App`'s `SystemsOnlyMigration`
  still runs `migrateSystemsOnly` on old pack tracks. Pinned in `feed/mustInclude.test.ts`, `feed/systemsOnly.test.ts`,
  `systemsOnlyNotice.test.tsx`, `tracks/designEngineer.test.ts`.
- **Track scorer (Muse handoff, 2026-10-24):** `src/tracks/` is pure and shared by the app and the sync edge
  function: `score.ts` + `track-config.ts` are ported as given; tune only through the config. `scoreForTrack` = scorer
  then `fitRejectReason` (no interns); a profile with `scorer: 'design-systems'` (onboarding sets it) or a must include
  asking for "design system(s)" (`forTrack.scorerFor`) uses it. The Feed sorts by it ("Best match"), never hides by it.
  **Server (Simplify 6/9, #387):** `sync-postings` reads each user's Sources and Search profile from their `tracker`
  blob (`tracks/plan.ts` `planFromBlob`: v12 `sources[]` + `profiles[0]`, else v11 dreams, targets, saved jobs'
  boards and the Watched tiles via the `watched_tile_urls()` RPC, + `verified.ts` for a DS user); `compileProfile`
  gives the DS config when the profile asks for design systems, else one from its titles. Boards of all 13 kinds
  (#576: plan.ts takes `boardSet` `BOARD_KINDS` + `BOARD_SLUG` on every path, so each read goes to its kind's fixed
  host; BambooHR/Rippling/Gem/Pinpoint/Breezy rows keep their own `source`, not `manual`, migration
  `20261111100000`, applied before the function is redeployed; `tracks/sourceCheck.test.ts`) and
  HN/Remotive/Jobicy are read with the app's own parsers (`src/feed/sources/*` and their imports use explicit `.ts`
  specifiers so Deno and Node load them; `inferMode` lives in `feed/mode.ts`). No `watched_companies` or `skips`
  table: the blob is the one source of truth, and the sync never writes it. Migrations `2026102410*`: postings,
  sync_log, `mark_missed_postings`, `watched_tile_urls`, the cron. Auth is `SYNC_SECRET` only. **Every 15 minutes
  (#448, Adrian 2026-11-06):** migration `20261106100000` (06:23 keeps the feeds); a 429/5xx/timeout is read once more
  after 2 s (`tracks/retry.ts`); Scan details says "Updated N min ago" for a signed-in user (#694; Find shows no scan line)
  (`feed/serverUpdated.ts`, the newest `run` row in `sync_log`); Scan now stays manual. Pinned in
  `tracks/syncSchedule.test.ts`, `tracks/retry.test.ts`, `feed/serverUpdated.test.ts`. **A run that always finishes
  (2026-11-15, migration `20261115100000`, applied after the function, `deploy-order.json`):** runs stopped in their
  4th slice with "CPU Time exceeded" and no `sync_log` row (2026-11-14: 48 of 157 boards read, no feeds). Each slice
  now saves where the next one starts (`save_sync_cursor`, also a heartbeat after each board batch); the resume tick
  (`{"resume": true}`, every minute, `claim_sync_resume`) goes on with a run whose place stood still for
  `RESUME_STALE_MS` (150 s), under the run's own start time, logs the stop as a `failed` row, and gives the run up
  after `RESUME_MAX` (6) tries on one place. **A stopped slice is read again smaller** (first live run, 2026-11-15: 16
  Greenhouse boards stopped a fresh invocation 3 times): each try halves it (`resumeSlice`: 8, 4, 2, 1), the size that
  worked goes on with the run (`size` in the chain and the saved place), and one board that stops the function alone
  is skipped for that run from try `RESUME_SKIP_AT` (5), logged, nothing on it closed. After a stop the size grows back with each slice
  that works (`nextSliceSize`: doubles, up to half of `SLICE`). The last slice reads no board: the feeds and the closing have their own
  invocation. Pinned in `tracks/syncResume.test.ts`. **Unchanged rejected rows
  are reused (2026-11-15, migration `20261115110000`, before the function):** a rejected row keeps no description, so
  the Greenhouse delta read counted every rejected job as changed and fell back to the full list on each run (the CPU
  that stopped the sync). Each row now stores `score_key` (`tracks/scoreKey.ts`: FNV over `SCORE_RULES` and the whole
  config; bump `SCORE_RULES` when score.ts, the fit rule or the design role guard change a verdict; `reuseRejects.test.ts`
  pins a hash of those three files, so a change to one fails until the choice is made). A job is not
  downloaded or scored again when, for every follower of its board, the stored row is an open reject with that
  follower's current key and the same stamp, title, link and place (`sameReject`; `known_reject_rows`, paged). Its row
  is kept as seen by `touch_reject_rows`; a touch that keeps fewer rows than asked counts those boards as not
  answered, so nothing closes. Pinned in `tracks/sync.test.ts`, `tracks/reuseRejects.test.ts`. The Feed's
  **PostingReader** seam (`feed/postingReader.ts`): `serverReader` reads the rows, `mergePostings` keeps every browser
  posting and adds the server's, so signed in is never fewer. **Review new, signed in (2026-11-07, `feed/serverFeed.ts`
  `serverFirstReader`, in `useFeed`):** reads the server's rows through the `feed_rows` RPC (#499, migration `20261109100000`: each row's
  `match_text`, the description cut by `tracks/matchText.ts` to its head plus a window around every hit of the
  scorer's signals, contract / founding and the profile's terms, stored with its `match_key`; the browser
  sends its profile's `matchKey` and gets the full text for a row cut for other terms or with no match text;
  `matchText.test.ts` holds the rank parity; the table read is the fallback only while the RPC is missing; and `board`, so they rank as the browser's read) and skips the browser's sweep of every followed board;
  only the request's rows (its boards; feeds when it searches a title), with one progress call. No rows yet (a new
  account before its first sync) or a failed read falls back to the browser read, and a company or title added
  since the last read is read in the browser (the server has not read it yet). **Light board reads** (`feed/lightBoards.ts`,
  every browser width since the 2026-11-14 perf pass (was below lg), only with a titles-only inclusion check): Greenhouse boards are read as the plain list
  (`greenhouseListUrl`), then each posting the check lets in gets its description from the single-job endpoint
  (`feed/lightText.ts` `fillTexts`, ≤ 25 per board, outside the list read's 15 s timeout with its own deadline: the list is never lost, texts not read in time load on open, and the reads still queued at the deadline are given up through an
  `AbortSignal`, #499), so everything that can be listed ranks exactly as on a full
  read; an opened posting with no text fetches it (`feed/postingText.ts` `usePostingText`). Pinned in `feed/feedLoad.test.ts`.
  `npm run sync:dry-run` plans from a sample blob, reads + scores with no database. Pinned in `src/tracks/*.test.ts`,
  `feed/postingReader.test.ts`.
- **Server searches (claude/src-top5, `docs/research/ds-job-sources.md`):** `src/tracks/feeds/` holds sources only
  `sync-postings` reads (pure, injected fetch, `.ts` specifiers): `dsjobsCatalog.ts` (designsystems.jobs' sitemap + each
  job page's JSON-LD; stored as `rss`, source id = page URL like the RSS guid; known rows reused, ≤ 40 new pages a run,
  1/s, known rows from the `known_dsjobs_postings()` RPC; partial reads never close) and four windowed searches in
  `serverFeeds.ts`, never counted as answered (rows age out 30 days after last seen): TheirStack
  (`THEIRSTACK_API_KEY`, due 10 days a month × 18 rows), Adzuna (`ADZUNA_APP_ID`/`ADZUNA_APP_KEY`, rows say "Jobs by
  Adzuna"), Jooble (`JOOBLE_API_KEY`, in the URL: never logged) and Into Design Systems (MCP, waits on its operator's
  yes). **Gates live in `serverFeeds.ts` `SERVER_FEED_GATES` (claude/src-free-aggs), not `SOURCE_ENABLED`:** a keyed
  one runs as soon as any of its secrets is set (one of two missing → `MissingKeyError` names it in `sync_log`, the run
  goes on); the function's answer lists `serverFeedsOff` with the secret each needs. Plus three **keyless** remote boards
  read whole and kept only when remote + design-systems (`dsRole.ts`): Arbeitnow (link back to Arbeitnow), Remote OK
  (its API `legal` notice is checked on every read; a change stops the read, loud) and We Work Remotely (Design +
  Front-End RSS); a muted Remote OK Source mutes it. All unverified live. Himalayas and Working Nomads stay off (terms
  unread). Design systems plans only. Browser never contacts them (no CSP change); legal.ts lists them with `hosts: []`.
  Migrations `20261029100000` and `20261029100200` widen the `postings.source` check. **Aggregator liveness (#576 item 11, #675):** `tracks/aggregatorLiveness.ts` checks open feed rows whose link is a Greenhouse / Lever / Ashby job on that board; a row closes as absent from the list only once `postings.listed_seen_at` is set (the first read that finds its id sets it; Ashby isListed:false / Lever unlisted jobs never list, so they are left to the 30-day age-out); a 404 board still closes. Migration `20261112100100_postings_listed_seen.sql`, applied before the function is redeployed.
  **Aggregator liveness (#576 item 11):** Remote OK and We Work Remotely are read whole (`WHOLE_LIST_FEEDS` in
  `serverFeeds.ts`), so `answeredFeeds` counts them like rss and a row missing from 2 whole reads closes through
  `mark_missed_postings`; a WWR read with one feed failed is `partial` (`markPartial`, `feeds/context.ts`) and closes
  nothing. Arbeitnow (its newest pages) and the keyed searches keep the 30-day age-out. On the feeds run the sync also
  checks open feed rows (`AGGREGATOR_BOARDS`) whose link is a Greenhouse / Lever / Ashby job on that board
  (`tracks/aggregatorLiveness.ts`: ≤ `MAX_LIVENESS_BOARDS` = 20 boards a run in a run-seeded order, `guardedFetch`
  fixed hosts, `readWithRetry`): absent from an answered list or a 404 board closes it, any failure closes nothing.
  **Guards (#673):** an empty list closes nothing (no fixture shows a kind answering 404 rather than [] for an
  unknown slug); a row closes as absent only when the list has jobs, all in the kind's id format (Greenhouse
  digits, Lever / Ashby UUIDs), and its own id has that format (else skipped); the slug keeps its case in the
  request (Ashby may be case-sensitive), boards group ignoring case. **Known risk:** a live job the board leaves
  off its public list (Ashby `isListed: false`, Lever unlisted postings) reads as absent and closes.
  No migration. Pinned in `aggregatorLiveness.test.ts`, `plan.test.ts`, `feeds/keyless.test.ts`.
- **Auto-scan (simplify 8/11, #415; stacked on the Feed, #414):** `feed/autoScan.ts` runs all discovery with no
  buttons. On app open (`AutoScanOnOpen`, a lazy chunk in `App`, after sync settles, **signed in only and never while the sign-in screen is open**: it waits, and a run in flight stops
  when the screen opens or the person signs out; signed out, the line says "Sign in for automatic updates." beside Scan now;
  2026-11-07, `feed/autoScanOnOpen.test.tsx`. **Load caps (same day, `feed/scanLoad.test.ts`):** the shared fetcher
  (`createFetchJson`) keeps at most `MAX_FETCHES_IN_FLIGHT` = 6 reads on the network, a run's end calls
  `liveFetchJson.clear()` (the parsed-JSON cache goes), and the probe asks a lead only the kind the board set
  (`board-keys.json`) knows for its slug, else `GUESS_KINDS` (Greenhouse, Lever, Ashby) (`kindsForSlug`); on only when `main.tsx` calls
  `setScanOnOpen(true)`, so unit tests never scan) at most every 6 h, or on **Scan now**: leads (YC hiring now →
  GitHub DS orgs → Adele → `SEED_LEADS`, empty until the seed list lands) → the probe (≤ 40 new leads a run, the
  rest queued; its limiter and cache) → the **identity check** (`feed/identity.ts`, #417: one ATS only, and the
  website's domain must match the slug or name; else unconfirmed, shown but never read, **and for one run only** (discovery noise, 2026-11-08: the next run drops a still-unconfirmed row unless followed or ignored; its key stays probed); a lead whose careers site is Workday / SuccessFactors / Taleo (`feed/unsupportedAts.ts`, hand-kept by name) is never probed and is listed in Scan details as "unsupported board") → the Feed's
  `PostingReader` over followed + confirmed found boards and every feed (Remotive / GitHub budgets hold) → the
  inclusion check (the profile's must include, else "design system") and **remote only** (Adrian 2026-10-28:
  `remoteOnly`: remote keeps, on-site/hybrid drops, no mode and no city keeps with `remoteUnstated`, "Remote not
  stated"). Kept per browser: `rjb_autoscan` (last run, lead queue, probed, found companies) and
  `rjb_autoscan_postings` (≤ 300, bodies cut to 1500). A run cut short resumes on the next open. Review new reads
  through `scanReader` (live read + the scan's postings, remote only, never an ignored company's). UI in
  `AutoScanViews.tsx` and `FindHeader.tsx` (**Adrian 2026-11-08: no status text above the list.** Find's short
  header has no caption and no More menu (#694): Scan now / Stop scan is the Account menu's, signed out only (the
  server syncs every 15 minutes signed in); `ScanStatus` is gone). The scan's line ("Updated N min ago" from the last `sync_log` run signed in, "Last scanned hh:mm · …"
  signed out), the sources that didn't answer and the "not shown" counts are **Scan details**, a closed row at the end of
  the Account menu's Search profile (#549; `ScanDetails.tsx`, in the Search profile's lazy chunk; Review new writes what it read to `feed/scanDetails.ts`); a screen reader still hears
  Review new's status. Pinned in `autoScanViews.test.tsx`, `review.test.tsx`, `todayHome.test.tsx`,
  `e2e/find-signed-in.spec.ts`) and
  `NewCompanies` (Follow → the board joins the Sources, Ignore → `muteCompany`, each with Undo), the Companies
  dialog's **Found** list since #618 (`newCompanies(useScan().state)` names the segment "Found (N)", shown only while N > 0; its
  Undo shows in the dialog's footer, `DialogNotice` + `noticeHost`). With
  no Search profile yet the scan searches the design-system titles (`searchDefaults.ts`). Pinned in `feed/autoScan.test.ts`, `feed/identity.test.ts`, `autoScanViews.test.tsx`,
  `review.test.tsx`; E2E `e2e/auto-scan.spec.ts` (signed out: no scan on open, Scan now finds the postings).
- **Adele seed (2026-10-23):** `src/feed/data/adele.json` is a one-time snapshot of UXPin's public design systems
  list (github.com/uxpin/adele, **MIT**; company name + design system site; re-take it by hand from `ADELE.file`).
  No runtime host. The auto-scan takes its names as leads (`adeleNames`); its old "Add companies with public design
  systems" row went with Companies (#389). The MIT notice rides in the JSON (`licenseText`). Pinned in
  `feed/adele.test.ts`.
- **Design-system company seed (2026-10-28):** `src/feed/seed/` (pure, injected fetch): `parse.ts` reads Adele
  (MIT), awesome-design-systems (Unlicense), designsystems.jobs (sitemap slugs + RSS names), HN Who is hiring posts
  naming a design system (Algolia) and GitHub `topic:design-system` orgs (keyless; **unverified live**, the build
  proxy refuses GitHub search); `resolve.ts` probes each company (`probe.ts` limiter, every probe kind, 3 slugs) and
  confirms the board is theirs (`linked` by the source, its `domain` in the payload, a designsystems.jobs `title`,
  or its own `name`; a description saying "At <Name>" confirms only a `distinctName`: ≥ 7 letters and not in
  `COMMON_WORDS`, so Close, Promise or Ledger never do); `run.ts` builds the snapshot. `npm run seed:companies` (`scripts/seed-companies.mjs`, vite
  `runnerImport`, ~1 h) writes `src/feed/data/ds-companies.json` (company, website, board, evidence, licence) and
  `ds-seed-boards.json` (confirmed boards with at most `MAX_SEED_JOBS` = 300 roles: every watched board is read on
  each search, Greenhouse with descriptions, so Anduril's 2,500 would bust the 16 MB feed cache on a phone). `radar/directory.ts` appends those to the design systems pack, which
  onboarding follows as Sources (#388). Not used:
  component.gallery (private Airtable, no licence), designsystemsrepo / Design Systems for Figma (no licence).
  Pinned in `src/feed/seed/*.test.ts`, `radar/directory.test.ts`.
- **Bulk board set + scan rotation (#src-bulk, 2026-10-29):** `npm run boards:discover`
  (`scripts/discover-boards.mjs`, `src/feed/bulk/`) harvests public board links (HN comments via Algolia,
  GitHub job lists, job-board-aggregator's MIT slug lists, Common Crawl's index (unreachable from the build
  container), the DS seed), probes each with the probe's limiter, and writes `src/feed/data/boards.json`
  (kind, slug, company, website, jobs, lastChecked, evidence; read only through `src/feed/boardSet.ts`) plus
  `board-keys.json` (keys only; Today's lazy chunk, the size budget's 70 kB). Probe answers cache in
  `node_modules/.cache/boards-discover.json`; `--cached-only` / `--reuse-harvest` rebuild without asking
  again. The server's `sync-postings` `{rotate:true}` (1-minute cron) walks the set in a hashed order
  (`src/tracks/rotation.ts`: cursor, 40 s time box, 3 per host, 429 backoff + carry list, 404 retry list
  then disabled; migration `20261029100100_scan_rotation.sql`), storing only remote queue/review postings for
  design systems profiles. Today reads "Scanning N sources · Last scanned hh:mm, K new"
  (`feed/scanningCount.ts`): the browser's boards + feeds, plus the board set only when signed in with a
  design systems profile. Pinned in `src/feed/bulk/*.test.ts`, `boardSet.test.ts`, `scanningCount.test.ts`,
  `tracks/rotation.test.ts`, `autoScanViews.test.tsx`. **Live check (2026-10-30, claude/live-fixtures):** a 25-board `--rotate --read` batch all
  answered; recorded Greenhouse/Lever/Ashby answers in `src/tracks/fixtures/` back `rotationDryRun.test.ts` and
  `npm run sync:dry-run -- --rotate --fixtures` (offline). Arbeitnow, Remote OK and WWR hosts were refused by the build
  network, so those stay unverified live.

## 2026-10 — the feed data layer (`src/feed/`; its Live postings screen went in #389)

Real openings pulled from public, keyless, CORS-open APIs, then phrase-matched. Nothing is stored as a Job until
the user saves one (`addJobDetailed`). The Feed (Review new) and the auto-scan read through it.

- **`src/feed/`** is the whole data layer, pure + table-tested: `types.ts` (Posting / RankedPosting),
  `match.ts` (phrase matching — "system design" is NOT "design system" — filters, signals
  `contract` + `founding`, scoring, dedupe), `fetchFeed.ts` (parallel sources, per-source failure
  isolation with actionable messages, 1h **in-memory** cache — board payloads are 2–3 MB, far too big
  for browser storage; an LRU capped at `CACHE_BUDGET_CHARS` ≈ 16 MB, and liveness reads pass
  `{ fresh: true }` to skip it), `toJob.ts` (Posting → saved Job fields), `watchlist.ts`, `html.ts`, `format.ts`.
  Domain words: a **Posting** is the live, unsaved opening; saving one makes a **Job** (CONTEXT.md).
- **Sources** (`src/feed/sources/`): HN "Who is hiring?" via Algolia (latest 2 monthly threads; a post's yearly pay is read from its text, `hnPay.ts`, #580, and the card's pay line shows it, `payLabel` "$150k to $185k" / "€95k to €120k" / "CAD 150k", none when the post states none, #547),
  Remotive (its terms: link to the Remotive URL + credit it — the row's source label does — and
  **at most ~4 requests a day**: enforced per browser in localStorage, `rjb_feed_remotive`, 6h per-term
  cache, 4 calls per rolling 24h; over budget it says so), and
  **Greenhouse / Lever / Ashby company boards**. All take an injected `FetchJson` (tests never hit
  the network).
- **Watched tiles** (v11): a track's board tiles are still read into the v12 Sources by the move; new follows are
  Sources (#388).
- Key-backed aggregators (Adzuna, TheirStack) would need a serverless function for the secret —
  deliberately not built yet.
- **Job sources slice (2026-10-15, `docs/specs/job-sources.md`).**
  - **No board cap.** `fetchFeed` reads every distinct watched board, 6 at a time (`BOARD_CONCURRENCY`),
    and calls `onProgress` as each answers; Review new repaints every second (was 250 ms, 2026-11-07) with "Read N of M boards".
  - **More sources.** HN also reads the monthly "Freelancer? Seeking freelancer?" thread (only
    SEEKING FREELANCER posts, marked contract). Jobicy and Remote OK sit behind `SOURCE_ENABLED` in
    `fetchFeed.ts` (Jobicy on; Remote OK off until its live legal notice is read and checked), and Workable and Recruitee are watchable boards. All four are
    **unverified live** (built from documented shapes); turn one off there if its first deployed check
    is blocked. Remote OK attribution is a hard rule (their link as given, "Remote OK" on the row).
    Himalayas is skipped (its OpenAPI could not be read). Every new host goes in `vercel.json` and
    `FEED_HOSTS` in `csp.test.ts`.
  - **More boards (#216).** SmartRecruiters (`api.smartrecruiters.com`), Teamtailor (`*.teamtailor.com/jobs.json`)
    and Personio (`*.jobs.personio.de/search.json`) are board kinds the probe tries too, all **unverified live**.
    SmartRecruiters answers an empty list for any name, so the probe reads empty there as none
    (`EMPTY_MEANS_NONE`). `slugCandidates` gives up to 4 slugs (folds accents, `&` → and, drops a
    leading "The" and a trailing Labs/Software-like word in its bare forms).
  - **Targeting** (`feed/targeting.ts`): leave-out terms, level from the title only, a pay floor
    (only where a source states pay), each with a "hidden by" count; the Feed applies the profile's.
    **Saved searches** (`feed/savedFilters.ts`, `rjb_feed_filters`) are v11 data, still synced, with no UI.
  - **Liveness** (`feed/liveness.ts`, `livenessStore.ts`, `LivenessViews.tsx`): re-reads a saved
    Saved/Applied board job's board (once per board), flags "Closed on the board", never changes
    status, never marks closed on a failure. Cache in `rjb_liveness`, not synced. **Runs on open (#602, Adrian
    2026-11-11):** `LivenessViews.tsx` `LivenessOnOpen`, a lazy chunk App mounts like `AutoScanOnOpen` (behind
    `scanOnOpenEnabled()`): once sync settles, signed in only, never behind the sign-in screen, once per page load
    (`autoLivenessCheck`), each board read once, a job checked in the last 6 h not asked again (`dueJobs`). **No
    manual action anywhere** ("Check which are still open" is gone from the lg rail and the phone's Filters). **One
    quiet place (#601):** the job's Closed badge (on its Apply row and header; the Apply list's status line and
    `useClosedOnBoard` went in 2026-11-13); no page-top line, no "Checked live" date, no second link to a
    closed job (its Closed badge on the card and header says it). Pinned in `liveness.test.tsx`.
  - **Starter boards.** `radar/directory.ts` is `DIRECTORY_BY_PACK`; onboarding follows the design-systems
    list as Sources (`searchDefaults.seedSources`). `seedPack` / `topUpFromPack` (no app caller now) file the
    pack's boards as tiles (`addTiles`, upserts of `TILE_CHUNK` = 50 rows).
  - **Board feeds via `/api/boards` (2026-10-28, `docs/specs/job-sources.md`):** RSS/JSON boards with no CORS
    (designsystems.jobs on; We Work Remotely, Working Nomads, Himalayas, Authentic Jobs off pending terms or a
    live read) go through the same-origin edge function `api/boards.ts` → `feed/sources/boardsHandler.ts`: fixed
    upstream URLs per `src`, 1 h shared cache, parsed by `feed/sources/<board>.ts`, re-checked in
    `feed/sources/proxied.ts` and matched downstream like a watched board (read once per search). CSP and `legal.ts` unchanged (browser only reaches 'self'). Under `vite dev`/`preview` (E2E, gallery) the `local-api-boards` plugin in `vite.config.ts` answers it with no postings. A new board: adapter
    - one line each in `PROXIED_SOURCES` (`proxiedIds.ts`), `BOARD_ADAPTERS`, `FeedSourceId`/`SOURCE_LABEL` and `SOURCE_ENABLED`.
- **Board identity + five more boards (#src-ats, 2026-10-28).** A board found from a _name_ must show
  it is the company's (`feed/boardIdentity.ts`): the company's website domain on its apply links /
  website / job text (YC, Adele, GitHub org sites; github.io-style hosts are no evidence), else the
  name the board states (Dice ≥ 0.9). A lone board that says nothing either way is kept; the rest are
  **unconfirmed** (`DiscoverResult.unconfirmed`, with why), listed with "Watch anyway", never
  auto-watched. Pasted board URLs skip the check. Evidence rides in `rjb_probe` (`e`); an older live
  entry without it is asked again. BambooHR, Rippling, Gem, Pinpoint and Breezy HR are board kinds (the server sync and rotation read them too since #576; shape fixtures in `src/tracks/fixtures`)
  (`sources/atsExtra.ts`, **unverified live**, CORS too; why JazzHR, Comeet, Freshteam, Workday aren't is
  in its header). Pinned in `feed/boardIdentity.test.ts`, `probe.test.ts`, `sources/atsExtra.test.ts`.
- **Hidden-job discovery helpers (2026-10-15, `docs/specs/discovery-methods.md`; their screens went in #389).**
  `feed/probe.ts` asks each board kind for a company's board (200 + job list = live, 404 = none, anything else =
  **unknown, never none**; 6 in flight, 2 per host, 150 ms gap, 3×429 stops a host, cache `rjb_probe`);
  `discoverBoards.ts` (used by the Find box's company lookup), `yc.ts` (community mirror), `dsOrgs.ts` +
  `githubBudget.ts` (keyless GitHub search, 8 searches/min and 40 core/hour in `rjb_gh_budget`) feed the
  auto-scan's leads. Targets (`rjb_targets`) and dreams (`rjb_dreams`) are v11 stores the move reads. Big-company
  ATSs (Workday, SuccessFactors, Taleo, Oracle) are Google links only (Search elsewhere): never fetch them.
  `yc-oss.github.io` and `api.github.com` are in `connect-src` and `csp.test.ts`.
- **Company source (#215):** `feed/companySource.ts` is the YC hiring-now match (`ycMatches`) for the auto-scan's
  leads; `feed/teamTopics.ts` `teamSearchFor` is the design-system topic test (`roleType`, `dsOrgs`).
- ⚠️ **CSP (#41):** when a Content-Security-Policy lands, `connect-src` must allow `hn.algolia.com`,
  `remotive.com`, `boards-api.greenhouse.io`, `api.lever.co`, `api.eu.lever.co`, `api.ashbyhq.com`
  or the feed goes silent (each source would report "couldn't connect").
