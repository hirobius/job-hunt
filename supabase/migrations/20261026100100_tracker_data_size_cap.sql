-- Blob size cap (job-hunt#285, Low): `tracker.data` holds a user's whole job list as one jsonb
-- blob. The app's 1 MB upload cap is client-side only, so anyone with the public key could store
-- an arbitrarily large blob in their row. Cap it in the database instead: 8 MB of *stored* size
-- (pg_column_size measures the on-disk, possibly compressed, size — generous headroom over any
-- real job list, far under anything abusive).
--
-- Apply note: adding the constraint validates existing rows. Every real row is a job list orders
-- of magnitude below the cap, so this passes on the live DB; if it ever failed, the failing row
-- is exactly the abuse this cap exists to stop.

alter table public.tracker drop constraint if exists tracker_data_size_cap;
alter table public.tracker add constraint tracker_data_size_cap
  check (pg_column_size(data) < 8000000);
