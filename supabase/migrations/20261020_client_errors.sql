-- Crash reports (#47): the app inserts a scrubbed report here when it breaks (src/errorReport.ts).
-- The public key can only INSERT: there is no select, update or delete policy, so reports are read
-- only in the Supabase dashboard. Rows carry no user id or email, are size-capped, and are deleted
-- after 90 days (the Privacy Policy says so).

create table if not exists public.client_errors (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind       text not null check (kind in ('render', 'error', 'rejection')),
  message    text not null check (char_length(message) <= 300),
  stack      text check (char_length(stack) <= 2000),
  route      text not null default '' check (char_length(route) <= 30),
  browser    text not null default '' check (char_length(browser) <= 40)
);

alter table public.client_errors enable row level security;

drop policy if exists "anyone can report" on public.client_errors;
create policy "anyone can report" on public.client_errors
  for insert to anon, authenticated
  with check (true);

-- Keep 90 days only, swept nightly.
create extension if not exists pg_cron;
select cron.schedule(
  'client-errors-retention',
  '17 3 * * *',
  $$delete from public.client_errors where created_at < now() - interval '90 days'$$
);
