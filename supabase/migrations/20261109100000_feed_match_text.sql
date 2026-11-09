-- Trimmed text for the Feed's server read (#499, 2026-11-09). The browser read every queued and
-- review row with its full description (up to 20,000 characters each, ~1,000 rows): most of
-- that text is never looked at. The sync now stores `match_text` beside each kept row: the
-- description cut to what ranking reads (the first lines, and a window around each phrase the
-- scorer, the contract / founding signals and the profile's terms look for;
-- src/tracks/matchText.ts), with the key it was cut for. Null when the full text is already
-- short. `description_text` is not changed (the sync's delta reads reuse it). Safe to run twice.

alter table public.postings
  add column if not exists match_text text,
  -- What the match text was cut for (matchText.ts `matchKey`: the profile's text terms, its
  -- scorer and the trim rules). Null with a null match_text.
  add column if not exists match_key text;

-- The Feed's read: the caller's open queued and review rows, best score first then newest. A row
-- carries its trimmed text only when it was cut for the caller's current terms (p_match_key):
-- a row synced before this migration (no match_text) or cut before a term was added (another
-- key) carries its full description, so the browser ranks it exactly as the full text.
-- Security invoker, so the table's "read own rows" policy applies.
create or replace function public.feed_rows(p_limit int default 1000, p_match_key text default null)
returns table (id bigint, track_slug text, source text, source_id text, company text,
               title text, location text, remote boolean, url text, posted_at timestamptz,
               score int, verdict text, reasons jsonb, fingerprint text,
               description_text text, board text)
language sql
stable
security invoker
set search_path = public
as $$
  select p.id, p.track_slug, p.source, p.source_id, p.company, p.title, p.location, p.remote,
         p.url, p.posted_at, p.score, p.verdict, p.reasons, p.fingerprint,
         case when p.match_text is not null and p.match_key = p_match_key
              then p.match_text else p.description_text end as description_text,
         p.board
    from public.postings p
   where p.verdict in ('queue', 'review')
     and p.closed_at is null
   order by p.score desc, p.posted_at desc nulls last
   limit least(greatest(coalesce(p_limit, 1000), 1), 1000)
$$;

revoke all on function public.feed_rows(int, text) from public, anon;
grant execute on function public.feed_rows(int, text) to authenticated;
