-- Least-privilege grants (security review L1, L2, L4).
-- L1: anon gets no table privileges in public. authenticated keeps only what the client and the
--     RLS policies use. New tables in public grant nothing to anon (or authenticated) by default.
-- L2: user-owned policies apply TO authenticated, not TO public.
-- L4: anon and authenticated cannot call net.* (pg_net).
-- report_client_error stays callable by anon: it is SECURITY DEFINER, so it needs no table grant.
-- The service role (Edge Functions, scheduled runs) is not changed. Safe to run twice.

-- L1: take back every table and sequence privilege, then grant only what the client uses.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select, insert, update, delete on public.tracker    to authenticated; -- CloudSyncProvider
grant select, insert, update, delete on public.categories to authenticated; -- curation/sync (upsert)
grant select, insert, update, delete on public.groups     to authenticated; -- curation/sync (upsert)
grant select, insert, update, delete on public.tiles      to authenticated; -- curation/sync (upsert)
grant select on public.postings to authenticated; -- tracks/postings and feed_rows (invoker)
grant select on public.sync_log to authenticated; -- tracks/postings
do $$ begin
  if to_regclass('public.daily_picks') is not null then
    grant select on public.daily_picks to authenticated; -- picks.ts
  end if;
end $$;

-- L1: new objects that postgres makes in public grant nothing to anon or authenticated.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

-- L2: policies TO authenticated (same USING / WITH CHECK).
alter policy "read own rows" on public.postings to authenticated;
alter policy "read own rows" on public.skips to authenticated;
alter policy "skip own postings" on public.skips to authenticated;
alter policy "unskip own rows" on public.skips to authenticated;
alter policy "read own rows" on public.sync_log to authenticated;
alter policy "own rows only" on public.tracker to authenticated;
alter policy "own rows only" on public.watched_companies to authenticated;

-- L4: pg_net is for the service role and cron only. The net.* functions have a null ACL, so
-- EXECUTE comes from PUBLIC; revoke it there too and give it back to postgres and service_role.
-- net.* is owned by supabase_admin. If the role that runs this has no grant option, Postgres only
-- warns and changes nothing, so the check below says so instead of failing silently.
revoke execute on all functions in schema net from public, anon, authenticated;
grant execute on all functions in schema net to postgres, service_role;
do $$ begin
  if has_function_privilege('anon', 'net.http_post(text, jsonb, jsonb, jsonb, integer)', 'execute')
     or has_function_privilege('authenticated', 'net.http_post(text, jsonb, jsonb, jsonb, integer)', 'execute') then
    raise warning 'L4 not applied: anon or authenticated can still execute net.*; run the net section as supabase_admin';
  end if;
end $$;

-- Client RPCs (unchanged, restated so the intent is in one place).
grant execute on function public.feed_rows(integer, text) to authenticated;
grant execute on function public.delete_my_data(uuid) to authenticated;
grant execute on function public.report_client_error to anon, authenticated;
