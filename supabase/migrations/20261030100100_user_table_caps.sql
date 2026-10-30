-- Caps on what a signed-in user can write (#320, #391). Anyone can sign up, and the curation tables
-- (`categories` → `groups` → `tiles`, written by src/curation/sync.ts) had no limit on rows or text:
-- one account could store a 5 MB tile name, again and again. And `groups.category_id` /
-- `tiles.group_id` were plain foreign keys, so a row could hang under another account's parent
-- (the RLS check only reads user_id). This adds:
--   * length / size checks on every text and array column (far above anything the app writes:
--     labels and names are a line, urls one link, titles a handful of words);
--   * a per-user row ceiling, a before-insert trigger that takes a per-user lock before counting
--     (so two inserts in flight cannot both pass): 200 categories, 2,000 groups, 20,000 tiles (the
--     design-systems seed files a few hundred at once);
--   * composite foreign keys: a group's category, and a tile's group, must have the same user_id;
--   * the tracker blob cap measured by its text, not its compressed on-disk size (#391), so 8 MB
--     means 8 MB of JSON;
--   * leftovers of an earlier scorer draft the app no longer reads or writes (`skips`,
--     `watched_companies`, `board_from_url`): if a database still has them, the public key loses
--     access. delete_my_data (security definer) still clears them.
--
-- Apply note: the checks and keys validate existing rows. A failure names the constraint; the row
-- it found is the abuse it exists to stop. To look first:
--   select id from public.groups g where not exists
--     (select 1 from public.categories c where c.id = g.category_id and c.user_id = g.user_id);
--   select id from public.tiles t where not exists
--     (select 1 from public.groups g where g.id = t.group_id and g.user_id = t.user_id);
-- Safe to run twice. Run after 20261026100000_rls_policies_as_code.sql and 20261026100100.

-- ---- length and size checks ----
alter table public.categories drop constraint if exists categories_label_len;
alter table public.categories add constraint categories_label_len
  check (char_length(label) <= 200);
alter table public.categories drop constraint if exists categories_titles_size;
alter table public.categories add constraint categories_titles_size
  check (cardinality(titles) <= 200 and char_length(array_to_string(titles, '')) <= 20000);
alter table public.categories drop constraint if exists categories_ats_roles_size;
alter table public.categories add constraint categories_ats_roles_size
  check (cardinality(ats_roles) <= 200 and char_length(array_to_string(ats_roles, '')) <= 20000);
alter table public.categories drop constraint if exists categories_fields_len;
alter table public.categories add constraint categories_fields_len
  check (char_length(coalesce(seniority, '')) <= 200
     and char_length(coalesce(location, '')) <= 200
     and char_length(coalesce(tailor_role, '')) <= 200);

alter table public.groups drop constraint if exists groups_label_len;
alter table public.groups add constraint groups_label_len
  check (char_length(label) <= 200);

alter table public.tiles drop constraint if exists tiles_name_len;
alter table public.tiles add constraint tiles_name_len
  check (char_length(name) <= 500);
alter table public.tiles drop constraint if exists tiles_url_len;
alter table public.tiles add constraint tiles_url_len
  check (char_length(url) <= 4096);
alter table public.tiles drop constraint if exists tiles_meta_len;
alter table public.tiles add constraint tiles_meta_len
  check (char_length(coalesce(meta, '')) <= 4000);

-- ---- tracker: 8 MB of JSON text (replaces the compressed-size check) ----
alter table public.tracker drop constraint if exists tracker_data_size_cap;
alter table public.tracker add constraint tracker_data_size_cap
  check (octet_length(data::text) < 8000000);

-- ---- same-user parents ----
-- The keys the foreign keys lean on go first on the way in and last on the way out, so a second
-- run drops the foreign keys before their keys. The old single-column keys stay (redundant).
alter table public.tiles drop constraint if exists tiles_group_same_user;
alter table public.groups drop constraint if exists groups_category_same_user;
alter table public.groups drop constraint if exists groups_id_user_key;
alter table public.categories drop constraint if exists categories_id_user_key;

alter table public.categories add constraint categories_id_user_key unique (id, user_id);
alter table public.groups add constraint groups_id_user_key unique (id, user_id);
alter table public.groups add constraint groups_category_same_user
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade;
alter table public.tiles add constraint tiles_group_same_user
  foreign key (group_id, user_id) references public.groups (id, user_id) on delete cascade;

-- ---- rows per user ----
-- The counts read user_id, so index it (the policies filter on it too).
create index if not exists categories_user_idx on public.categories (user_id);
create index if not exists groups_user_idx on public.groups (user_id);
create index if not exists tiles_user_idx on public.tiles (user_id);

create or replace function public.cap_rows_per_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cap int := tg_argv[0]::int;
  n   int;
begin
  -- One lock per (table, user): a second insert for the same user waits until this one commits.
  perform pg_advisory_xact_lock(hashtext(tg_table_name), hashtext(new.user_id::text));
  execute format('select count(*) from %I.%I where user_id = $1', tg_table_schema, tg_table_name)
    into n using new.user_id;
  if n >= cap then
    raise exception '% limit reached (% rows)', tg_table_name, cap using errcode = '54000';
  end if;
  return new;
end;
$$;

revoke all on function public.cap_rows_per_user() from public, anon, authenticated;

drop trigger if exists categories_row_cap on public.categories;
create trigger categories_row_cap before insert on public.categories
  for each row execute function public.cap_rows_per_user('200');
drop trigger if exists groups_row_cap on public.groups;
create trigger groups_row_cap before insert on public.groups
  for each row execute function public.cap_rows_per_user('2000');
drop trigger if exists tiles_row_cap on public.tiles;
create trigger tiles_row_cap before insert on public.tiles
  for each row execute function public.cap_rows_per_user('20000');

-- ---- leftovers no client uses ----
do $$
declare
  f regprocedure;
begin
  if to_regclass('public.skips') is not null then
    execute 'revoke all on public.skips from anon, authenticated';
  end if;
  if to_regclass('public.watched_companies') is not null then
    execute 'revoke all on public.watched_companies from anon, authenticated';
  end if;
  for f in
    select p.oid::regprocedure from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname = 'board_from_url'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;
