// The scored postings the sync stored (Muse Phase 1 UI, 2026-10-24; Simplify 6/9, #387): the
// signed-in user's own rows of `postings` (RLS), split into the queue (verdict 'queue', best score
// then newest) and Review, with the ones they skipped left out. A Skip is a Decided entry by
// posting fingerprint (src/decided.ts), never a server write. The same rows feed the Feed's
// server adapter (feed/postingReader.ts). Signed out there is nothing to read.
import { loadSupabase } from '../supabase';
import type { Verdict } from './score.ts';
import { byScoreThenNewest } from './scoreForTrack.ts';

export interface StoredPosting {
  id: number;
  trackSlug: string;
  /** The board kind or feed it came from ('greenhouse', 'hn', 'rss', …). */
  source: string;
  /** The Posting's own id (`greenhouse:stripe:123`); the guid for the RSS feed. */
  sourceId: string;
  company: string;
  title: string;
  location: string;
  remote?: boolean;
  url: string;
  postedAt?: string;
  score: number;
  verdict: Verdict;
  reasons: string[];
  fingerprint: string;
}

interface Row {
  id: number;
  track_slug: string;
  source: string;
  source_id: string;
  company: string | null;
  title: string;
  location: string | null;
  remote: boolean | null;
  url: string;
  posted_at: string | null;
  score: number;
  verdict: Verdict;
  reasons: unknown;
  fingerprint: string;
}

/** PostgREST's most rows to one request. */
const LIMIT = 1000;

export function fromRow(r: Row): StoredPosting {
  return {
    id: r.id,
    trackSlug: r.track_slug,
    source: r.source,
    sourceId: r.source_id,
    company: r.company ?? '',
    title: r.title,
    location: r.location ?? '',
    ...(r.remote !== null && r.remote !== undefined && { remote: r.remote }),
    url: r.url,
    postedAt: r.posted_at ?? undefined,
    score: r.score,
    verdict: r.verdict,
    reasons: Array.isArray(r.reasons) ? r.reasons.filter((x) => typeof x === 'string') : [],
    fingerprint: r.fingerprint,
  };
}

/** The queue (verdict 'queue') and Review, each best score first then newest, skips left out. */
export function splitQueue(
  rows: StoredPosting[],
  skipped: ReadonlySet<string>,
): { queue: StoredPosting[]; review: StoredPosting[] } {
  const open = rows.filter((r) => !skipped.has(r.fingerprint));
  return {
    queue: open.filter((r) => r.verdict === 'queue').sort(byScoreThenNewest),
    review: open.filter((r) => r.verdict === 'review').sort(byScoreThenNewest),
  };
}

/** The user's open queued and review postings, best first. Throws on an error (the table not
 *  there yet reads as one). */
export async function loadServerRows(): Promise<StoredPosting[]> {
  const db = await loadSupabase();
  const { data, error } = await db
    .from('postings')
    .select(
      'id, track_slug, source, source_id, company, title, location, remote, url, posted_at, score, verdict, reasons, fingerprint',
    )
    .in('verdict', ['queue', 'review'])
    .is('closed_at', null)
    .order('score', { ascending: false })
    .order('posted_at', { ascending: false, nullsFirst: false })
    .limit(LIMIT);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(fromRow);
}

/** The scored queue's read: the rows (skips are the caller's, from Decided). */
export async function loadScoredPostings(): Promise<{ rows: StoredPosting[] }> {
  return { rows: await loadServerRows() };
}

/** When the server sync last finished a pass for this user (#448: it runs every 15 minutes): the
 *  newest `run` row in their sync log, or null when there is none (or the table isn't there yet). */
export async function loadServerUpdatedAt(): Promise<string | null> {
  const db = await loadSupabase();
  const { data, error } = await db
    .from('sync_log')
    .select('created_at')
    .eq('kind', 'run')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) return null;
  const at = (data as { created_at?: string }[] | null)?.[0]?.created_at;
  return typeof at === 'string' ? at : null;
}
