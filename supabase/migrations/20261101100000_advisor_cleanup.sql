-- Supabase advisor cleanup (job-hunt#285 follow-up, 2026-11-01). No change to who can read what:
--   * duplicate owner policies left from hand setup ("own tracker", *_owner) are dropped, so each
--     table keeps the one policy 20261026100000 transcribed;
--   * every owner policy reads `(select auth.uid())`, evaluated once per query, not per row;
--   * duplicate indexes go; the composite same-user foreign keys and skips/sync_log get covering
--     indexes. Idempotent.

drop policy if exists "own tracker" on public.tracker;
drop policy if exists categories_owner on public.categories;
drop policy if exists groups_owner on public.groups;
drop policy if exists tiles_owner on public.tiles;

drop policy if exists "own rows only" on public.tracker;
create policy "own rows only" on public.tracker for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own categories" on public.categories;
create policy "own categories" on public.categories for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "own groups" on public.groups;
create policy "own groups" on public.groups for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "own tiles" on public.tiles;
create policy "own tiles" on public.tiles for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "read own rows" on public.postings;
create policy "read own rows" on public.postings for select
  using ((select auth.uid()) = user_id);
drop policy if exists "read own rows" on public.sync_log;
create policy "read own rows" on public.sync_log for select
  using ((select auth.uid()) = user_id);

do $$ begin
  if to_regclass('public.skips') is not null then
    drop policy if exists "read own rows" on public.skips;
    create policy "read own rows" on public.skips for select
      using ((select auth.uid()) = user_id);
    drop policy if exists "unskip own rows" on public.skips;
    create policy "unskip own rows" on public.skips for delete
      using ((select auth.uid()) = user_id);
    drop policy if exists "skip own postings" on public.skips;
    create policy "skip own postings" on public.skips for insert
      with check ((select auth.uid()) = user_id and exists (
        select 1 from public.postings p
        where p.id = skips.posting_id and p.user_id = (select auth.uid())));
    create index if not exists skips_posting_id_idx on public.skips (posting_id);
  end if;
  if to_regclass('public.watched_companies') is not null then
    drop policy if exists "own rows only" on public.watched_companies;
    create policy "own rows only" on public.watched_companies for all
      using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
end $$;

drop index if exists public.groups_category_idx;
drop index if exists public.groups_category_id_idx;
drop index if exists public.tiles_group_idx;
drop index if exists public.tiles_group_id_idx;
create index if not exists groups_category_user_idx on public.groups (category_id, user_id);
create index if not exists tiles_group_user_idx on public.tiles (group_id, user_id);
create index if not exists sync_log_user_id_idx on public.sync_log (user_id);
