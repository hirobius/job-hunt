// Aggregator liveness (#576 item 11): a posting found through a feed or an aggregator (TheirStack,
// Adzuna, Jooble, HN, Remotive…) used to close only once it had aged out, 30 days after it was last
// seen, so a dead role lingered. When its apply link is on a company board the sync can read
// (Greenhouse, Lever, Ashby: fixed API hosts, boardFetch.ts `guardedFetch`), the board itself says
// whether the job is still there. Pure apart from the fetch it is given: the edge function and the
// tests share it (`.ts` specifiers: Deno loads it too).
//   - A board that answers with a non-empty list and no longer holds the job: gone, but only when
//     the row's job was seen on that list at least once (`listedSeen`, postings.listed_seen_at,
//     #675): Ashby's isListed:false and Lever's unlisted jobs never show in the public list, so a
//     job never seen there is left to the 30-day age-out. A read that finds the job marks it
//     (`seen`). (#673: an
//     empty list is unknown, since no recorded fixture shows a kind answering 404, rather than [],
//     for a slug it does not know; a list whose ids do not have the kind's id format is unknown).
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
  /** postings.listed_seen_at is set: the job has been on its board's list at least once (#675). */
  listedSeen?: boolean;
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
    if (jobId && !UUID.test(jobId)) jobId = undefined;
  }
  return jobId
    ? // The slug keeps its case for the request (Ashby's may be case-sensitive, #673); boards are
      // grouped by its lowercase form only.
      { kind: b.kind as ProbeHostKind, slug: b.slug, jobId: jobId.toLowerCase() }
    : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Whether a job id has the format of `kind`'s ids (Greenhouse numbers, Lever / Ashby UUIDs). */
const idFits = (kind: ProbeHostKind, id: string) =>
  kind === 'greenhouse' ? /^\d+$/.test(id) : UUID.test(id);

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
    const ids = postings.map((p) => p.id.split(':').slice(2).join(':').toLowerCase());
    // An empty list could be a slug the kind does not know: unknown, never "every job gone".
    if (ids.length === 0) return { ok: false, error: `${kind} answered an empty job list` };
    // A list whose ids are not the kind's format (a changed answer): unknown too.
    if (!ids.every((id) => idFits(kind, id)))
      return { ok: false, error: `${kind} job ids not in the expected format` };
    return { ok: true, ids: new Set(ids) };
  } catch (e) {
    const status = e instanceof FetchError && e.status ? e.status : undefined;
    return { ok: false, status, error: String(e) };
  }
}

export interface LivenessResult {
  /** Row ids whose job the board no longer lists (or whose board is gone). */
  gone: string[];
  /** Row ids found on their board's list whose mark was not yet set: set listed_seen_at (#675). */
  seen: string[];
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
    { kind: ProbeHostKind; slug: string; rows: [string, string, boolean][] }
  >();
  for (const r of rows) {
    const j = jobOnBoard(r.url);
    if (!j) continue;
    const key = `${j.kind}:${j.slug.toLowerCase()}`;
    const g = byBoard.get(key) ?? { kind: j.kind, slug: j.slug, rows: [] };
    g.rows.push([r.id, j.jobId, !!r.listedSeen]);
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
  const seen: string[] = [];
  const failed: LivenessResult['failed'] = [];
  keys.forEach((k, i) => {
    const r = reads[i];
    const g = byBoard.get(k)!;
    if (r.ok && r.ids) {
      for (const [id, jobId, listedSeen] of g.rows) {
        if (!idFits(g.kind, jobId)) continue;
        if (r.ids.has(jobId)) {
          if (!listedSeen) seen.push(id);
        } else if (listedSeen) gone.push(id);
      }
    } else if (r.status === 404) {
      for (const [id] of g.rows) gone.push(id);
    } else failed.push({ board: k, status: r.status, error: r.error });
  });
  return { gone, seen, boards: keys.length, failed };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
