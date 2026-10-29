// The sync's pure half (Muse Phase 2; Simplify 6/9, #387): read every followed board, the term
// feeds and the RSS feed, then score and dedupe what came back. The edge function
// (supabase/functions/sync-postings) adds the database; scripts/dry-run-sync.ts runs the same two
// steps with no database. Boards are read with the app's own parsers (src/feed/sources), so every
// board kind the browser reads, the server reads too. Ashby boards are read one at a time (their
// payloads are huge); the rest a few at a time.
import { fetchBoard } from '../feed/sources/ats.ts';
import { fetchHn } from '../feed/sources/hn.ts';
import { FetchError, type FetchJson } from '../feed/sources/http.ts';
import { fetchJobicy } from '../feed/sources/jobicy.ts';
import { fetchRemotive } from '../feed/sources/remotive.ts';
import type { Posting } from '../feed/types.ts';
import { dedupe, fingerprint, type NormalizedPosting, type Verdict } from './score.ts';
import { scoreForTrack } from './scoreForTrack.ts';
import { fetchDesignSystemsJobsFeed, webOnly, type WatchedCompany } from './sources.ts';
import type { TrackConfig } from './track-config.ts';

export type { WatchedCompany };

type Fetch = (url: string) => Promise<Response>;

/** The feeds searched by the profile's titles. */
export type TermFeed = 'hn' | 'remotive' | 'jobicy';
export const TERM_FEEDS: readonly TermFeed[] = ['hn', 'remotive', 'jobicy'];

/** One read: a followed board (`company` set), a term feed (`term` set) or the RSS feed. A read
 *  that failed (`ok` false) never closes a posting. */
export interface ReadOutcome<C extends WatchedCompany = WatchedCompany> {
  company: C | null;
  /** `${ats}:${slug}` (Lever EU: `lever.eu:${slug}`), a term feed's id, or 'rss'. */
  board: string;
  term?: string;
  ok: boolean;
  status?: number;
  error?: string;
  postings: NormalizedPosting[];
}

export const boardOf = (c: Pick<WatchedCompany, 'ats' | 'slug' | 'eu'>) =>
  `${c.ats === 'lever' && c.eu ? 'lever.eu' : c.ats}:${c.slug.toLowerCase()}`;

/** A shared board read as one watcher sees it: each board is read once, under its first
 *  watcher's row, so the postings carry that user's own `company` text. Every other watcher gets
 *  their own name back, never another user's (security review 2026-10-28). */
export function forWatcher<C extends WatchedCompany>(r: ReadOutcome, w: C): ReadOutcome<C> {
  return { ...r, company: w, postings: r.postings.map((p) => ({ ...p, company: w.company })) };
}

const PARALLEL = 4;

/** Sources the postings table's `source` check doesn't list (the sync never reads them; the
 *  browser's newer board kinds are scored as 'manual'). */
const NOT_STORED = new Set<Posting['source']>([
  'remoteok',
  'sam',
  'bamboohr',
  'rippling',
  'gem',
  'pinpoint',
  'breezy',
]);

/** A live Posting (src/feed) as the scorer reads it. The source id is the Posting's own id
 *  (`greenhouse:stripe:123`), so the browser and the server name a posting the same way. */
export function normalize(p: Posting): NormalizedPosting {
  return {
    source: NOT_STORED.has(p.source) ? 'manual' : (p.source as NormalizedPosting['source']),
    sourceId: p.id,
    title: p.title,
    company: p.company,
    location: p.location || undefined,
    // false when the source says on-site or hybrid, so the scan rotation's remote-only rule
    // (rotation.ts) can tell "not remote" from "doesn't say".
    remote: p.mode === 'remote' ? true : p.mode ? false : undefined,
    url: p.url,
    descriptionText: p.text,
    postedAt: p.postedAt,
  };
}

/** The feed parsers' fetch: JSON, or a FetchError carrying the status. */
const fetchJsonWith =
  (f: Fetch): FetchJson =>
  async (url) => {
    const r = await f(url);
    if (!r.ok) throw new FetchError(r.status, url);
    return r.json();
  };

async function readOne<C extends WatchedCompany>(c: C, f: Fetch): Promise<ReadOutcome<C>> {
  const board = boardOf(c);
  try {
    const found = await fetchBoard(
      { kind: c.ats, slug: c.slug, ...(c.eu && { eu: true }) },
      fetchJsonWith(f),
    );
    const postings = webOnly(found.map(normalize)).map((p) => ({ ...p, company: c.company }));
    return { company: c, board, ok: true, postings };
  } catch (e) {
    const status = e instanceof FetchError && e.status ? e.status : undefined;
    return { company: c, board, ok: false, status, error: String(e), postings: [] };
  }
}

const FEED_READERS: Record<TermFeed, (term: string, fj: FetchJson) => Promise<Posting[]>> = {
  hn: fetchHn,
  remotive: fetchRemotive,
  jobicy: fetchJobicy,
};

async function readFeed<C extends WatchedCompany>(
  feed: TermFeed,
  term: string,
  f: Fetch,
): Promise<ReadOutcome<C>> {
  try {
    const postings = webOnly((await FEED_READERS[feed](term, fetchJsonWith(f))).map(normalize));
    return { company: null, board: feed, term, ok: true, postings };
  } catch (e) {
    const status = e instanceof FetchError && e.status ? e.status : undefined;
    return { company: null, board: feed, term, ok: false, status, error: String(e), postings: [] };
  }
}

export async function readAll<C extends WatchedCompany>(
  companies: C[],
  o: { fetch: Fetch; rss: boolean; terms?: Partial<Record<TermFeed, string[]>> },
): Promise<ReadOutcome<C>[]> {
  const out: ReadOutcome<C>[] = [];
  const pooled = companies.filter((c) => c.ats !== 'ashby');
  for (let i = 0; i < pooled.length; i += PARALLEL)
    out.push(...(await Promise.all(pooled.slice(i, i + PARALLEL).map((c) => readOne(c, o.fetch)))));
  // Ashby, sequentially.
  for (const c of companies.filter((x) => x.ats === 'ashby')) out.push(await readOne(c, o.fetch));
  // Term feeds one request at a time: they are shared public APIs.
  for (const feed of TERM_FEEDS)
    for (const term of o.terms?.[feed] ?? []) out.push(await readFeed(feed, term, o.fetch));
  if (o.rss) {
    let status: number | undefined;
    try {
      const postings = webOnly(await fetchDesignSystemsJobsFeed(o.fetch, (s) => (status = s)));
      out.push({ company: null, board: 'rss', ok: status === undefined, status, postings });
    } catch (e) {
      out.push({ company: null, board: 'rss', ok: false, error: String(e), postings: [] });
    }
  }
  return out;
}

export interface ScoredPosting {
  posting: NormalizedPosting;
  board: string;
  score: number;
  verdict: Verdict;
  reasons: string[];
  matchedSignals: string[];
  fingerprint: string;
}

/** Dedupe by fingerprint (the ATS original over a copy, score.ts `dedupe`), then score each one
 *  (the fit rule after the scorer: no internships in the queue). */
export function scoreBatch(reads: ReadOutcome[], track: TrackConfig): ScoredPosting[] {
  const boardOfPosting = new Map<NormalizedPosting, string>();
  for (const r of reads) for (const p of r.postings) boardOfPosting.set(p, r.board);
  return dedupe([...boardOfPosting.keys()]).map((posting) => {
    const s = scoreForTrack(posting, track);
    return {
      posting,
      board: boardOfPosting.get(posting)!,
      ...s,
      fingerprint: fingerprint(posting),
    };
  });
}
