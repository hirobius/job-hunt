-- RLS as code (job-hunt#285, follow-up to the 2026-10-22 pre-launch audit): until now the schema
-- and policies for `tracker`, `categories`, `groups` and `tiles` existed only as copy-paste SQL in
-- SUPABASE_SETUP.md (section 2) and docs/loop-queue.md (gate G1). The live DB was provisioned by
-- hand with exactly that SQL (2026-07-27), so this migration is a transcription, not a redesign:
-- every statement is idempotent, and applying it to the live DB is a no-op that proves repo and
-- DB agree. Deletes from the app (src/curation/sync.ts, curationStore.ts) rely on these policies
-- alone, which is why they belong in version control.
--
-- Shape for all four tables: RLS on, one policy, `auth.uid() = user_id`, no anon grants.
-- `tracker`'s policy has no role clause in the setup doc (it predates the curation tables, whose
-- policies are `to authenticated`); both forms are transcribed as documented, because
-- `auth.uid()` is null for anon either way, so anon gets nothing.

-- ---- tracker: one row per user holding their job list (SUPABASE_SETUP.md section 2) ----
create table if not exists public.tracker (
  user_id    uuid primary key references auth.users on delete cascade,
  data       jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.tracker enable row level security;

drop policy if exists "own rows only" on public.tracker;
create policy "own rows only" on public.tracker
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---- curation tables: categories -> groups -> tiles (docs/loop-queue.md G1, issue #31) ----
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  titles text[] not null default '{}',
  ats_roles text[] not null default '{}',
  seniority text, location text, tailor_role text,
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  label text not null, sort_order int not null default 0,
  archived boolean not null default false
);
create table if not exists public.tiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null, url text not null, meta text,
  sort_order int not null default 0
);

alter table public.categories enable row level security;
alter table public.groups enable row level security;
alter table public.tiles enable row level security;

drop policy if exists "own categories" on public.categories;
create policy "own categories" on public.categories for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own groups" on public.groups;
create policy "own groups" on public.groups for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own tiles" on public.tiles;
create policy "own tiles" on public.tiles for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
