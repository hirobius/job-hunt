// The sync's pure half (Muse Phase 2): read every watched company and the RSS feed, then score
// and dedupe what came back. The edge function (supabase/functions/sync-postings) adds the
// database; scripts/dry-run-sync.ts runs the same two steps with no database. Ashby boards are
// read one at a time (their payloads are huge); Greenhouse and Lever a few at a time.
import { dedupe, fingerprint, type NormalizedPosting, type Verdict } from './score.ts';
import { scoreForTrack } from './scoreForTrack.ts';
import { fetchCompany, fetchDesignSystemsJobsFeed, type WatchedCompany } from './sources.ts';
import type { TrackConfig } from './track-config.ts';

type Fetch = (url: string) => Promise<Response>;

/** One read: a watched company's board (`company` set) or the RSS feed. A read that failed
 *  (`ok` false) never closes a posting; a 404 disables the company. */
export interface ReadOutcome<C extends WatchedCompany = WatchedCompany> {
  company: C | null;
  /** `${ats}:${slug}`, or 'rss'. */
  board: string;
  ok: boolean;
  status?: number;
  error?: string;
  postings: NormalizedPosting[];
}

export const boardOf = (c: WatchedCompany) => `${c.ats}:${c.slug.toLowerCase()}`;

const PARALLEL = 4;

async function readOne<C extends WatchedCompany>(c: C, f: Fetch): Promise<ReadOutcome<C>> {
  let status: number | undefined;
  try {
    const postings = await fetchCompany(c, f, (s) => (status = s));
    return { company: c, board: boardOf(c), ok: status === undefined, status, postings };
  } catch (e) {
    return { company: c, board: boardOf(c), ok: false, error: String(e), postings: [] };
  }
}

export async function readAll<C extends WatchedCompany>(
  companies: C[],
  o: { fetch: Fetch; rss: boolean },
): Promise<ReadOutcome<C>[]> {
  const out: ReadOutcome<C>[] = [];
  const pooled = companies.filter((c) => c.ats !== 'ashby');
  for (let i = 0; i < pooled.length; i += PARALLEL)
    out.push(...(await Promise.all(pooled.slice(i, i + PARALLEL).map((c) => readOne(c, o.fetch)))));
  // Ashby, sequentially.
  for (const c of companies.filter((x) => x.ats === 'ashby')) out.push(await readOne(c, o.fetch));
  if (o.rss) {
    let status: number | undefined;
    try {
      const postings = await fetchDesignSystemsJobsFeed(o.fetch, (s) => (status = s));
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
