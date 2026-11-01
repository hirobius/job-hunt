-- Scan rotation (#src-bulk, 2026-10-29). The postings sync's `{ "rotate": true }` mode
-- (supabase/functions/sync-postings, src/tracks/rotation.ts) reads the bulk board set
-- (src/feed/data/boards.json, thousands of public company boards) a batch a minute, so every board
-- is read about every 6 to 12 hours, and stores only remote design-system roles for users whose
-- Search profile is design systems. This file adds what the rotation keeps between runs and its
-- schedule. Not applied yet; safe to run twice. Run it after 20261024100000_postings.sql and with
-- the Vault secrets of 20261024100200_sync_postings_cron.sql in place.
-- Service role only: RLS is on and there are no policies, so the app's users read nothing here.

-- ---- the cursor: one row ----
create table if not exists public.scan_rotation (
  id               smallint primary key default 1 check (id = 1),
  -- The last place in the walk passed (rotation.ts `orderKey`: a hash, '|', the board key); ''
  -- before the first.
  cursor_key       text not null default '',
  -- Full passes over the set; bumped when the cursor wraps to the start.
  cycle            int not null default 0,
  cycle_started_at timestamptz not null default now(),
  -- Host (registrable domain) → { until, strikes } after a 429.
  host_backoff     jsonb not null default '{}'::jsonb,
  -- Board keys the cursor passed while their host was backed off, read first once it is free.
  carry            jsonb not null default '[]'::jsonb,
  -- One run at a time: a run holds the row until this time (claim_scan_rotation).
  lease_until      timestamptz,
  updated_at       timestamptz not null default now()
);

insert into public.scan_rotation (id) values (1) on conflict (id) do nothing;

alter table public.scan_rotation enable row level security;

-- ---- boards that answered 404: retried after 1, 3, then 7 days; disabled after 4 in a row ----
create table if not exists public.scan_dead_boards (
  board_key    text primary key,
  last_status  int not null,
  fails        int not null default 1,
  retry_at     timestamptz not null,
  -- Not read again. Delete the row to give the board another try.
  disabled     boolean not null default false,
  last_checked timestamptz not null default now()
);

alter table public.scan_dead_boards enable row level security;

-- ---- claiming the cursor: the row, when no other run holds it (the database's clock) ----
create or replace function public.claim_scan_rotation(p_lease_ms int)
returns setof public.scan_rotation
language sql
security definer
set search_path = public
as $$
  update public.scan_rotation
     set lease_until = now() + make_interval(secs => p_lease_ms / 1000.0)
   where id = 1
     and (lease_until is null or lease_until < now())
  returning *;
$$;

revoke all on function public.claim_scan_rotation(int) from public, anon, authenticated;
grant execute on function public.claim_scan_rotation(int) to service_role;

-- ---- postings the scan wrote ----
-- The scan's rows are on boards the user does not follow, so the twice-a-day sync's
-- close_unfollowed_postings must leave them to the rotation (which closes them on a 404 or after 2
-- misses). A row the user's own sync writes keeps the flag it had.
alter table public.postings add column if not exists via_scan boolean not null default false;

create index if not exists postings_scan_board_idx
  on public.postings (board) where via_scan and closed_at is null;

-- The same function as in 20261024100000_postings.sql, but a scan row on a board outside `p_keep`
-- stays open. Rows under another profile (`p_track`) and every row of a user with no profile
-- (`p_track` null) still close, scan rows too.
create or replace function public.close_unfollowed_postings(
  p_user uuid, p_track text, p_keep text[]
) returns integer
language sql
security definer
set search_path = public
as $$
  with upd as (
    update public.postings
       set verdict   = 'reject',
           reasons   = '["posting closed"]'::jsonb,
           closed_at = now()
     where user_id = p_user
       and closed_at is null
       and (p_track is null
            or track_slug <> p_track
            or (not via_scan and not (board = any (coalesce(p_keep, '{}'::text[])))))
    returning 1
  )
  select count(*)::int from upd;
$$;

revoke all on function public.close_unfollowed_postings(uuid, text, text[])
  from public, anon, authenticated;
grant execute on function public.close_unfollowed_postings(uuid, text, text[])
  to service_role;

-- No change to the postings `source` check: the board kinds it does not list (BambooHR, Rippling,
-- Gem, Pinpoint, Breezy) are stored as 'manual' (src/tracks/sync.ts `normalize`).

-- ---- the schedule: one rotation step a minute ----
-- Each step reads at most 25 boards, stops starting reads after 40 s and writing after 110 s; a
-- step still running when the next minute comes holds the lease, so that call answers "busy"
-- (README: the run-time math). Rescheduling under the same name replaces the job.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'sync-postings-rotate',
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
    body    := '{"rotate": true}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
