-- #448 (Adrian 2026-11-06): the postings sync runs every 15 minutes, so Review new is fresh when
-- the app opens and nobody waits on a full scan in the browser. The 06:23 run keeps reading the
-- feeds (HN, Remotive, Jobicy, designsystems.jobs, the server searches) once a day; every other
-- run reads the followed boards only. The 18:23 run is replaced by the 15-minute one.
-- Each run chains slices of 16 boards (sync-postings `SLICE`, a cursor in `after`), so no single
-- invocation nears the 150 s wall clock; a 429, 5xx or timeout is read once more after 2 s
-- (src/tracks/retry.ts). The secret and the project URL come from Vault (set once, README step 2):
-- nothing secret is in this file. Safe to run twice.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-postings-evening') then
    perform cron.unschedule('sync-postings-evening');
  end if;
  if exists (select 1 from cron.job where jobname = 'sync-postings-15min') then
    perform cron.unschedule('sync-postings-15min');
  end if;
end
$$;

-- :08, :23, :38, :53. Off the quarter hour, and the 06:23 feeds run lands on its own minute.
select cron.schedule(
  'sync-postings-15min',
  '8,38,53 * * * *',
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

-- :23 of every hour but 06 (06:23 is sync-postings-morning, which reads the feeds too).
select cron.schedule(
  'sync-postings-15min-23',
  '23 0-5,7-23 * * *',
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
