-- Scored postings (Muse Phase 1 + 2, 2026-10-24). The sync edge function (supabase/functions/
-- sync-postings) reads each user's watched companies and the designsystems.jobs feed twice a day,
-- scores every posting with the track's config (src/tracks/score.ts), and upserts it here. The app
-- reads its own rows: the Pipeline's queue is verdict = 'queue' (score, then newest), Review is
-- verdict = 'review'. A Skip writes the posting and its reasons to `skips` (the tuning loop; no ML).
-- RLS is per user, like `tracker` and the curation tables: a user reads only their own rows. Only
-- the sync (service role, which bypasses RLS) writes postings and the log.

-- ---- watched companies: the boards the sync reads ----
create table if not exists public.watched_companies (
  id              bigint generated always as identity primary key,
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  track_slug      text not null default 'design-systems',
  company         text not null check (char_length(company) between 1 and 200),
  ats             text not null check (ats in ('greenhouse', 'lever', 'ashby')),
  slug            text not null check (slug ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'),
  enabled         boolean not null default true,
  -- Why the sync turned it off (a 404: the board is gone or the slug is wrong).
  disabled_reason text,
  last_status     int,
  last_synced_at  timestamptz,
  created_at      timestamptz not null default now(),
  unique (user_id, ats, slug)
);

alter table public.watched_companies enable row level security;

drop policy if exists "own rows only" on public.watched_companies;
create policy "own rows only" on public.watched_companies
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---- postings: every posting the sync read, scored ----
create table if not exists public.postings (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references auth.users on delete cascade,
  track_slug       text not null,
  source           text not null
                   check (source in ('greenhouse', 'lever', 'ashby', 'jsearch', 'adzuna',
                                     'remotive', 'hn', 'rss', 'manual')),
  source_id        text not null,
  -- `${ats}:${slug}` for a board, 'rss' for the feed: what a "missed sync" is counted against.
  board            text not null,
  company          text not null default '',
  title            text not null,
  location         text,
  remote           boolean,
  url              text not null,
  description_text text not null default '',
  posted_at        timestamptz,
  score            int not null,
  verdict          text not null check (verdict in ('queue', 'review', 'reject')),
  reasons          jsonb not null default '[]'::jsonb,
  matched_signals  jsonb not null default '[]'::jsonb,
  fingerprint      text not null,
  -- Syncs in a row whose read of `board` answered without this posting; 2 closes it.
  missed_syncs     int not null default 0,
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  closed_at        timestamptz,
  -- The brief upserts on (source, source_id); rows are per user, so the user is part of the key.
  unique (user_id, source, source_id)
);

create index if not exists postings_queue_idx
  on public.postings (user_id, track_slug, verdict, score desc, posted_at desc nulls last);
create index if not exists postings_fingerprint_idx on public.postings (user_id, fingerprint);
create index if not exists postings_board_idx on public.postings (user_id, track_slug, board);

alter table public.postings enable row level security;

drop policy if exists "read own rows" on public.postings;
create policy "read own rows" on public.postings
  for select
  using (auth.uid() = user_id);

-- ---- skips: a Skip on a queued posting, with the reasons it was queued for ----
create table if not exists public.skips (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  posting_id  bigint references public.postings on delete set null,
  track_slug  text not null,
  verdict     text check (verdict in ('queue', 'review', 'reject')),
  score       int,
  reasons     jsonb not null default '[]'::jsonb,
  title       text not null default '' check (char_length(title) <= 500),
  company     text not null default '' check (char_length(company) <= 200),
  created_at  timestamptz not null default now(),
  unique (user_id, posting_id)
);

alter table public.skips enable row level security;

drop policy if exists "read own rows" on public.skips;
create policy "read own rows" on public.skips
  for select
  using (auth.uid() = user_id);

drop policy if exists "skip own postings" on public.skips;
create policy "skip own postings" on public.skips
  for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.postings p where p.id = posting_id and p.user_id = auth.uid())
  );

-- Undo of a Skip.
drop policy if exists "unskip own rows" on public.skips;
create policy "unskip own rows" on public.skips
  for delete
  using (auth.uid() = user_id);

-- ---- sync log: a disabled company (404), a failed read, a run's totals ----
create table if not exists public.sync_log (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id    uuid references auth.users on delete cascade,
  kind       text not null check (kind in ('disabled', 'failed', 'run')),
  board      text,
  status     int,
  message    text not null default '' check (char_length(message) <= 2000)
);

alter table public.sync_log enable row level security;

drop policy if exists "read own rows" on public.sync_log;
create policy "read own rows" on public.sync_log
  for select
  using (auth.uid() = user_id);

-- ---- closing: a posting missing on 2 syncs in a row is rejected as "posting closed" ----
-- Counted only against boards whose read answered this run (a failed read never closes anything).
-- Service role only.
create or replace function public.mark_missed_postings(
  p_user uuid, p_track text, p_boards text[], p_run timestamptz
) returns integer
language sql
security definer
set search_path = public
as $$
  with upd as (
    update public.postings
       set missed_syncs = missed_syncs + 1,
           verdict   = case when missed_syncs + 1 >= 2 then 'reject' else verdict end,
           reasons   = case when missed_syncs + 1 >= 2 then '["posting closed"]'::jsonb else reasons end,
           closed_at = case when missed_syncs + 1 >= 2 then now() else closed_at end
     where user_id = p_user
       and track_slug = p_track
       and board = any (p_boards)
       and closed_at is null
       and last_seen_at < p_run
    returning 1
  )
  select count(*)::int from upd;
$$;

revoke all on function public.mark_missed_postings(uuid, text, text[], timestamptz)
  from public, anon, authenticated;
grant execute on function public.mark_missed_postings(uuid, text, text[], timestamptz)
  to service_role;

-- Keep the log to 90 days.
create extension if not exists pg_cron;
select cron.schedule(
  'sync-log-retention',
  '41 3 * * *',
  $$delete from public.sync_log where created_at < now() - interval '90 days'$$
);
