-- AI drafting (#232, ADR 0009): what each draft cost, so the server function (api/draft.ts) can
-- hold the monthly cap. Server-only: RLS is on with no policies, and the two functions run only
-- for service_role, so the browser's key can neither read nor write a row.
--
-- A draft first reserves its worst-case cost (ai_draft_reserve, under one transaction-level lock,
-- so two drafts at once can't both slip under the cap), then settles at the real cost
-- (ai_draft_settle). A reservation never settled (a timeout) keeps its worst case: the cap is
-- never under-counted. Months are UTC calendar months. Rows hold no text: user id, cost, tokens.

create table if not exists public.ai_draft_usage (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  status        text not null default 'reserved' check (status in ('reserved', 'done', 'failed')),
  cost_usd      numeric(10, 6) not null check (cost_usd >= 0),
  input_tokens  integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  model         text not null default '' check (char_length(model) <= 80)
);

create index if not exists ai_draft_usage_created_at on public.ai_draft_usage (created_at);
create index if not exists ai_draft_usage_user_month on public.ai_draft_usage (user_id, created_at);

alter table public.ai_draft_usage enable row level security;
-- No policies on purpose: only service_role (which bypasses RLS) touches this table.
revoke all on public.ai_draft_usage from anon, authenticated;

-- Reserve p_estimate USD for p_user this month. Returns {"status":"ok","id":…} or
-- {"status":"cap"} (everyone's total would pass p_cap) or {"status":"user_cap"}.
create or replace function public.ai_draft_reserve(
  p_user uuid,
  p_cap numeric,
  p_user_cap numeric,
  p_estimate numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  month_start timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  total numeric;
  mine numeric;
  new_id bigint;
begin
  if p_estimate is null or p_estimate < 0 or p_cap is null or p_user_cap is null then
    raise exception 'bad arguments';
  end if;
  -- One reservation at a time across every caller (released at commit).
  perform pg_advisory_xact_lock(hashtext('ai_draft_usage'));
  select coalesce(sum(cost_usd), 0) into total
    from public.ai_draft_usage where created_at >= month_start;
  if total + p_estimate > p_cap then
    return jsonb_build_object('status', 'cap');
  end if;
  select coalesce(sum(cost_usd), 0) into mine
    from public.ai_draft_usage where created_at >= month_start and user_id = p_user;
  if mine + p_estimate > p_user_cap then
    return jsonb_build_object('status', 'user_cap');
  end if;
  insert into public.ai_draft_usage (user_id, cost_usd) values (p_user, p_estimate)
    returning id into new_id;
  return jsonb_build_object('status', 'ok', 'id', new_id::text);
end;
$$;

-- Settle a reservation at what the call really cost. Only a 'reserved' row moves.
create or replace function public.ai_draft_settle(
  p_id bigint,
  p_cost numeric,
  p_status text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_model text
) returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_draft_usage
     set cost_usd = greatest(p_cost, 0),
         status = p_status,
         input_tokens = greatest(p_input_tokens, 0),
         output_tokens = greatest(p_output_tokens, 0),
         model = left(coalesce(p_model, ''), 80)
   where id = p_id and status = 'reserved';
$$;

revoke all on function public.ai_draft_reserve(uuid, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function public.ai_draft_settle(bigint, numeric, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.ai_draft_reserve(uuid, numeric, numeric, numeric) to service_role;
grant execute on function public.ai_draft_settle(bigint, numeric, text, integer, integer, text) to service_role;
