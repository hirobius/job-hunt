-- Security Advisor warnings (2026-11-17). Each SECURITY DEFINER function in public is callable only
-- by the roles that really call it. Live grants before this migration (read 2026-11-17):
--   add_daily_picks, client_error_count, report_client_error: anon, authenticated
--   delete_my_data: authenticated
-- Supabase's default privileges give a new function in public to anon AND authenticated, so a
-- `grant ... to anon` alone (20261112100000) still left client_error_count open to authenticated.
--
-- Who calls what (every caller below sends the publishable key as its Bearer, so it runs as anon):
--   report_client_error  src/errorReport.ts supabaseSender: apikey + Bearer = SUPABASE_ANON_KEY.
--   add_daily_picks      the scheduled picks run (docs/daily-picks.md): apikey = publishable key.
--   client_error_count   scripts/error-spike.ts: apikey + Bearer = SUPABASE_ANON_KEY.
--   delete_my_data       src/account (signed-in user's JWT): authenticated.
-- So authenticated is revoked from the three anon doors, and anon stays revoked from delete_my_data.
--
-- KNOWN ADVISOR EXCEPTIONS (intended; the warning stays and is accepted):
--   * anon may execute report_client_error: the crash-report door (#47, #285, #319, #391).
--     search_path = ''; the table's checks bound every field; rate-limited per client (5/min,
--     30/day) and globally (120/min, 1,000/day) by atomic counters (20261030100000).
--   * anon may execute add_daily_picks: token-gated (sha256 of a 256-bit token in
--     daily_pick_feeds, which only the function reads). search_path = ''; 1 to 10 picks a call,
--     each field trimmed and length-capped; 50 a day per account under an advisory lock.
--   * anon may execute client_error_count: token-gated (ops_alert_tokens, purpose
--     'client-errors'); search_path = ''; returns a COUNT only, never a row; window <= 31 days on
--     the created_at index. No call throttle: like the picks token, a 256-bit token cannot be
--     guessed, and a valid caller learns one integer.
--   * authenticated may execute delete_my_data: the user's own erasure (#393). search_path = '';
--     refuses unless auth.uid() is not null and equals p_user (p_user guards a tab whose session
--     flipped to another account). It can only delete the caller's rows and auth user.
--   * pg_net in public (extension_in_public): pg_net 0.20.3 is not relocatable
--     (ALTER EXTENSION ... SET SCHEMA fails), and its functions and queue tables are in schema
--     `net`, not public: nothing of it is in the PostgREST API. Moving it means DROP + CREATE
--     EXTENSION (owned by supabase_admin), which drops the net queue and any in-flight cron
--     requests. Every call site (cron jobs sync-postings-*, 20261024100200, 20261029100100,
--     20261106100000, 20261111100100, 20261115100000) calls `net.http_post` schema-qualified, so a
--     move would not break them; it is left as is because the gain is nil. Revisit only if
--     Supabase ships a supported move.
--
-- Safe to run twice.

revoke all on function public.report_client_error(text, text, text, text, text)
  from public, authenticated;
grant execute on function public.report_client_error(text, text, text, text, text) to anon;

revoke all on function public.add_daily_picks(text, jsonb) from public, authenticated;
grant execute on function public.add_daily_picks(text, jsonb) to anon;

revoke all on function public.client_error_count(text, timestamptz, timestamptz)
  from public, authenticated;
grant execute on function public.client_error_count(text, timestamptz, timestamptz) to anon;

revoke all on function public.delete_my_data(uuid) from public, anon;
grant execute on function public.delete_my_data(uuid) to authenticated;

-- New functions in public grant EXECUTE to nobody by default; each migration grants what it needs.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- Say so if a grant did not take (Postgres only warns when the running role lacks the right).
do $$ begin
  if has_function_privilege('authenticated', 'public.add_daily_picks(text, jsonb)', 'execute')
     or has_function_privilege('authenticated',
          'public.client_error_count(text, timestamptz, timestamptz)', 'execute')
     or has_function_privilege('authenticated',
          'public.report_client_error(text, text, text, text, text)', 'execute')
     or has_function_privilege('anon', 'public.delete_my_data(uuid)', 'execute') then
    raise warning 'security advisor grants not applied: check the function owners';
  end if;
end $$;
