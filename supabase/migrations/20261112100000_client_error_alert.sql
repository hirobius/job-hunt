-- Client error spike alert (#598). The hourly Actions job (docs/ci/proposed-error-spike.yml,
-- scripts/error-spike.ts) asks how many crash reports came in a time window, to compare the hour
-- after a production deploy with the 7 days before it. It gets a COUNT only, never a row: the
-- reports stay readable only in the dashboard (#47).
--
-- The door is a token, stored as its sha256 in ops_alert_tokens, which nobody but the function
-- reads (the daily_pick_feeds pattern, 20261105100000). Adrian makes one (docs/ci/error-spike.md):
--   insert into public.ops_alert_tokens (token_hash, purpose)
--   values (encode(sha256(convert_to('<TOKEN>', 'UTF8')), 'hex'), 'client-errors');
-- and puts the same <TOKEN> in the ERROR_ALERT_TOKEN Actions secret.

create table if not exists public.ops_alert_tokens (
  token_hash  text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  purpose     text not null check (purpose in ('client-errors')),
  created_at  timestamptz not null default now()
);

alter table public.ops_alert_tokens enable row level security;
revoke all on public.ops_alert_tokens from public, anon, authenticated;

-- Reports in [p_from, p_to). The window is at most 31 days (the baseline is 7). Uses the
-- created_at index from 20261030100000.
create or replace function public.client_error_count(
  p_token text,
  p_from timestamptz,
  p_to timestamptz
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if p_token is null or char_length(p_token) not between 32 and 200
     or not exists (
       select 1 from public.ops_alert_tokens t
        where t.purpose = 'client-errors'
          and t.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     ) then
    raise exception 'bad alert token' using errcode = '28000';
  end if;
  if p_from is null or p_to is null or p_from >= p_to or p_to - p_from > interval '31 days' then
    raise exception 'give a window of up to 31 days' using errcode = '22023';
  end if;
  select count(*)::integer into n
    from public.client_errors e
   where e.created_at >= p_from and e.created_at < p_to;
  return n;
end;
$$;

revoke all on function public.client_error_count(text, timestamptz, timestamptz) from public;
grant execute on function public.client_error_count(text, timestamptz, timestamptz) to anon;
