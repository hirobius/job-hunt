-- The sync reads all 13 board kinds (#576 item 1): BambooHR, Rippling, Gem, Pinpoint and Breezy HR
-- rows are stored under their own source names (they were stored as 'manual' before). Apply this
-- BEFORE deploying the sync-postings function from the same PR, or their writes fail the check.
-- Safe to run twice.
alter table public.postings drop constraint if exists postings_source_check;
alter table public.postings add constraint postings_source_check
  check (source in ('greenhouse', 'lever', 'ashby', 'workable', 'recruitee',
                    'smartrecruiters', 'teamtailor', 'personio',
                    'bamboohr', 'rippling', 'gem', 'pinpoint', 'breezy',
                    'jsearch', 'adzuna', 'theirstack', 'jooble', 'ids',
                    'arbeitnow', 'remoteok', 'wwr',
                    'remotive', 'jobicy', 'hn', 'rss', 'manual'));
