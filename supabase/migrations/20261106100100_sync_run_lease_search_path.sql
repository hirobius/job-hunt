-- #487 review: the run lease's security definer functions get an empty search_path, so no object in
-- a schema earlier on the caller's path can stand in for public.sync_run_lease. Every name in them
-- is schema-qualified (now() and make_interval() are pg_catalog, always searched). Same bodies as
-- 20261106100000_sync_postings_every_15_min.sql. Safe to run twice; run it after that file.
create or replace function public.claim_sync_run(p_run text, p_lease_ms int)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with took as (
    update public.sync_run_lease
       set run_start = p_run,
           lease_until = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_ms / 1000.0)
     where id = 1
       and (lease_until is null or lease_until < pg_catalog.now() or run_start = p_run)
    returning 1
  )
  select exists (select 1 from took);
$$;

create or replace function public.release_sync_run(p_run text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.sync_run_lease set lease_until = null where id = 1 and run_start = p_run;
$$;

revoke all on function public.claim_sync_run(text, int) from public, anon, authenticated;
revoke all on function public.release_sync_run(text) from public, anon, authenticated;
grant execute on function public.claim_sync_run(text, int) to service_role;
grant execute on function public.release_sync_run(text) to service_role;
