-- Delete my data, server side (#393). The client used to delete table by table (cloudMessages.ts
-- DELETE_ORDER), which missed the scorer's tables: postings and sync_log have no user delete
-- policy, so erasure reported success and left rows (against the erasure line in legal.ts).
-- One security-definer call now removes every row of the caller in one transaction: all or none.
-- src/account/deleteMyData.test.ts fails if a `create table … user_id` is left out of it.
-- Until this is applied the app falls back to the per-table deletes (PGRST202).

create or replace function public.delete_my_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  -- Children first, so erasure never depends on the FK cascade.
  delete from public.skips where user_id = auth.uid();
  delete from public.postings where user_id = auth.uid();
  delete from public.sync_log where user_id = auth.uid();
  delete from public.watched_companies where user_id = auth.uid();
  delete from public.tiles where user_id = auth.uid();
  delete from public.groups where user_id = auth.uid();
  delete from public.categories where user_id = auth.uid();
  delete from public.tracker where user_id = auth.uid();
end;
$$;

revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;
