// The Feed's PostingReader seam (simplify spec, design C): two adapters behind one call. The
// browser adapter reads every source live (fetchFeed); the server adapter (Simplify 6/9, #387)
// reads the signed-in user's `postings` rows, which the sync edge function scored from their
// Sources and Search profile. `readPostings` merges them: a union that keeps every browser posting
// as it is and adds the server's that the browser did not find (by id, then by link), so signed in
// is never fewer postings than the browser alone (the breadth guard's rule). The server failing,
// or its table not being there yet, reads as nothing extra.
import { dedupKey } from '../store';
import type { Verdict } from '../tracks/score.ts';
import { loadServerRows, type StoredPosting } from '../tracks/postings';
import type { FeedSourceId, Posting } from './types';

export interface PostingReader {
  read(): Promise<Posting[]>;
}

const SOURCES: Record<string, FeedSourceId> = {
  greenhouse: 'greenhouse',
  lever: 'lever',
  ashby: 'ashby',
  workable: 'workable',
  recruitee: 'recruitee',
  smartrecruiters: 'smartrecruiters',
  teamtailor: 'teamtailor',
  personio: 'personio',
  remotive: 'remotive',
  jobicy: 'jobicy',
  hn: 'hn',
  rss: 'rss',
  theirstack: 'theirstack',
  adzuna: 'adzuna',
  jooble: 'jooble',
  ids: 'ids',
  arbeitnow: 'arbeitnow',
  remoteok: 'remoteok',
  wwr: 'wwr',
};

/** A stored row as a Posting, with the server's score on it; null for a source the app has no
 *  name for. The sync stores a Posting's own id as source_id (`greenhouse:stripe:123`); the RSS
 *  feed's ids are its guids, so they get the `rss:` prefix here. */
export function postingFromRow(r: StoredPosting): Posting | null {
  const source = SOURCES[r.source];
  if (!source) return null;
  return {
    id: source === 'rss' ? `rss:${r.sourceId}` : r.sourceId,
    source,
    title: r.title,
    company: r.company,
    url: r.url,
    location: r.location,
    ...(r.remote && { mode: 'remote' as const }),
    postedAt: r.postedAt,
    // The body stays on the server: the row is scored already.
    text: '',
    trackScore: {
      score: r.score,
      verdict: r.verdict as Verdict,
      reasons: r.reasons,
      matchedSignals: [],
    },
  };
}

/** The server adapter: the user's open queued and review rows. */
export function serverReader(load: () => Promise<StoredPosting[]> = loadServerRows): PostingReader {
  return {
    read: async () => (await load()).map(postingFromRow).filter((p): p is Posting => p !== null),
  };
}

/** Every browser posting, then each server posting the browser did not find (same id, or the same
 *  link). Never fewer than `browser`, and never a posting twice. */
export function mergePostings(browser: Posting[], server: Posting[]): Posting[] {
  const ids = new Set(browser.map((p) => p.id));
  const links = new Set(browser.map((p) => dedupKey(p.url)));
  const out = [...browser];
  for (const p of server) {
    const link = dedupKey(p.url);
    if (ids.has(p.id) || links.has(link)) continue;
    ids.add(p.id);
    links.add(link);
    out.push(p);
  }
  return out;
}

/** Read both adapters at once (the server only when given: signed in) and merge them. The browser's
 *  failure is the caller's to show; the server's is only reported. */
export async function readPostings(adapters: {
  browser: PostingReader;
  server?: PostingReader | null;
}): Promise<{ postings: Posting[]; fromServer: number; serverError: string | null }> {
  const [browser, server] = await Promise.all([
    adapters.browser.read(),
    adapters.server
      ? adapters.server.read().then(
          (rows) => ({ rows, error: null }),
          (e: unknown) => ({ rows: [] as Posting[], error: String(e) }),
        )
      : Promise.resolve({ rows: [] as Posting[], error: null }),
  ]);
  const postings = mergePostings(browser, server.rows);
  return { postings, fromServer: postings.length - browser.length, serverError: server.error };
}
