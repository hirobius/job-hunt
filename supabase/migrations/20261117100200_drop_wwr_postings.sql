-- We Work Remotely is no longer read by the sync (Adrian 2026-11-17): its API terms
-- (weworkremotely.com/api-terms-and-guidelines) say "Scraping, copying, saving, or storing our data
-- is strictly prohibited". This deletes the rows it stored. Safe to run twice; apply with or after
-- the sync-postings deploy that drops the WWR read (an older function would store them again).
delete from public.postings where source = 'wwr';
