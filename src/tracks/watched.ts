// A watched company for the sync (Muse Phase 2) from a board link: the same rules as the app's
// parser (src/feed/sources/ats.ts parseBoardUrl) for the three boards the sync reads, Greenhouse,
// Lever (US host only: the sync reads api.lever.co) and Ashby. The seed migration
// (supabase/migrations/20261024_watched_companies_seed.sql) applies these rules in SQL; the tests
// hold the three in step. Pure, no app imports, so Deno and the dry-run script can load it.
import type { WatchedCompany } from './sources.ts';

const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function watchedFromUrl(raw: string, company?: string): WatchedCompany | null {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const seg = u.pathname.split('/').filter(Boolean);
  let ats: WatchedCompany['ats'] | null = null;
  let slug: string | null | undefined;
  if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') {
    ats = 'greenhouse';
    slug = seg[0] === 'embed' ? u.searchParams.get('for') : seg[0];
  } else if (host === 'boards-api.greenhouse.io') {
    const i = seg.indexOf('boards');
    ats = 'greenhouse';
    slug = i >= 0 ? seg[i + 1] : null;
  } else if (host === 'jobs.lever.co') {
    ats = 'lever';
    slug = seg[0];
  } else if (host === 'ashbyhq.com' || host.endsWith('.ashbyhq.com')) {
    ats = 'ashby';
    slug = seg[0];
  }
  if (!ats || !slug || !SLUG.test(slug)) return null;
  return { company: company?.trim() || slug, ats, slug };
}
