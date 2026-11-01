-- The sync's keyless remote boards (src/tracks/feeds, 2026-10-29): Arbeitnow, Remote OK and We Work
-- Remotely join the sources a posting may come from. Without this, every row they find is refused
-- by the check and the sync logs a failed write. Safe to run twice.
alter table public.postings drop constraint if exists postings_source_check;
alter table public.postings add constraint postings_source_check
  check (source in ('greenhouse', 'lever', 'ashby', 'workable', 'recruitee',
                    'smartrecruiters', 'teamtailor', 'personio', 'jsearch',
                    'adzuna', 'theirstack', 'jooble', 'ids',
                    'arbeitnow', 'remoteok', 'wwr',
                    'remotive', 'jobicy', 'hn', 'rss', 'manual'));
