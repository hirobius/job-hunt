-- #576 item 3 (Adrian 2026-11-11): the feeds (HN, Jobicy, designsystems.jobs and the keyless server
-- feeds) are read twice a day, at 06:23 and 14:23 UTC, so HN is at most ~8 h stale in the working
-- day instead of 24 h. The 14:23 run sends `"keyed": false`: TheirStack, Adzuna, Jooble and Remotive
-- still run on the morning run only, so their daily budgets do not change.
-- Rate notes: Remotive asks for ~4 requests a day: 2 terms on the morning run, 4 with a retry each
-- (sync.ts termsPerRun); Jobicy asks for no more than hourly; HN Algolia, Arbeitnow, Remote OK and
-- WWR are read 2 times a day.
-- 14:23 was a 15-minute boards-only tick (sync-postings-15min-23); this run reads the boards too,
-- so that job now skips 14 as it skips 06. Do NOT apply before review. Safe to run twice.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-postings-afternoon') then
    perform cron.unschedule('sync-postings-afternoon');
  end if;
  if exists (select 1 from cron.job where jobname = 'sync-postings-15min-23') then
    perform cron.unschedule('sync-postings-15min-23');
  end if;
end
$$;

-- :23 of every hour but 06 and 14 (the feeds runs).
select cron.schedule(
  'sync-postings-15min-23',
  '23 0-5,7-13,15-23 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/sync-postings',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-sync-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'sync_postings_secret')
    ),
    body    := '{"rss": false}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);

select cron.schedule(
  'sync-postings-afternoon',
  '23 14 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/sync-postings',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-sync-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'sync_postings_secret')
    ),
    body    := '{"rss": true, "keyed": false}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
