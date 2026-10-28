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
