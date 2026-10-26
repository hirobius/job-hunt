-- client_errors abuse fix (job-hunt#285, Medium): the 20261020 migration let anyone holding the
-- public key insert unlimited rows directly (policy "anyone can report"); the 5-per-page cap in
-- src/errorReport.ts is client-side and trivially bypassed with curl. This closes the direct
-- path and replaces it with one capped door:
--
--   * `report_client_error(...)` — a security-definer function that counts the last minute's
--     reports globally and refuses past the cap, then inserts. The table's own checks (kind
--     list, field lengths) still apply to every insert it makes.
--   * The open insert policy is dropped, so a direct POST to /rest/v1/client_errors has no
--     policy to pass and is denied. After this migration the function is the ONLY insert path.
--
-- The client switched to the RPC endpoint in the same change (src/errorReport.ts supabaseSender
-- posts to /rest/v1/rpc/report_client_error). Apply order is forgiving: crash reports fail
-- silently by design, so a gap between this migration and the client deploy loses reports,
-- never app function. The 90-day retention cron from 20261020 is untouched.

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
set search_path = public
as $$
begin
  -- Global per-minute cap. Legit volume is near zero (at most 5 reports per page load, and only
  -- on a crash); 60/minute is far above any real burst and far below a flood.
  if (select count(*) from public.client_errors
        where created_at > now() - interval '1 minute') >= 60 then
    raise exception 'client error report rate limit exceeded' using errcode = 'P0001';
  end if;

  insert into public.client_errors (kind, message, stack, route, browser)
  values (p_kind, p_message, p_stack, coalesce(p_route, ''), coalesce(p_browser, ''));
end;
$$;

-- Callable by the public key (that is the point), by nobody else beyond it.
revoke all on function public.report_client_error(text, text, text, text, text) from public;
grant execute on function public.report_client_error(text, text, text, text, text)
  to anon, authenticated;

-- Close the direct insert path the function replaces.
drop policy if exists "anyone can report" on public.client_errors;
