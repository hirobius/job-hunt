-- Board suggestions (#576 item 5). On each feeds run the sync probes a few company names from the
-- feeds (HN, TheirStack, Adzuna, Jooble, ...) on Greenhouse, Lever and Ashby (src/tracks/boardSuggest.ts:
-- fixed hosts, slugs only, at most 72 reads a run) and stores each live board as a suggestion for
-- the users who saw that company. A suggestion is never followed by itself: Companies lists it and
-- the user follows it or dismisses it. Service role writes; users read and delete their own rows.
-- Do NOT apply before review. Safe to run twice.

create table if not exists public.board_suggestions (
  user_id     uuid not null references auth.users on delete cascade,
  kind        text not null check (kind in ('greenhouse', 'lever', 'ashby')),
  slug        text not null check (slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),
  company     text not null check (char_length(company) between 1 and 200),
  jobs        int not null default 0 check (jobs between 0 and 100000),
  found_at    timestamptz not null default now(),
  primary key (user_id, kind, slug)
);

alter table public.board_suggestions enable row level security;

drop policy if exists "read own rows" on public.board_suggestions;
create policy "read own rows" on public.board_suggestions
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "delete own rows" on public.board_suggestions;
create policy "delete own rows" on public.board_suggestions
  for delete to authenticated using (auth.uid() = user_id);

revoke all on public.board_suggestions from public, anon, authenticated;
grant select, delete on public.board_suggestions to authenticated;

-- At most 500 suggestions per user (#320's locked before-insert trigger, from
-- 20261030100100_user_table_caps.sql). A run adds a few dozen at most; the sweep below ages them out.
create index if not exists board_suggestions_found_idx on public.board_suggestions (found_at);
drop trigger if exists board_suggestions_row_cap on public.board_suggestions;
create trigger board_suggestions_row_cap before insert on public.board_suggestions
  for each row execute function public.cap_rows_per_user('500');

-- Names already asked, so a name is probed at most once every 30 days. Service role only.
create table if not exists public.board_probe_names (
  name_key    text primary key check (char_length(name_key) between 1 and 200),
  found       boolean not null,
  checked_at  timestamptz not null default now()
);
alter table public.board_probe_names enable row level security;
revoke all on public.board_probe_names from public, anon, authenticated;

-- Age-out, swept nightly (like client_errors): a suggestion nobody acted on goes after 60 days (a
-- board still live for a name still seen comes back on its next probe); a cached name after 90
-- (it is asked again after 30 anyway). A dismissed suggestion can come back the same way once its
-- name is asked again: Ignore the company to keep it out for good.
create extension if not exists pg_cron;
select cron.unschedule('board-suggestions-retention')
  where exists (select 1 from cron.job where jobname = 'board-suggestions-retention');
select cron.schedule(
  'board-suggestions-retention',
  '41 3 * * *',
  $$delete from public.board_suggestions where found_at < now() - interval '60 days';
    delete from public.board_probe_names where checked_at < now() - interval '90 days'$$
);

-- Delete my data erases the suggestions too (the 20261105 definition plus board_suggestions).
create or replace function public.delete_my_data(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or p_user is distinct from uid then
    raise exception 'not your account' using errcode = '42501';
  end if;
  -- Children first, so erasure never depends on the FK cascade.
  if to_regclass('public.skips') is not null then
    execute 'delete from public.skips where user_id = $1' using uid;
  end if;
  delete from public.board_suggestions where user_id = uid;
  delete from public.daily_picks where user_id = uid;
  delete from public.daily_pick_feeds where user_id = uid;
  delete from public.postings where user_id = uid;
  delete from public.sync_log where user_id = uid;
  if to_regclass('public.watched_companies') is not null then
    execute 'delete from public.watched_companies where user_id = $1' using uid;
  end if;
  delete from public.tiles where user_id = uid;
  delete from public.groups where user_id = uid;
  delete from public.categories where user_id = uid;
  delete from public.tracker where user_id = uid;
end;
$$;

revoke all on function public.delete_my_data(uuid) from public, anon;
grant execute on function public.delete_my_data(uuid) to authenticated;
