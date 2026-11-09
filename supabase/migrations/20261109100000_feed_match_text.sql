-- Trimmed text for the Feed's server read (#499, 2026-11-09). The browser read every queued and
-- review row with its full description (up to 20,000 characters each, ~1,000 rows): most of
-- that text is never looked at. The sync now stores `match_text` beside each kept row: the
-- description cut to what ranking reads (the first lines, and a window around each phrase the
-- scorer, the contract / founding signals and the profile's terms look for;
-- src/tracks/matchText.ts). Null when the full text is already short. `description_text` is
-- not changed (the sync's delta reads reuse it). Safe to run twice.

alter table public.postings
  add column if not exists match_text text;

-- The Feed's read: the caller's open queued and review rows, best score first then newest,
-- with the trimmed text in place of the full one (a row synced before this migration has no
-- match_text: its text is cut at 2,000 characters until the next sync writes one). Security
-- invoker, so the table's "read own rows" policy applies.
create or replace function public.feed_rows(p_limit int default 1000)
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
         coalesce(p.match_text, left(p.description_text, 2000)) as description_text, p.board
    from public.postings p
   where p.verdict in ('queue', 'review')
     and p.closed_at is null
   order by p.score desc, p.posted_at desc nulls last
   limit least(greatest(coalesce(p_limit, 1000), 1), 1000)
$$;

revoke all on function public.feed_rows(int) from public, anon;
grant execute on function public.feed_rows(int) to authenticated;
