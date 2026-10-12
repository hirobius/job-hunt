// The feed's orchestration: run every source for a term in parallel, isolate failures (one broken
// board never blanks the feed), and turn each failure into a message that says WHICH source broke
// and what to do about it. Network goes through `FetchJson` so tests run on canned payloads.
import { boardLabel, boardsFromUrls, fetchBoard, type Board } from './sources/ats';
import { fetchHn } from './sources/hn';
import { FetchError, type FetchJson } from './sources/http';
import { fetchRemotive } from './sources/remotive';
import { SOURCE_LABEL, type Posting } from './types';

/** Politeness cap on watched company boards per fetch (each is one request, some are ~2–3 MB). */
export const MAX_BOARDS = 25;
/** Re-use a response for this long. Sources update a few times a day; Remotive asks API users to
 *  poll sparingly. In-memory only — board payloads are far too big for sessionStorage. */
export const CACHE_TTL_MS = 60 * 60 * 1000;

export function createFetchJson({
  fetchImpl = (u: string, init?: RequestInit) => fetch(u, init),
  now = Date.now,
  ttlMs = CACHE_TTL_MS,
}: {
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  now?: () => number;
  ttlMs?: number;
} = {}): FetchJson {
  const cache = new Map<string, { at: number; body: unknown }>();
  return async (url) => {
    const hit = cache.get(url);
    if (hit && now() - hit.at < ttlMs) return hit.body;
    let res: Response;
    try {
      res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    } catch {
      throw new FetchError(0, url);
    }
    if (!res.ok) throw new FetchError(res.status, url);
    const body: unknown = await res.json();
    cache.set(url, { at: now(), body });
    return body;
  };
}

/** The app's shared fetcher — one cache for the whole session. */
export const liveFetchJson = createFetchJson();

export function describeError(e: unknown, label: string, isBoard: boolean): string {
  if (!(e instanceof FetchError)) return `${label}: unexpected response.`;
  if (e.status === 404 && isBoard)
    return `${label}: board not found — check the tile URL (the company may have moved to another ATS or closed its board).`;
  if (e.status === 429) return `${label}: rate-limited — try again in a few minutes.`;
  if (e.status === 0)
    return `${label}: couldn't connect — offline, or a privacy/ad blocker is blocking it.`;
  return `${label}: HTTP ${e.status} — the service is having trouble; try again later.`;
}

export interface SourceStatus {
  key: string;
  label: string;
  /** Postings the source returned before term matching. */
  fetched: number;
  error?: string;
}

export interface FeedResult {
  postings: Posting[];
  sources: SourceStatus[];
  /** Distinct watched boards beyond MAX_BOARDS that were not fetched. */
  boardsSkipped: number;
}

interface Job {
  key: string;
  label: string;
  board?: Board;
  run: () => Promise<Posting[]>;
}

export async function fetchFeed(
  req: { term: string; boardUrls: string[] },
  fetchJson: FetchJson = liveFetchJson,
): Promise<FeedResult> {
  const term = req.term.trim();
  if (!term) return { postings: [], sources: [], boardsSkipped: 0 };

  const allBoards = boardsFromUrls(req.boardUrls, Infinity);
  const boards = allBoards.slice(0, MAX_BOARDS);
  const jobs: Job[] = [
    { key: 'hn', label: SOURCE_LABEL.hn, run: () => fetchHn(term, fetchJson) },
    { key: 'remotive', label: SOURCE_LABEL.remotive, run: () => fetchRemotive(term, fetchJson) },
    ...boards.map((b) => ({
      key: `${b.kind}:${b.slug}`,
      label: `${boardLabel(b)} (${SOURCE_LABEL[b.kind]})`,
      board: b,
      run: () => fetchBoard(b, fetchJson),
    })),
  ];

  const settled = await Promise.allSettled(jobs.map((j) => j.run()));
  const postings: Posting[] = [];
  const sources = settled.map((r, i): SourceStatus => {
    const { key, label, board } = jobs[i];
    if (r.status === 'fulfilled') {
      // A posting's URL is rendered as a link — only ever an http(s) one (never `javascript:`).
      postings.push(...r.value.filter((p) => /^https?:\/\//i.test(p.url)));
      return { key, label, fetched: r.value.length };
    }
    return { key, label, fetched: 0, error: describeError(r.reason, label, !!board) };
  });
  return { postings, sources, boardsSkipped: allBoards.length - boards.length };
}
