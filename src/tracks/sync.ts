// The sync's pure half (Muse Phase 2): read every watched company and the RSS feed, then score
// and dedupe what came back. The edge function (supabase/functions/sync-postings) adds the
// database; scripts/dry-run-sync.ts runs the same two steps with no database. Ashby boards are
// read one at a time (their payloads are huge); Greenhouse and Lever a few at a time.
import { dedupe, fingerprint, type NormalizedPosting, type Verdict } from './score.ts';
import { scoreForTrack } from './scoreForTrack.ts';
import {
  fetchCompany,
  fetchDesignSystemsJobsFeed,
  webOnly,
  type WatchedCompany,
} from './sources.ts';
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

/** A shared board read as one watcher sees it: each board is read once, under its first
 *  watcher's row, so the postings carry that user's own `company` text. Every other watcher gets
 *  their own name back, never another user's (security review 2026-10-28). */
export function forWatcher<C extends WatchedCompany>(r: ReadOutcome, w: C): ReadOutcome<C> {
  return { ...r, company: w, postings: r.postings.map((p) => ({ ...p, company: w.company })) };
}

const PARALLEL = 4;

/** Rows per select: PostgREST answers at most 1000 rows to one request (its max_rows), the
 *  service role too, so a single select silently dropped every watched row past the first 1000. */
export const WATCHED_PAGE = 1000;
/** Boards read per user and track in one run (security review, 2026-10-27). Any signed-in user can
 *  insert watched rows, and each one is an outbound read the sync makes on their behalf; past this
 *  the newest rows wait. Far above a real list (a pack's boards + the Adele seed + verified). */
export const MAX_WATCHED_PER_TRACK = 500;

type Page<R> = (
  from: number,
  to: number,
) => PromiseLike<{ data: R[] | null; error: { message: string } | null }>;

/** Every enabled watched row, page by page (`page` must order by id), at most
 *  MAX_WATCHED_PER_TRACK per user and track (the oldest first). */
export async function readWatched<R extends { user_id: string; track_slug: string }>(
  page: Page<R>,
): Promise<{ rows: R[]; error: string | null }> {
  const rows: R[] = [];
  const per = new Map<string, number>();
  for (let from = 0; ; from += WATCHED_PAGE) {
    const { data, error } = await page(from, from + WATCHED_PAGE - 1);
    if (error) return { rows: [], error: error.message };
    for (const r of data ?? []) {
      const k = `${r.user_id}|${r.track_slug}`;
      const n = per.get(k) ?? 0;
      if (n >= MAX_WATCHED_PER_TRACK) continue;
      per.set(k, n + 1);
      rows.push(r);
    }
    if (!data || data.length < WATCHED_PAGE) return { rows, error: null };
  }
}

async function readOne<C extends WatchedCompany>(c: C, f: Fetch): Promise<ReadOutcome<C>> {
  let status: number | undefined;
  try {
    const postings = webOnly(await fetchCompany(c, f, (s) => (status = s)));
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
