// The scored postings the sync stored (Muse Phase 1 UI, 2026-10-24): the signed-in user's own
// rows of `postings` (RLS), split into the queue (verdict 'queue', best score then newest) and
// Review, with the ones they skipped left out. A Skip writes the posting and the reasons it was
// queued for to `skips`, the tuning loop. Signed out there is nothing to read.
import { loadSupabase } from '../supabase';
import type { Verdict } from './score.ts';
import { byScoreThenNewest } from './scoreForTrack.ts';

export interface StoredPosting {
  id: number;
  trackSlug: string;
  company: string;
  title: string;
  location: string;
  url: string;
  postedAt?: string;
  score: number;
  verdict: Verdict;
  reasons: string[];
}

interface Row {
  id: number;
  track_slug: string;
  company: string | null;
  title: string;
  location: string | null;
  url: string;
  posted_at: string | null;
  score: number;
  verdict: Verdict;
  reasons: unknown;
}

const LIMIT = 300;

export function fromRow(r: Row): StoredPosting {
  return {
    id: r.id,
    trackSlug: r.track_slug,
    company: r.company ?? '',
    title: r.title,
    location: r.location ?? '',
    url: r.url,
    postedAt: r.posted_at ?? undefined,
    score: r.score,
    verdict: r.verdict,
    reasons: Array.isArray(r.reasons) ? r.reasons.filter((x) => typeof x === 'string') : [],
  };
}

/** The queue (verdict 'queue') and Review, each best score first then newest, skips left out. */
export function splitQueue(
  rows: StoredPosting[],
  skipped: ReadonlySet<number>,
): { queue: StoredPosting[]; review: StoredPosting[] } {
  const open = rows.filter((r) => !skipped.has(r.id));
  return {
    queue: open.filter((r) => r.verdict === 'queue').sort(byScoreThenNewest),
    review: open.filter((r) => r.verdict === 'review').sort(byScoreThenNewest),
  };
}

/** The user's open queued and review postings, and the ids they skipped. Throws on an error
 *  (the table not there yet reads as one). */
export async function loadScoredPostings(): Promise<{
  rows: StoredPosting[];
  skipped: Set<number>;
}> {
  const db = await loadSupabase();
  const [postings, skips] = await Promise.all([
    db
      .from('postings')
      .select('id, track_slug, company, title, location, url, posted_at, score, verdict, reasons')
      .in('verdict', ['queue', 'review'])
      .is('closed_at', null)
      .order('score', { ascending: false })
      .order('posted_at', { ascending: false, nullsFirst: false })
      .limit(LIMIT),
    db.from('skips').select('posting_id'),
  ]);
  if (postings.error) throw new Error(postings.error.message);
  if (skips.error) throw new Error(skips.error.message);
  return {
    rows: ((postings.data ?? []) as Row[]).map(fromRow),
    skipped: new Set(
      ((skips.data ?? []) as { posting_id: number | null }[])
        .map((s) => s.posting_id)
        .filter((id): id is number => typeof id === 'number'),
    ),
  };
}

/** Skip one: its id, verdict, score and the reasons it was listed for go to `skips`. */
export async function skipPosting(p: StoredPosting): Promise<void> {
  const db = await loadSupabase();
  const { error } = await db.from('skips').insert({
    posting_id: p.id,
    track_slug: p.trackSlug,
    verdict: p.verdict,
    score: p.score,
    reasons: p.reasons,
    title: p.title.slice(0, 500),
    company: p.company.slice(0, 200),
  });
  if (error) throw new Error(error.message);
}

/** Undo a Skip. */
export async function unskipPosting(id: number): Promise<void> {
  const db = await loadSupabase();
  const { error } = await db.from('skips').delete().eq('posting_id', id);
  if (error) throw new Error(error.message);
}
