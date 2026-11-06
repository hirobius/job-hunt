-- Daily picks (2026-11-05). A scheduled Claude run hand-picks a few design-systems roles each
-- morning, with a one-line fit and a drafted note to the hiring manager. It used to publish them
-- as a separate page; now it adds them here and the app lists them on Today (src/picks.ts,
-- src/DailyPicks.tsx). Why its own table and not `postings`: postings are the sync's scored board
-- reads (closed when a board stops listing them or is no longer followed, service-role writes
-- only) and have no fit line, note, pay or employment; a pick is a dated, hand-made row that stays
-- until it is saved, skipped or ages out.
--
-- Who may write: only `add_daily_picks`, called with the public (publishable) key and a feed token.
-- The token is a long random string the account owner makes and gives to the scheduled run; only
-- its sha256 is stored, in `daily_pick_feeds`, which nobody but the function can read. A token adds
-- picks for its one account, at most 10 a call and 50 a day; it can't read, change or delete
-- anything. Users read their own picks (RLS) and write none directly.
--
-- Set up (once, SQL editor; the token never goes in the repo):
--   insert into public.daily_pick_feeds (token_hash, user_id)
--   select encode(sha256(convert_to('<TOKEN>', 'UTF8')), 'hex'), id
--     from auth.users where email = '<your sign-in email>';
-- Rotate: delete your own row (where user_id is your id, found by email) and insert a new one.
-- There is no bad-token throttle: a token is 256 random bits, so guessing one is not practical.
-- Safe to run twice.

-- ---- the picks ----
create table if not exists public.daily_picks (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users on delete cascade,
  picked_on   date not null default current_date,
  company     text not null default '' check (char_length(company) <= 200),
  title       text not null check (char_length(title) between 1 and 300),
  employment  text not null default 'unknown'
              check (employment in ('employee', 'contract', 'unknown')),
  pay         text not null default '' check (char_length(pay) <= 120),
  posted_on   date,
  url         text not null check (char_length(url) <= 2000 and url ~* '^https?://'),
  why         text not null default '' check (char_length(why) <= 500),
  note        text not null default '' check (char_length(note) <= 2000),
  created_at  timestamptz not null default now(),
  -- A posting is picked once: a later run's repeat is dropped.
  unique (user_id, url)
);

create index if not exists daily_picks_day_idx on public.daily_picks (user_id, picked_on desc);

alter table public.daily_picks enable row level security;

drop policy if exists "read own rows" on public.daily_picks;
create policy "read own rows" on public.daily_picks
  for select
  using (auth.uid() = user_id);

-- Readers get select only (RLS keeps it to their own rows). Revoking all also takes back Supabase's
-- default TRUNCATE / REFERENCES / TRIGGER grants on new tables.
revoke all on public.daily_picks from public, anon, authenticated;
grant select on public.daily_picks to authenticated;

-- ---- feed tokens: one per account, stored as a hash ----
create table if not exists public.daily_pick_feeds (
  token_hash  text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id     uuid not null unique references auth.users on delete cascade,
  created_at  timestamptz not null default now()
);

alter table public.daily_pick_feeds enable row level security;
revoke all on public.daily_pick_feeds from public, anon, authenticated;

-- ---- a date cast that never aborts the batch ----
-- '2026-02-31' or 'soon' gives null instead of an error, so one bad pick never stops the rest.
create or replace function public.daily_picks_try_date(p text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return p::date;
exception when others then
  return null;
end;
$$;

revoke all on function public.daily_picks_try_date(text) from public, anon, authenticated;

-- ---- the one way in ----
-- p_picks: [{ company, title, employment ('employee' | 'contract'), pay, posted_on (YYYY-MM-DD),
-- url, why, note, picked_on (YYYY-MM-DD, default today) }]. A pick with no title or no http(s)
-- link is skipped; a link already picked for the account is skipped. Returns how many were added.
-- Dates: a bad one is dropped (posted_on) or read as today (picked_on), never an error. picked_on
-- outside the last 7 days is today; posted_on after today is today.
create or replace function public.add_daily_picks(p_token text, p_picks jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  added integer;
begin
  if p_token is null or char_length(p_token) not between 32 and 200 then
    raise exception 'bad feed token' using errcode = '28000';
  end if;
  select f.user_id into uid
    from public.daily_pick_feeds f
   where f.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if uid is null then
    raise exception 'bad feed token' using errcode = '28000';
  end if;
  if p_picks is null or jsonb_typeof(p_picks) <> 'array'
     or jsonb_array_length(p_picks) = 0 or jsonb_array_length(p_picks) > 10 then
    raise exception 'send 1 to 10 picks' using errcode = '22023';
  end if;
  -- One call per account at a time, so two calls can't both pass the cap.
  perform pg_advisory_xact_lock(hashtext(uid::text));
  if (select count(*) from public.daily_picks d
       where d.user_id = uid and d.created_at > now() - interval '1 day')
     + jsonb_array_length(p_picks) > 50 then
    raise exception 'daily limit reached' using errcode = '54000';
  end if;

  with ins as (
    insert into public.daily_picks
      (user_id, picked_on, company, title, employment, pay, posted_on, url, why, note)
    select uid,
           case when public.daily_picks_try_date(p->>'picked_on')
                     between current_date - 7 and current_date
                then public.daily_picks_try_date(p->>'picked_on') else current_date end,
           left(btrim(coalesce(p->>'company', '')), 200),
           left(btrim(p->>'title'), 300),
           case when p->>'employment' in ('employee', 'contract')
                then p->>'employment' else 'unknown' end,
           left(btrim(coalesce(p->>'pay', '')), 120),
           -- not least(): it skips nulls, so a missing posted_on would read as today.
           case when public.daily_picks_try_date(p->>'posted_on') > current_date
                then current_date else public.daily_picks_try_date(p->>'posted_on') end,
           btrim(p->>'url'),
           left(btrim(coalesce(p->>'why', '')), 500),
           left(btrim(coalesce(p->>'note', '')), 2000)
      from jsonb_array_elements(p_picks) as p
     where jsonb_typeof(p) = 'object'
       and btrim(coalesce(p->>'title', '')) <> ''
       and btrim(coalesce(p->>'url', '')) ~* '^https?://'
       and char_length(btrim(p->>'url')) <= 2000
    on conflict (user_id, url) do nothing
    returning 1
  )
  select count(*)::int into added from ins;
  return added;
end;
$$;

revoke all on function public.add_daily_picks(text, jsonb) from public;
grant execute on function public.add_daily_picks(text, jsonb) to anon, authenticated;

-- Keep 60 days of picks, by the server's own created_at (a run can't set it).
create extension if not exists pg_cron;
select cron.schedule(
  'daily-picks-retention',
  '17 4 * * *',
  $$delete from public.daily_picks where created_at < now() - interval '60 days'$$
);

-- ---- Delete my data covers both new tables (#393; src/account/deleteMyData.test.ts) ----
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
