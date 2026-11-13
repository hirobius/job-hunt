-- Delete my data also deletes the sign-in (2026-11-13, legal gaps check). Until now it removed every
-- per-user table but left the auth.users row (the email address) with Supabase, and the privacy
-- policy asked people to email us for that. The function (owned by postgres, which may delete from
-- auth.users) now ends by deleting the caller's auth user. Every public table is cleared first, so
-- no row depends on the FK cascade from auth.users. The same body as 20261111100200 otherwise.
-- src/account/deleteMyData.test.ts pins the order: tables first, the auth user last.

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
  -- Last, the sign-in itself (2026-11-13): the auth user, with its identities, sessions and
  -- refresh tokens (auth's own cascades). Erasure then leaves nothing of the account behind.
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_data(uuid) from public, anon;
grant execute on function public.delete_my_data(uuid) to authenticated;
