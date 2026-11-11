-- The sync reads all 13 board kinds (#576): BambooHR, Rippling, Gem, Pinpoint and Breezy HR join
-- the sources a posting may come from. Until now their rows were stored as 'manual', which the app
-- never shows (src/feed/postingReader.ts knows no 'manual'), so the server read them for nothing.
-- Apply this BEFORE deploying the sync-postings edge function that writes these sources, or every
-- row they find is refused by the check and the sync logs a failed write. Old 'manual' rows stay
-- valid (and age out as missed: their ids now arrive under the new source). Safe to run twice.
alter table public.postings drop constraint if exists postings_source_check;
alter table public.postings add constraint postings_source_check
  check (source in ('greenhouse', 'lever', 'ashby', 'workable', 'recruitee',
                    'smartrecruiters', 'teamtailor', 'personio',
                    'bamboohr', 'rippling', 'gem', 'pinpoint', 'breezy',
                    'jsearch', 'adzuna', 'theirstack', 'jooble', 'ids',
                    'arbeitnow', 'remoteok', 'wwr',
                    'remotive', 'jobicy', 'hn', 'rss', 'manual'));
