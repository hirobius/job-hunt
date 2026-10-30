-- client_errors: a limit per client, not one global bucket (#319, #391). The 20261026100200 RPC
-- counted the last minute's reports across everyone and refused past 60, so one script spending
-- that budget switched off crash reporting for every real user, could store ~86k rows a day, and
-- each call scanned the whole table (no index on created_at; count-then-insert also raced).
--
-- Now `report_client_error` bumps four counters in one statement each (an atomic upsert: no scan,
-- no race) and refuses when any is over:
--   * this client, per minute (5) and per day (30): the app sends at most 5 per page load;
--   * everyone, per minute (120) and per day (1,000): a ceiling on storage (~2.5 MB a day at the
--     column caps) for when the client key is spoofed (see below).
-- A refused call raises, so its transaction rolls back and it spends no budget.
--
-- The client is the caller's IP as the API gateway reports it: `cf-connecting-ip` (set by the
-- edge, a client cannot supply it), else `x-real-ip`, else the first `x-forwarded-for` hop (which
-- a client CAN prefix: then only the global ceiling holds). Unverified live which headers the
-- project's gateway passes; with none of them every caller shares one 'unknown' bucket, which is
-- the old global behaviour at a tighter cap. The address is never stored: only a SHA-256 of a
-- random salt and the address, in a table nobody but the owner can read, swept after 2 days, and
-- the salt is replaced every night, so yesterday's codes cannot be matched to today's. Nothing
-- links a bucket to a report.
--
-- Safe to run twice. Run after 20261026100200_client_errors_rate_limited_rpc.sql.

-- ---- the retention sweep's index (and any dashboard query by time) ----
create index if not exists client_errors_created_at_idx on public.client_errors (created_at);

-- ---- counters: bucket = 'c:<code>:m' | 'c:<code>:d' | 'all:m' | 'all:d' ----
create table if not exists public.client_error_rate (
  bucket       text not null,
  window_start timestamptz not null,
  n            int not null default 0,
  primary key (bucket, window_start)
);

alter table public.client_error_rate enable row level security;
revoke all on public.client_error_rate from public, anon, authenticated;

-- ---- the salt: one row, replaced nightly ----
create table if not exists public.client_error_salt (
  id   smallint primary key default 1 check (id = 1),
  salt text not null default gen_random_uuid()::text || gen_random_uuid()::text
);

insert into public.client_error_salt (id) values (1) on conflict (id) do nothing;

alter table public.client_error_salt enable row level security;
revoke all on public.client_error_salt from public, anon, authenticated;

-- ---- the one door ----
create or replace function public.report_client_error(
  p_kind    text,
  p_message text,
  p_stack   text,
  p_route   text,
  p_browser text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  client_per_minute constant int := 5;
  client_per_day    constant int := 30;
  all_per_minute    constant int := 120;
  all_per_day       constant int := 1000;
  headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  ip      text;
  code    text;
  minute  timestamptz := date_trunc('minute', now());
  day     timestamptz := date_trunc('day', now());
  n       int;
begin
  ip := coalesce(
    nullif(btrim(headers ->> 'cf-connecting-ip'), ''),
    nullif(btrim(headers ->> 'x-real-ip'), ''),
    nullif(btrim(split_part(headers ->> 'x-forwarded-for', ',', 1)), ''),
    'unknown'
  );
  select encode(sha256(convert_to(s.salt || '|' || ip, 'UTF8')), 'hex') into code
    from public.client_error_salt s where s.id = 1;

  insert into public.client_error_rate as r (bucket, window_start, n)
  values ('c:' || code || ':m', minute, 1)
  on conflict (bucket, window_start) do update set n = r.n + 1
  returning r.n into n;
  if n > client_per_minute then
    raise exception 'client error report rate limit exceeded' using errcode = 'P0001';
  end if;

  insert into public.client_error_rate as r (bucket, window_start, n)
  values ('c:' || code || ':d', day, 1)
  on conflict (bucket, window_start) do update set n = r.n + 1
  returning r.n into n;
  if n > client_per_day then
    raise exception 'client error report rate limit exceeded' using errcode = 'P0001';
  end if;

  insert into public.client_error_rate as r (bucket, window_start, n)
  values ('all:m', minute, 1)
  on conflict (bucket, window_start) do update set n = r.n + 1
  returning r.n into n;
  if n > all_per_minute then
    raise exception 'client error report rate limit exceeded' using errcode = 'P0001';
  end if;

  insert into public.client_error_rate as r (bucket, window_start, n)
  values ('all:d', day, 1)
  on conflict (bucket, window_start) do update set n = r.n + 1
  returning r.n into n;
  if n > all_per_day then
    raise exception 'client error report rate limit exceeded' using errcode = 'P0001';
  end if;

  insert into public.client_errors (kind, message, stack, route, browser)
  values (p_kind, p_message, p_stack, coalesce(p_route, ''), coalesce(p_browser, ''));
end;
$$;

revoke all on function public.report_client_error(text, text, text, text, text) from public;
grant execute on function public.report_client_error(text, text, text, text, text)
  to anon, authenticated;

-- The direct insert path stays closed (20261026100200 dropped it; this is a no-op re-check).
drop policy if exists "anyone can report" on public.client_errors;

-- ---- nightly: drop old counters, replace the salt ----
create extension if not exists pg_cron;
select cron.schedule(
  'client-error-rate-sweep',
  '29 3 * * *',
  $$
  delete from public.client_error_rate where window_start < now() - interval '2 days';
  update public.client_error_salt
     set salt = gen_random_uuid()::text || gen_random_uuid()::text
   where id = 1;
  $$
);
