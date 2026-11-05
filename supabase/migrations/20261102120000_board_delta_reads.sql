-- Delta reads for Greenhouse boards (#448, 2026-11-02). A full board read downloads every
-- job's description (`?content=true`, ~1.1 MB a board measured); most jobs do not change
-- between syncs. The source's own last-changed stamp is stored with each row so the next
-- sync can compare it against the board's light list (no descriptions) and download only
-- the jobs whose stamp moved. Safe to run twice.

alter table public.postings
  add column if not exists source_updated_at timestamptz;

-- Greenhouse rows the sync already holds, one per job (any user's: the posting is public),
-- the one with the most text first. Only rows whose stored description is provably complete
-- are returned: the sync stores a rejected row without its text and truncates text at
-- 20,000 characters (sync-postings MAX_TEXT), so an empty or exactly-20,000-character text
-- can never be reused — the job is simply read again. Service role only.
create or replace function public.known_board_postings()
returns table (source_id text, title text, company text, location text, remote boolean,
               url text, description_text text, posted_at timestamptz,
               source_updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (p.source_id)
         p.source_id, p.title, p.company, p.location, p.remote, p.url, p.description_text,
         p.posted_at, p.source_updated_at
    from public.postings p
   where p.source = 'greenhouse'
     and length(p.description_text) between 1 and 19999
   order by p.source_id, length(p.description_text) desc, p.last_seen_at desc
$$;

revoke all on function public.known_board_postings() from public, anon, authenticated;
grant execute on function public.known_board_postings() to service_role;
