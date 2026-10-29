# sync-postings

The postings sync (Muse Phase 2 + 2.5; Simplify 6/9, #387). Twice a day it reads what each
signed-in user follows **from their synced `tracker` blob** (`src/tracks/plan.ts`):

- **Blob v12** (#384): `sources[]` (every board kind, followed companies, feeds; muted ones are
  skipped) and the Search profile `profiles[0]`.
- **Blob v11** (fallback, until #384 has moved a user): dream companies, outreach targets and the
  boards of saved jobs across every track, the tiles under each "Watched companies" section (read
  through the `watched_tile_urls()` function), and the verified list for a design systems user.

Then it reads every board once (Greenhouse, Lever, Ashby, Workable, Recruitee, SmartRecruiters,
Teamtailor, Personio, with the app's own parsers), and on the morning run HN, Remotive and Jobicy for
the profile's titles plus the designsystems.jobs feed. It scores each posting with the profile's config
(`src/tracks/`) and upserts it into `postings`. The app reads those rows (`src/feed/postingReader.ts`)
and adds them to what the browser finds, never in place of it.

There is no `watched_companies` or `skips` table: the blob is the one source of truth, and the sync
never writes it. A board that 404s is logged in `sync_log`; the user removes it from Sources.

Nothing here has been applied or deployed.

## Adrian's deploy steps

Project: `nelrcmbkimjjmfmgnixj`. Do the steps in order. Every SQL block goes in the SQL editor:
<https://supabase.com/dashboard/project/nelrcmbkimjjmfmgnixj/sql/new> (paste, then **Run**).

### 1. Create the tables

Open `supabase/migrations/20261024100000_postings.sql` in the repo, copy the whole file, paste it
into the SQL editor and run it. It creates `postings`, `sync_log`, `mark_missed_postings` and
`watched_tile_urls`, and is safe to run twice.

Check it worked (should list three names):

```sql
select table_name from information_schema.tables
 where table_schema = 'public' and table_name in ('postings', 'sync_log', 'tracker');
```

### 2. Make the shared secret and keep it in Vault

Run this once. It makes a random secret and stores it in Vault as `sync_postings_secret`, plus the
project URL as `project_url`:

```sql
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'sync_postings_secret');
select vault.create_secret('https://nelrcmbkimjjmfmgnixj.supabase.co', 'project_url');
```

(Already made once? Skip this step. To replace the secret later, use
`vault.update_secret(id, new_value)`, then repeat step 3 with the new value.)

### 3. Give the function the same secret

Show the value (copy it; don't paste it anywhere else):

```sql
select decrypted_secret from vault.decrypted_secrets where name = 'sync_postings_secret';
```

Then open Edge Functions → Secrets:
<https://supabase.com/dashboard/project/nelrcmbkimjjmfmgnixj/functions/secrets>

Add a secret named `SYNC_SECRET` and paste the value. Save. Until this is set, the function refuses
every call (403): there is no built-in fallback.

### 4. Deploy the function

From the repo root on your computer (needs Node; `npx` fetches the Supabase CLI):

```sh
npx supabase login
npx supabase functions deploy sync-postings --project-ref nelrcmbkimjjmfmgnixj --no-verify-jwt
```

`--no-verify-jwt` is required: the cron calls it with the secret header, not a user token.
The function imports `src/tracks/*.ts` and `src/feed/sources/*.ts` by relative path. If the deploy
says it can't find a file outside `supabase/functions`, update the CLI (`npx supabase@latest …`) and
try again; tell Claude if it still fails.

Check it is there: <https://supabase.com/dashboard/project/nelrcmbkimjjmfmgnixj/functions>

### 5. Run it once by hand (the seed check)

```sql
select net.http_post(
  url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
             || '/functions/v1/sync-postings',
  headers := jsonb_build_object(
    'content-type', 'application/json',
    'x-sync-secret',
    (select decrypted_secret from vault.decrypted_secrets where name = 'sync_postings_secret')
  ),
  body    := '{"rss": true}'::jsonb,
  timeout_milliseconds := 150000
);
```

If `net.http_post` is missing, run `create extension if not exists pg_net;` first.
Wait about 2 minutes (it reads 8 boards per call and calls itself for the rest), then read the log:

```sql
select created_at, kind, board, status, left(message, 200) as message
  from public.sync_log order by id desc limit 50;
```

- `run` rows: one per user per slice, with queue / review / reject counts.
- `failed` rows: a board or feed that didn't answer. Status 404 means the board is gone or the slug
  is wrong: remove that company from Sources in the app.

And the postings it stored:

```sql
select verdict, count(*) from public.postings where closed_at is null group by verdict;
```

### 6. Turn on the twice-a-day schedule

Open `supabase/migrations/20261024100200_sync_postings_cron.sql`, copy the whole file, paste and
run it. Check:

```sql
select jobname, schedule from cron.job where jobname like 'sync-postings%';
```

To stop it later: `select cron.unschedule('sync-postings-morning'); select cron.unschedule('sync-postings-evening');`

## Scan rotation (bulk boards, #src-bulk)

Besides what each user follows, the function scans the **bulk board set**: every public company
board in `src/feed/data/boards.json` (read through `src/feed/boardSet.ts`), thousands of them, a
batch at a time. pg_cron calls it once a minute with `{"rotate": true}`. It stores only postings that
are **queue or review** under a design systems profile **and remote** (remote, or no mode and no city
named: the app's remote-only rule, `src/feed/mode.ts` `remoteVerdict`), and only for users whose
Search profile is design systems. Other users get nothing from it. Rules: `src/tracks/rotation.ts`.

- **Order and cursor.** Boards in a fixed shuffled order (a hash of each board's key), so the hosts
  are mixed and a board keeps its place when the snapshot changes. The cursor is the last board
  passed; past the end it wraps and the cycle count goes up. It moves only over boards actually
  processed: a read the time box stopped before it started is read on the next run.
- **One batch a minute.** At most 25 boards, and no more once their open roles reach 1,500 (big
  boards cost CPU to parse and score). Any read whose host has room starts; none starts after 40 s;
  each read is capped at 15 s. At most 3 reads per host at once (all of Greenhouse is one host;
  Ashby 1), 6 in all. A run holds the cursor (`claim_scan_rotation`, a 150 s lease, released last),
  so two runs never read the same boards.
- **429.** The host waits 15 min, doubling per 429 in a row, at most 24 h; an answer clears it. Its
  boards don't hold up the walk: they are passed and go on a carry list (at most 500) that is read
  first once the host is free. Past 500 a board is passed as "overflow" and read on the next cycle
  (counted in the run's log row). A run passes at most 100 boards, so even a long backoff can't skip
  a cycle in a few minutes.
- **404.** The board's scan postings close (not those of a user who follows it: their own sync
  handles its 404), and it goes to `scan_dead_boards`: asked again after 1 day, then 3, then 7, and
  no longer read after 4 404s in a row (delete its row to try again). A dead board that answers is
  back at once.
- **Anything else** (5xx, timeout) closes nothing and doesn't count as dead.
- **Closing.** A stored posting missing from 2 answered reads of its board closes
  (`mark_missed_postings`). That also closes one that stops being remote or a match.
- **No double reads.** A board a user follows is skipped for that user: the twice-a-day sync reads
  it with all of its rules. The scan's rows carry `via_scan`, which the sync's "no longer followed"
  closing leaves alone.
- **Who it is for** (every user's plan) is cached in a warm worker for 5 minutes, so a newly
  followed board or a profile change reaches the scan within about 5 minutes. A cold worker reads
  every blob again.

### The run-time math

From `rotationMath` in `src/tracks/rotation.ts` (`npm run sync:dry-run -- --rotate` prints it for
the committed set too):

| Boards | Open roles per board | Boards per run | Runs per cycle | Hours per full cycle | Slowest batch's reads |
| -----: | -------------------: | -------------: | -------------: | -------------------: | --------------------: |
|  5,000 |                   30 |             25 |            200 |                  3.3 |                  18 s |
|  5,000 |                  100 |             15 |            334 |                  5.6 |                  14 s |
| 10,000 |                   30 |             25 |            400 |                  6.7 |                  18 s |
| 10,000 |                  100 |             15 |            667 |                 11.1 |                  16 s |

The last column assumes 2 s a read and a mix of 60% Greenhouse, 25% Lever, 15% Ashby (the real
set's mix is printed by the dry run); every batch fits the 40 s time box.

Against Supabase's edge function limits:

- **CPU, 2 s per request** (waiting on the network doesn't count): one run parses and scores at
  most 25 boards / 1,500 roles. Not measured live yet: if `sync_log` shows runs cut off, lower
  `maxBoards` or `jobsBudget` in `rotation.ts` (the cycle gets longer by the same factor).
- **Wall clock, 150 s free / 400 s paid**: reads stop starting at 40 s and end by 55 s; user writes
  stop at 110 s (the users left wait, and the batch is read again next run); after that only the
  dead list, the log and the cursor are written. The lease is 150 s, so runs never overlap; a run
  past 60 s makes the next cron call answer "busy".
- **Invocations, 500,000 a month free**: 60 an hour = 43,200 a month, plus the twice-a-day sync.
- Who the scan is for comes from every user's blob, read at most every 5 minutes per warm worker
  (and on every cold start): fine for a few users; past a few hundred, that read should move to a
  table.

### Turn on the rotation

Do this after steps 1 to 6 above (the tables, Vault secrets and the deployed function).

1. Deploy the function again (step 4): the board set ships inside it, so **redeploy whenever
   `boards.json` changes**.
2. Open `supabase/migrations/20261029100000_scan_rotation.sql`, copy the whole file, paste it into
   the SQL editor and run it. It creates `scan_rotation` (the cursor), `scan_dead_boards`,
   `claim_scan_rotation`, adds `via_scan` to `postings`, updates `close_unfollowed_postings`, and
   schedules `sync-postings-rotate` every minute. Safe to run twice.

   Check:

   ```sql
   select jobname, schedule from cron.job where jobname = 'sync-postings-rotate';
   select cursor_key, cycle, cycle_started_at, carry, host_backoff from public.scan_rotation;
   ```

3. A few minutes later, see it move (the cursor changes every minute; each answer is in pg_net's
   responses for a few hours):

   ```sql
   select cursor_key, cycle, jsonb_array_length(carry) as carried, host_backoff, updated_at
     from public.scan_rotation;
   select created, status_code, left(content::text, 300) as answer
     from net._http_response order by id desc limit 5;
   ```

   `"rotate":"idle"` means no user has a design systems profile yet; `"rotate":"busy"` means the
   previous run still held the cursor.

4. After a full cycle (see the table), the log has one `run` row per cycle with `cycleHours`:

   ```sql
   select created_at, left(message, 300) from public.sync_log
    where kind = 'run' and message like '{"rotate"%' order by id desc limit 5;
   select board_key, fails, retry_at, disabled from public.scan_dead_boards order by fails desc limit 20;
   ```

To stop it: `select cron.unschedule('sync-postings-rotate');`

## Secrets and env

Names only; values never go in the repo. Full table in `docs/secrets.md`.

| Name                        | Where                              |
| --------------------------- | ---------------------------------- |
| `SYNC_SECRET`               | Edge Functions → Secrets (step 3)  |
| `sync_postings_secret`      | Vault, same value (step 2)         |
| `project_url`               | Vault (step 2)                     |
| `SUPABASE_URL`              | set by Supabase for every function |
| `SUPABASE_SERVICE_ROLE_KEY` | set by Supabase for every function |

A missing `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` returns 500 naming the var.

## Dry run

`npm run sync:dry-run` plans a run from a sample design systems blob, reads the boards and feeds and
scores them, with no database. Behind a proxy:
`NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=<bundle> npm run sync:dry-run`.

`npm run sync:dry-run -- --rotate` plans the rotation's next batch from `boards.json` and prints the
cycle math, with no network; add `--read` to read that batch and count what would be stored.
