-- Seed watched_companies (Muse Phase 2, 2026-10-24) from what each user already watches: the
-- tiles in the "Watched companies" group of their Design Systems track, read as boards with the
-- app's rules (src/feed/sources/ats.ts parseBoardUrl; src/tracks/watched.ts is the same three in
-- TypeScript): Greenhouse (boards., job-boards., the embed's ?for=, boards-api.), Lever
-- (jobs.lever.co; the EU host is left out, the sync reads api.lever.co) and Ashby (*.ashbyhq.com).
-- Then the brief's verified companies for the same users. A board that 404s on the first sync
-- is disabled and logged by the sync, not here (Notion is not `notion` on Greenhouse).

create or replace function public.board_from_url(raw text)
returns table (ats text, slug text)
language plpgsql
immutable
set search_path = public
as $$
declare
  s    text := btrim(coalesce(raw, ''));
  m    text[];
  host text;
  segs text[];
  i    int;
  a    text;
  sl   text;
begin
  if s = '' then return; end if;
  if s !~* '^https?://' then s := 'https://' || s; end if;
  m := regexp_match(s, '^https?://(?:[^@/?#]*@)?([^/?#:]+)(?::[0-9]+)?([^?#]*)(\?[^#]*)?', 'i');
  if m is null then return; end if;
  host := lower(m[1]);
  segs := array_remove(string_to_array(coalesce(m[2], ''), '/'), '');
  if host in ('boards.greenhouse.io', 'job-boards.greenhouse.io') then
    a := 'greenhouse';
    sl := case when segs[1] = 'embed'
               then substring(coalesce(m[3], '') from '[?&]for=([^&]*)')
               else segs[1] end;
  elsif host = 'boards-api.greenhouse.io' then
    a := 'greenhouse';
    i := array_position(segs, 'boards');
    sl := case when i is null then null else segs[i + 1] end;
  elsif host = 'jobs.lever.co' then
    a := 'lever';
    sl := segs[1];
  elsif host = 'ashbyhq.com' or host like '%.ashbyhq.com' then
    a := 'ashby';
    sl := segs[1];
  end if;
  if a is null or sl is null or sl !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$' then return; end if;
  ats := a;
  slug := sl;
  return next;
end;
$$;

-- The users' Design Systems tracks (the pack's label, and the one it had before).
create temporary table ds_tracks as
  select c.id, c.user_id
    from public.categories c
   where lower(btrim(c.label)) in ('design systems', 'design systems / design eng')
     and not c.archived;

insert into public.watched_companies (user_id, track_slug, company, ats, slug)
select distinct on (t.user_id, b.ats, lower(b.slug))
       t.user_id,
       'design-systems',
       coalesce(nullif(btrim(t.name), ''), b.slug),
       b.ats,
       b.slug
  from public.tiles t
  join public.groups g on g.id = t.group_id and g.user_id = t.user_id
  join ds_tracks d on d.id = g.category_id and d.user_id = t.user_id
  cross join lateral public.board_from_url(t.url) b
 where lower(btrim(g.label)) = 'watched companies'
   and not g.archived
 order by t.user_id, b.ats, lower(b.slug), t.sort_order
on conflict (user_id, ats, slug) do nothing;

-- The verified list (src/tracks/verified.ts), for every user with a Design Systems track.
insert into public.watched_companies (user_id, track_slug, company, ats, slug)
select u.user_id, 'design-systems', v.company, v.ats, v.slug
  from (select distinct user_id from ds_tracks) u
 cross join (values
   ('Figma',    'greenhouse', 'figma'),
   ('Stripe',   'greenhouse', 'stripe'),
   ('Airbnb',   'greenhouse', 'airbnb'),
   ('Datadog',  'greenhouse', 'datadog'),
   ('GitLab',   'greenhouse', 'gitlab'),
   ('Palantir', 'lever',      'palantir'),
   ('OpenAI',   'ashby',      'openai'),
   ('Ramp',     'ashby',      'ramp')
 ) as v (company, ats, slug)
-- A slug already watched under other letter case counts as watched.
 where not exists (
   select 1 from public.watched_companies w
    where w.user_id = u.user_id and w.ats = v.ats and lower(w.slug) = v.slug
 )
on conflict (user_id, ats, slug) do nothing;

drop table ds_tracks;
