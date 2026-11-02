-- Live verification for job-hunt#285 (security follow-ups from the 2026-10-22 audit).
--
-- READ-ONLY. Every statement below is a SELECT. Running this file changes nothing:
-- it does not apply any migration, and applying migrations stays Adrian's dashboard
-- step (Supabase -> SQL Editor), never an agent's.
--
-- How to use: paste into the Supabase SQL Editor for the live project and run it.
-- Each numbered check states what a passing result looks like. A check that does
-- not match its expectation is the finding — report it on #285, do not fix it here.
--
-- The repo side of each check:
--   * supabase/migrations/20261026100000_rls_policies_as_code.sql   (RLS as code)
--   * supabase/migrations/20261026100100_tracker_data_size_cap.sql  (blob cap, first form)
--   * supabase/migrations/20261026100200_client_errors_rate_limited_rpc.sql
--   * supabase/migrations/20261030100000_client_errors_per_client_limit.sql (supersedes
--     the global client_errors bucket with per-client counters)
--   * supabase/migrations/20261030100100_user_table_caps.sql        (blob cap, current
--     form: octet_length(data::text), superseding pg_column_size)

-- 1. RLS is enabled on every table the audit names.
--    Pass: 5 rows, every rls_enabled = true.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('tracker', 'categories', 'groups', 'tiles', 'client_errors')
order by c.relname;

-- 2. Policy inventory for the four user tables.
--    Pass: at least one policy per table, and every policy's qual / with_check
--    text contains auth.uid() = user_id. No other scoping should appear.
select
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('tracker', 'categories', 'groups', 'tiles')
order by tablename, policyname;

-- 3. No table privileges for the anon role on the four user tables.
--    Pass: 0 rows.
select
  table_name,
  privilege_type
from information_schema.role_table_grants
where grantee = 'anon'
  and table_schema = 'public'
  and table_name in ('tracker', 'categories', 'groups', 'tiles')
order by table_name, privilege_type;

-- 4. client_errors has no direct insert policy left.
--    Pass: 0 rows named 'anyone can report', and no policy with cmd = 'INSERT'
--    on client_errors at all — the RPC in check 5 is the only insert path.
select
  tablename,
  policyname,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'client_errors'
order by policyname;

-- 5. The capped insert door exists and is a security-definer function.
--    Pass: 1 row, prosecdef = true.
select
  p.proname as function_name,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'report_client_error';

-- 6. The tracker blob cap is present, in its current form.
--    Pass: 1 row, and the definition reads
--    CHECK (octet_length(data::text) < 8000000). The original
--    pg_column_size(data) form was replaced on purpose (#391): it measured
--    compressed on-disk size, so 8 MB did not mean 8 MB of JSON.
select
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition,
  pg_get_constraintdef(oid) ilike '%octet_length(data::text) < 8000000%' as is_current_form
from pg_constraint
where conname = 'tracker_data_size_cap';

-- Not checkable from SQL (Adrian, dashboard only):
--   * Redirect allow-list — Supabase -> Authentication -> URL Configuration:
--     confirm no wildcard like https://*.vercel.app is present (#285 slice 4).
