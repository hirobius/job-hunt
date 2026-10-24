-- Run the postings sync (supabase/functions/sync-postings) twice a day: the morning run also polls
-- the designsystems.jobs feed (daily, Phase 2.5); the evening run reads the boards only. pg_net
-- posts to the function with a shared secret. Both values live in Vault and are set by hand once
-- (see supabase/functions/sync-postings/README.md): `project_url` and `sync_postings_secret`.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'sync-postings-morning',
  '23 6 * * *',
  $$
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
  $$
);

select cron.schedule(
  'sync-postings-evening',
  '23 18 * * *',
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
