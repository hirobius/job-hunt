# sync-postings

The postings sync (Muse Phase 2 + 2.5). It reads every enabled row in `watched_companies` and,
on the morning run, the designsystems.jobs feed. Then it scores each posting with the track's
config (`src/tracks/`) and upserts it into `postings`. The Pipeline's queue and Review read
those rows.

Nothing here has been applied or deployed. The steps below are for Adrian.

1. Apply the migrations `supabase/migrations/2026102410*` in order: tables + RLS, the seed,
   then the cron.
2. Set the function's secret (any long random string):
   `supabase secrets set SYNC_SECRET=<random>`
3. Deploy with JWT checks off (the function checks `x-sync-secret` itself):
   `supabase functions deploy sync-postings --no-verify-jwt`
   The function imports `src/tracks/*.ts` by relative path. If the bundler refuses files outside
   `supabase/functions`, copy `src/tracks/{score,scoreForTrack,sources,sync,track-config}.ts`,
   `src/feed/html.ts` and `src/httpUrl.ts`
   into `supabase/functions/_shared/` and point the imports there.
4. Store the two values the cron reads in Vault (SQL editor):
   `select vault.create_secret('https://nelrcmbkimjjmfmgnixj.supabase.co', 'project_url');`
   `select vault.create_secret('<the same random>', 'sync_postings_secret');`
5. Run it once by hand. This first run is the seed check: a board that 404s is disabled and logged.
   `curl -X POST "$URL/functions/v1/sync-postings" -H "x-sync-secret: <random>" -d '{"rss":true}'`
   Then read `sync_log` (kind = `disabled` | `failed` | `run`).

Dry run with no database: `npm run sync:dry-run`.
