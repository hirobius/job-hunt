-- Reuse unchanged rejected rows in the Greenhouse delta read (2026-11-15). A rejected row keeps
-- no description, so `known_board_postings` never returned it: every rejected job looked new, a
-- board had more than 25 "changed" jobs, and each run fell back to the full `?content=true` list
-- (2 to 3 MB a board). That was the CPU that stopped the sync (function log, 2026-11-14).
--
-- Each row now keeps the key of the rules that scored it (src/tracks/scoreKey.ts). A rejected row
-- with the same key, whose job has not moved on the board, is kept as seen with no download and
-- no new score. A changed profile or scorer gives another key, and every job is read again once.
--
-- Run BEFORE the function is deployed (the default order): the new function stores `score_key`
-- only when `known_reject_rows` answers, so the old function and the new one both work with it.
-- Empty search_path and schema-qualified names, as the other security definer functions (#487).

alter table public.postings add column if not exists score_key text;

-- The open rejected Greenhouse rows on these boards that carry a key and a stamp: what the delta
-- read may reuse. Ordered, so the caller can page (PostgREST answers at most 1000 rows a request).
create or replace function public.known_reject_rows(p_boards text[])
returns table (id bigint, user_id uuid, source_id text, title text, url text, location text,
               source_updated_at timestamptz, score_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.user_id, p.source_id, p.title, p.url, p.location, p.source_updated_at,
         p.score_key
    from public.postings p
   where p.source = 'greenhouse'
     and p.board = any (p_boards)
     and p.closed_at is null
     and p.verdict = 'reject'
     and p.score_key is not null
     and p.source_updated_at is not null
   order by p.id
$$;

-- Keep one user's unchanged rejected rows as seen in this run (so they never count as missed).
-- Returns how many it kept: the caller treats fewer than it asked for as a failed write.
create or replace function public.touch_reject_rows(
  p_user uuid, p_source_ids text[], p_seen timestamptz
) returns integer
language sql
security definer
set search_path = ''
as $$
  with upd as (
    update public.postings
       set last_seen_at = p_seen,
           missed_syncs = 0
     where user_id = p_user
       and source = 'greenhouse'
       and source_id = any (p_source_ids)
       and closed_at is null
       and verdict = 'reject'
    returning 1
  )
  select pg_catalog.count(*)::int from upd;
$$;

revoke all on function public.known_reject_rows(text[]) from public, anon, authenticated;
revoke all on function public.touch_reject_rows(uuid, text[], timestamptz)
  from public, anon, authenticated;
grant execute on function public.known_reject_rows(text[]) to service_role;
grant execute on function public.touch_reject_rows(uuid, text[], timestamptz) to service_role;
