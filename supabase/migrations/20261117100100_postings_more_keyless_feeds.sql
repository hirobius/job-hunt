-- More keyless server searches (docs/research/job-sources-2026-11.md): 4dayweek.io, RemoteJobs.org,
-- Get on Board, Open Source Design and Jobgether join the sources a posting may come from. Apply
-- this BEFORE deploying the sync-postings function that reads them, or every row they find is
-- refused by the check and the sync logs a failed write. Safe to run twice.
alter table public.postings drop constraint if exists postings_source_check;
alter table public.postings add constraint postings_source_check
  check (source in ('greenhouse', 'lever', 'ashby', 'workable', 'recruitee',
                    'smartrecruiters', 'teamtailor', 'personio',
                    'bamboohr', 'rippling', 'gem', 'pinpoint', 'breezy',
                    'jsearch', 'adzuna', 'theirstack', 'jooble', 'ids',
                    'arbeitnow', 'remoteok', 'wwr',
                    'fourdayweek', 'remotejobsorg', 'getonbrd', 'osdjobs', 'jobgether',
                    'remotive', 'jobicy', 'hn', 'rss', 'manual'));
