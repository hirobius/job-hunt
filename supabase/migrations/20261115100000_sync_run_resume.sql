-- A run that always finishes (2026-11-15). Measured on 2026-11-14: every 15-minute run of
-- sync-postings stopped in its 4th slice ("CPU Time exceeded" in the function log, nothing in
-- sync_log), so 48 of 157 followed boards were read, the feeds step on the last slice never ran,
-- and the next run started from the first board again.
--
-- The run's place is now kept in the lease row: each slice saves where the next one starts. A run
-- whose place has not moved for a while is picked up by the resume tick below (every minute) in a
-- new invocation, which goes on from that place with the run's own start time, so nothing is read
-- twice and a posting is counted missed against one run only. After a few tries on the same place
-- the run is given up (logged), and the next 15-minute tick starts a new one.
--
-- APPLY AFTER the function that reads `{"resume": true}` is deployed (supabase/deploy-order.json):
-- an older function reads that body as a new run.

alter table public.sync_run_lease
  add column if not exists cursor     text,
  add column if not exists cursor_at  timestamptz,
  add column if not exists payload    jsonb,
  add column if not exists resumes    int not null default 0;

-- Every function here keeps the #487 hardening (20261106100100): an empty search_path and
-- schema-qualified names.
-- A new run's claim also resets the place in the same statement, so the resume tick (which fires
-- in the same second as a 15-minute tick) never takes the old run's place under the new run.
create or replace function public.claim_sync_run(p_run text, p_lease_ms int)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with took as (
    update public.sync_run_lease
       set run_start   = p_run,
           lease_until = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_ms / 1000.0),
           cursor      = '',
           cursor_at   = pg_catalog.now(),
           payload     = null,
           resumes     = 0
     where id = 1
       and (lease_until is null or lease_until < pg_catalog.now() or run_start = p_run)
    returning 1
  )
  select exists (select 1 from took);
$$;

revoke all on function public.claim_sync_run(text, int) from public, anon, authenticated;
grant execute on function public.claim_sync_run(text, int) to service_role;

-- A slice saves its place: `p_after` at its start (the heartbeat), the next slice's start at its
-- end, null when the run is done. False when the lease is no longer this run's (a newer run took
-- it): that slice stops. A live run keeps its lease.
create or replace function public.save_sync_cursor(
  p_run text, p_after text, p_payload jsonb, p_lease_ms int
) returns boolean
language sql
security definer
set search_path = ''
as $$
  with upd as (
    update public.sync_run_lease
       set resumes     = case when cursor is not distinct from p_after then resumes else 0 end,
           cursor      = p_after,
           cursor_at   = pg_catalog.now(),
           payload     = p_payload,
           lease_until = case when p_after is null then lease_until
                              else pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_ms / 1000.0) end
     where id = 1 and run_start = p_run
    returning 1
  )
  select exists (select 1 from upd);
$$;

-- The resume tick's claim. One row when a run's place has stood still for `p_stale_ms`:
-- `gave_up` false = go on from `after` (the lease and the heartbeat are taken in the same
-- statement, so two ticks never take the same place); `gave_up` true = it stood still `p_max`
-- times, the place and the lease are cleared. No row: nothing to resume.
create or replace function public.claim_sync_resume(p_stale_ms int, p_max int, p_lease_ms int)
returns table (run_start text, after text, payload jsonb, resumes int, gave_up boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.sync_run_lease%rowtype;
begin
  select * into r from public.sync_run_lease l
   where l.id = 1
     and l.cursor is not null
     and l.cursor_at < pg_catalog.now() - pg_catalog.make_interval(secs => p_stale_ms / 1000.0)
   for update;
  if not found then
    return;
  end if;
  if r.resumes >= p_max then
    update public.sync_run_lease l
       set cursor = null, cursor_at = pg_catalog.now(), resumes = 0, lease_until = null,
           -- No run holds the row now: a slice of the given-up run that is still alive finds no
           -- match in save_sync_cursor, so it stops and cannot extend the lease.
           run_start = null
     where l.id = 1;
    return query select r.run_start, r.cursor, r.payload, r.resumes, true;
    return;
  end if;
  update public.sync_run_lease l
     set cursor_at   = pg_catalog.now(),
         resumes     = l.resumes + 1,
         lease_until = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_ms / 1000.0)
   where l.id = 1;
  return query select r.run_start, r.cursor, r.payload, r.resumes + 1, false;
end
$$;

revoke all on function public.save_sync_cursor(text, text, jsonb, int)
  from public, anon, authenticated;
revoke all on function public.claim_sync_resume(int, int, int) from public, anon, authenticated;
grant execute on function public.save_sync_cursor(text, text, jsonb, int) to service_role;
grant execute on function public.claim_sync_resume(int, int, int) to service_role;

-- The resume tick: every minute, a cheap call that does nothing unless a run stood still.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-postings-resume') then
    perform cron.unschedule('sync-postings-resume');
  end if;
end
$$;

select cron.schedule(
  'sync-postings-resume',
  '* * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/sync-postings',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-sync-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'sync_postings_secret')
    ),
    body    := '{"resume": true}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
