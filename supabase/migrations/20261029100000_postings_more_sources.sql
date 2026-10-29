-- The sync's own design-systems searches (src/tracks/feeds, 2026-10-29): TheirStack, Jooble and
-- Into Design Systems join the sources a posting may come from (Adzuna was already listed).
-- designsystems.jobs' whole catalog is stored as 'rss', like its feed. Safe to run twice.
alter table public.postings drop constraint if exists postings_source_check;
alter table public.postings add constraint postings_source_check
  check (source in ('greenhouse', 'lever', 'ashby', 'workable', 'recruitee',
                    'smartrecruiters', 'teamtailor', 'personio', 'jsearch',
                    'adzuna', 'theirstack', 'jooble', 'ids',
                    'remotive', 'jobicy', 'hn', 'rss', 'manual'));

-- designsystems.jobs rows the sync already holds, one per page (the row with the most text wins:
-- a rejected row is stored without its description), so its catalog read fetches only new pages.
-- Service role only.
create or replace function public.known_dsjobs_postings()
returns table (source_id text, title text, company text, location text, remote boolean,
               url text, description_text text, posted_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (p.source_id)
         p.source_id, p.title, p.company, p.location, p.remote, p.url, p.description_text,
         p.posted_at
    from public.postings p
   where p.source = 'rss'
   order by p.source_id, length(p.description_text) desc, p.last_seen_at desc
$$;

revoke all on function public.known_dsjobs_postings() from public, anon, authenticated;
