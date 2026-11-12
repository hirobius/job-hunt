-- #675: aggregator liveness closes a feed row as "absent from its board's list" only once its job id
-- has been seen on that list at least once. Ashby (isListed:false) and Lever unlisted postings never
-- appear in the public list, so a live unlisted job would otherwise read as absent and close.
-- Set by sync-postings (service role) when a liveness read finds the id; null = never seen listed,
-- left to the 30-day age-out (a 404 for the whole board still closes). No RLS or grant change:
-- the table's existing policies cover the new column.
alter table public.postings add column if not exists listed_seen_at timestamptz;
