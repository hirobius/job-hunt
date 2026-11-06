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
  if exists (select 1 from cron.job where jobname = 'sync-postings-15min-23') then
    perform cron.unschedule('sync-postings-15min-23');
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

-- ---- one run at a time: a lease on the database's clock ----
-- A 15-minute run chains its slices; if one is still going when the next tick fires, the new tick
-- skips (sync-postings logs "previous run still going"). The first slice claims the lease, the
-- last slice releases it, and a run that dies mid-chain lets it expire after 14 minutes.
create table if not exists public.sync_run_lease (
  id          int primary key default 1 check (id = 1),
  run_start   text,
  lease_until timestamptz
);
insert into public.sync_run_lease (id) values (1) on conflict (id) do nothing;
alter table public.sync_run_lease enable row level security;
revoke all on public.sync_run_lease from public, anon, authenticated;

-- True when this run now holds the lease (no other run holds an unexpired one).
create or replace function public.claim_sync_run(p_run text, p_lease_ms int)
returns boolean
language sql
security definer
set search_path = public
as $$
  with took as (
    update public.sync_run_lease
       set run_start = p_run,
           lease_until = now() + make_interval(secs => p_lease_ms / 1000.0)
     where id = 1
       and (lease_until is null or lease_until < now() or run_start = p_run)
    returning 1
  )
  select exists (select 1 from took);
$$;

-- Lets the lease go, only for the run that holds it.
create or replace function public.release_sync_run(p_run text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.sync_run_lease set lease_until = null where id = 1 and run_start = p_run;
$$;

revoke all on function public.claim_sync_run(text, int) from public, anon, authenticated;
revoke all on function public.release_sync_run(text) from public, anon, authenticated;
grant execute on function public.claim_sync_run(text, int) to service_role;
grant execute on function public.release_sync_run(text) to service_role;
