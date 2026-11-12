// Aggregator liveness (#576 item 11): a posting found through a feed or an aggregator (TheirStack,
// Adzuna, Jooble, HN, Remotive…) used to close only once it had aged out, 30 days after it was last
// seen, so a dead role lingered. When its apply link is on a company board the sync can read
// (Greenhouse, Lever, Ashby: fixed API hosts, boardFetch.ts `guardedFetch`), the board itself says
// whether the job is still there. Pure apart from the fetch it is given: the edge function and the
// tests share it (`.ts` specifiers: Deno loads it too).
//   - A board that answers with its list and no longer holds the job: gone.
//   - A board that answers 404 (the board itself is gone): every job on it is gone.
//   - Anything else (a timeout, a 429/5xx after the one retry of retry.ts, a body that is not a
//     list, a link the rules cannot read a job id from): unknown, never gone.
// At most `maxBoards` boards a run, each read once however many rows point at it.
import { boardJobs, fetchBoard, parseBoardUrl } from '../feed/sources/ats.ts';
import { FetchError, type FetchJson } from '../feed/sources/http.ts';
import { guardedFetch, type ProbeHostKind } from './boardFetch.ts';
import { readWithRetry } from './retry.ts';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** The feeds whose rows are checked: every term feed and server search (company boards close as
 *  missed on their own reads; designsystems.jobs closes by its catalog). */
export const AGGREGATOR_BOARDS: readonly string[] = [
  'hn',
  'remotive',
  'jobicy',
  'arbeitnow',
  'remoteok',
  'wwr',
  'theirstack',
  'adzuna',
  'jooble',
  'ids',
];

/** Boards checked per run: each is one list read (Ashby's run ~0.9 MB). */
export const MAX_LIVENESS_BOARDS = 20;

/** The kinds checked: the three with one fixed API host each (boardFetch.ts HOSTS). */
const CHECKED: readonly ProbeHostKind[] = ['greenhouse', 'lever', 'ashby'];

export interface LivenessRow {
  id: string;
  url: string;
}

/** The board and job a link names, or null when it is not a checked board's job link. Lever's EU
 *  host is left out (its API host is not on the guard's list). */
export function jobOnBoard(
  url: string,
): { kind: ProbeHostKind; slug: string; jobId: string } | null {
  const b = parseBoardUrl(url);
  if (!b || b.eu || !(CHECKED as readonly string[]).includes(b.kind)) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const seg = u.pathname.split('/').filter(Boolean);
  let jobId: string | undefined;
  if (b.kind === 'greenhouse') {
    const i = seg.indexOf('jobs');
    jobId = (i >= 0 ? seg[i + 1] : undefined) ?? u.searchParams.get('gh_jid') ?? undefined;
    if (jobId && !/^\d+$/.test(jobId)) jobId = undefined;
  } else {
    // jobs.lever.co/<slug>/<uuid>[/apply], jobs.ashbyhq.com/<slug>/<uuid>[/application]
    jobId = seg[1];
    if (jobId && !/^[0-9a-f-]{8,}$/i.test(jobId)) jobId = undefined;
  }
  return jobId
    ? { kind: b.kind as ProbeHostKind, slug: b.slug.toLowerCase(), jobId: jobId.toLowerCase() }
    : null;
}

type BoardRead = { ok: boolean; status?: number; error?: string; ids?: Set<string> };

const fetchJsonWith =
  (f: Fetch): FetchJson =>
  async (url) => {
    const r = await f(url);
    if (!r.ok) throw new FetchError(r.status, url);
    return r.json();
  };

async function readBoardIds(kind: ProbeHostKind, slug: string, f: Fetch): Promise<BoardRead> {
  try {
    const fj = fetchJsonWith(guardedFetch(kind, f));
    const board = { kind, slug };
    // fetchBoard returns [] for a body with no list on these kinds: check the shape first, so a
    // changed answer is a failed read, never "every job gone".
    let body: unknown;
    const shaped: FetchJson = async (u) => {
      body = await fj(u);
      return body;
    };
    // Greenhouse's light list (no descriptions): ids are all a check needs.
    const postings = await fetchBoard(board, shaped, { light: true });
    if (!boardJobs(board, body)) return { ok: false, error: `${kind} answer had no job list` };
    // Posting ids are `<kind>:<slug>:<job id>` (ats.ts parsers).
    return {
      ok: true,
      ids: new Set(postings.map((p) => p.id.split(':').slice(2).join(':').toLowerCase())),
    };
  } catch (e) {
    const status = e instanceof FetchError && e.status ? e.status : undefined;
    return { ok: false, status, error: String(e) };
  }
}

export interface LivenessResult {
  /** Row ids whose job the board no longer lists (or whose board is gone). */
  gone: string[];
  /** Boards read this run, and the ones that failed (logged, closing nothing). */
  boards: number;
  failed: { board: string; status?: number; error?: string }[];
}

/** Checks `rows` against their boards, at most `maxBoards` boards, the boards picked in a
 *  `seed`-hashed order so successive runs walk different ones. */
export async function checkAggregatorLiveness(
  rows: readonly LivenessRow[],
  o: {
    fetch: Fetch;
    maxBoards?: number;
    seed?: string;
    wait?: (ms: number) => Promise<void>;
  },
): Promise<LivenessResult> {
  const byBoard = new Map<
    string,
    { kind: ProbeHostKind; slug: string; rows: [string, string][] }
  >();
  for (const r of rows) {
    const j = jobOnBoard(r.url);
    if (!j) continue;
    const key = `${j.kind}:${j.slug}`;
    const g = byBoard.get(key) ?? { kind: j.kind, slug: j.slug, rows: [] };
    g.rows.push([r.id, j.jobId]);
    byBoard.set(key, g);
  }
  const seed = o.seed ?? '';
  const keys = [...byBoard.keys()]
    .sort((a, b) => hash(seed + a) - hash(seed + b) || a.localeCompare(b))
    .slice(0, o.maxBoards ?? MAX_LIVENESS_BOARDS);
  const { reads } = await readWithRetry(
    keys,
    (ks) =>
      Promise.all(ks.map((k) => readBoardIds(byBoard.get(k)!.kind, byBoard.get(k)!.slug, o.fetch))),
    o.wait,
  );
  const gone: string[] = [];
  const failed: LivenessResult['failed'] = [];
  keys.forEach((k, i) => {
    const r = reads[i];
    const g = byBoard.get(k)!;
    if (r.ok && r.ids) {
      for (const [id, jobId] of g.rows) if (!r.ids.has(jobId)) gone.push(id);
    } else if (r.status === 404) {
      for (const [id] of g.rows) gone.push(id);
    } else failed.push({ board: k, status: r.status, error: r.error });
  });
  return { gone, boards: keys.length, failed };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
