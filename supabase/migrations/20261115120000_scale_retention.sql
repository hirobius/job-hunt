-- Scale audit 2026-11-15: what grows per user without a limit, and two policies that read
-- auth.uid() once per row. No change to what any user can read or write.
--
-- 1. Closed postings are never deleted. A closed row is always a reject ("posting closed") and
--    nothing reads it again: the sync's lookups, feed_rows and the closing rules all ask for
--    `closed_at is null`. On 2026-11-15 they were 31,106 of 46,478 rows (two thirds of the
--    table). They go 14 days after they closed. designsystems.jobs rows ('rss') stay: its
--    catalog reads `known_dsjobs_postings` so that a page is not downloaded twice.
-- 2. The sync writes one `run` line per user per slice (about 800 a day for one user). Only the
--    newest one is read ("Updated N min ago"). They go after 14 days; `failed` and `disabled`
--    lines keep the 90 days of `sync-log-retention`.
-- 3. `board_suggestions` and `daily_picks` policies call auth.uid() for each row (Supabase
--    advisor 0003). `(select auth.uid())` is read once per statement, as every other policy
--    here does. `daily_picks` also names its role (it had none, so it was `public`; anon has no
--    grant on the table, so nothing was open).

create index if not exists postings_closed_at_idx
  on public.postings (closed_at) where closed_at is not null;

create extension if not exists pg_cron;

select cron.unschedule('postings-closed-retention')
 where exists (select 1 from cron.job where jobname = 'postings-closed-retention');
select cron.schedule(
  'postings-closed-retention',
  '53 3 * * *',
  $$delete from public.postings where closed_at < now() - interval '14 days' and source <> 'rss'$$
);

select cron.unschedule('sync-log-run-retention')
 where exists (select 1 from cron.job where jobname = 'sync-log-run-retention');
select cron.schedule(
  'sync-log-run-retention',
  '47 3 * * *',
  $$delete from public.sync_log where kind = 'run' and created_at < now() - interval '14 days'$$
);

drop policy if exists "read own rows" on public.board_suggestions;
create policy "read own rows" on public.board_suggestions
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "delete own rows" on public.board_suggestions;
create policy "delete own rows" on public.board_suggestions
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "read own rows" on public.daily_picks;
create policy "read own rows" on public.daily_picks
  for select to authenticated using ((select auth.uid()) = user_id);
