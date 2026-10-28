-- Scored postings (Muse Phase 1 + 2, 2026-10-24; Simplify 6/9, #387). The sync edge function
-- (supabase/functions/sync-postings) reads what each user follows from their synced `tracker` blob
-- (Sources and the Search profile; a v11 blob's watched tiles through `watched_tile_urls` below)
-- twice a day, scores every posting with the profile's config (src/tracks/score.ts), and upserts
-- it here. The app reads its own rows: the queue is verdict = 'queue' (score, then newest), Review
-- is verdict = 'review'. A Skip is kept in the blob by posting (`decided`), never here.
-- RLS is per user, like `tracker` and the curation tables: a user reads only their own rows. Only
-- the sync (service role, which bypasses RLS) writes postings and the log.
-- Never applied before #387, so `watched_companies` and `skips` were taken out in place: the blob
-- is the one source of truth.

-- ---- postings: every posting the sync read, scored ----
create table if not exists public.postings (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references auth.users on delete cascade,
  track_slug       text not null,
  source           text not null
                   check (source in ('greenhouse', 'lever', 'ashby', 'workable', 'recruitee',
                                     'smartrecruiters', 'teamtailor', 'personio', 'jsearch',
                                     'adzuna', 'remotive', 'jobicy', 'hn', 'rss', 'manual')),
  source_id        text not null,
  -- `${kind}:${slug}` for a board (`lever.eu:` for Lever's EU host), the feed's id ('hn',
  -- 'remotive', 'jobicy', 'rss') otherwise: what a "missed sync" is counted against.
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

-- ---- a v11 blob's watched boards: the tiles under each "Watched companies" section ----
-- Read by the sync only (service role), for blobs older than v12 (Sources). plpgsql, so the body is
-- not checked against the curation tables when this file runs before their migration.
create or replace function public.watched_tile_urls()
returns table (user_id uuid, url text, name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
    select t.user_id, t.url, t.name
      from public.tiles t
      join public.groups g on g.id = t.group_id and g.user_id = t.user_id
      join public.categories c on c.id = g.category_id and c.user_id = t.user_id
     where lower(btrim(g.label)) = 'watched companies'
       and not g.archived
       and not c.archived
     order by t.user_id, t.sort_order, t.id;
end;
$$;

revoke all on function public.watched_tile_urls() from public, anon, authenticated;
grant execute on function public.watched_tile_urls() to service_role;

-- Keep the log to 90 days.
create extension if not exists pg_cron;
select cron.schedule(
  'sync-log-retention',
  '41 3 * * *',
  $$delete from public.sync_log where created_at < now() - interval '90 days'$$
);
