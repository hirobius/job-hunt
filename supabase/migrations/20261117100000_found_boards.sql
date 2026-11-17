-- Boards the ATS x-ray search found (src/tracks/feeds/xray.ts, #389 brought back on the server).
-- On the morning feeds run the sync asks a web search API (Brave Search, and Google Programmable
-- Search while its key lasts) for design-system roles on every ATS host it can read; each result
-- link that is a company board is stored here. The scan rotation reads these boards beside
-- src/feed/data/boards.json, so their postings reach every design-systems user. Shared data, no
-- user column: service role only. Only the board's kind and slug are kept, never the search answer.
-- Apply BEFORE deploying the sync-postings function that writes it (a missing table only logs).
-- Safe to run twice.

create table if not exists public.found_boards (
  kind        text not null check (kind in ('greenhouse', 'lever', 'ashby', 'workable', 'recruitee',
                                            'smartrecruiters', 'teamtailor', 'personio', 'bamboohr',
                                            'rippling', 'gem', 'pinpoint', 'breezy')),
  slug        text not null check (slug ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'),
  eu          boolean not null default false,
  company     text not null check (char_length(company) between 1 and 200),
  evidence    text not null default '' check (char_length(evidence) <= 300),
  found_at    timestamptz not null default now(),
  -- Refreshed each time a search finds the board again; the sweep drops a board not seen for 90 days.
  seen_at     timestamptz not null default now(),
  primary key (kind, slug, eu)
);

alter table public.found_boards enable row level security;
revoke all on public.found_boards from public, anon, authenticated;

create index if not exists found_boards_seen_idx on public.found_boards (seen_at);

create extension if not exists pg_cron;
select cron.unschedule('found-boards-retention')
  where exists (select 1 from cron.job where jobname = 'found-boards-retention');
select cron.schedule(
  'found-boards-retention',
  '47 3 * * *',
  $$delete from public.found_boards where seen_at < now() - interval '90 days'$$
);
