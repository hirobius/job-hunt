// The feed's orchestration: run every source for a term in parallel, isolate failures (one broken
// board never blanks the feed), and turn each failure into a message that says WHICH source broke
// and what to do about it. Network goes through `FetchJson` so tests run on canned payloads.
import { boardLabel, boardsFromUrls, fetchBoard, type Board } from './sources/ats';
import { fetchHn } from './sources/hn';
import { fetchJobicy } from './sources/jobicy';
import { fetchRemoteOk } from './sources/remoteok';
import { FetchError, type FetchJson } from './sources/http';
import { fetchRemotive } from './sources/remotive';
import { SOURCE_LABEL, type Posting } from './types';

/** Per-source switch for the keyless aggregators we have not yet seen answer from a browser (no CORS
 *  proof from the build sandbox). On by default; turn one off here if its first deployed check
 *  shows it blocked. A failure is already isolated and named per source either way. */
export const SOURCE_ENABLED: Record<'jobicy' | 'remoteok', boolean> = {
  jobicy: true,
  remoteok: true,
};

/** Most company boards one search reads: the track's watched boards plus the starter directory
 *  (src/radar/directory.ts). Each is one request and some are ~2–3 MB. */
export const MAX_BOARDS = 100;
/** Boards read at once — polite to the ATSs and kind to a phone's connection. */
export const BOARD_CONCURRENCY = 6;
/** Re-use a response for this long. Sources update a few times a day. In-memory only — board
 *  payloads are far too big for browser storage. (Remotive has its own, stricter budget below.) */
export const CACHE_TTL_MS = 60 * 60 * 1000;

// ---- Remotive's request budget ----
// Remotive's API terms: "you only need to GET Remotive job data through this API a couple of times a
// day (we advise max. 4 times a day) … excessive requests will be blocked." Every browser running
// this app calls Remotive directly, so the budget is enforced per browser and persisted (a reload
// must not reset it): each term's parsed results are kept for 6 hours, and at most 4 network calls
// go out in any rolling 24 hours. Over budget, a term with no fresh-enough copy says so instead.
export const REMOTIVE_DAILY_MAX = 4;
export const REMOTIVE_TTL_MS = 6 * 60 * 60 * 1000;
export const FETCH_TIMEOUT_MS = 15_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const REMOTIVE_KEY = 'rjb_feed_remotive';
/** Bodies are trimmed before they are stored, to keep browser storage small. */
const STORED_TEXT_MAX = 4000;

/** The slice of browser storage the budget needs — injectable so tests run on a Map. */
export interface KeyValue {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export function memoryKv(): KeyValue {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
}

/** localStorage, or nothing at all where it is blocked (private mode, sandboxed previews). */
export function browserKv(): KeyValue {
  return {
    get: (k) => {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem(k, v);
      } catch {
        /* storage full or blocked — the budget then only lasts this page view */
      }
    },
  };
}

class RemotiveBudgetSpent extends Error {}

interface RemotiveState {
  calls: number[];
  terms: Record<string, { at: number; postings: Posting[] }>;
}

function readRemotive(kv: KeyValue): RemotiveState {
  try {
    const v = JSON.parse(kv.get(REMOTIVE_KEY) ?? '{}');
    return {
      calls: Array.isArray(v.calls) ? v.calls.filter((n: unknown) => typeof n === 'number') : [],
      terms: v.terms && typeof v.terms === 'object' ? v.terms : {},
    };
  } catch {
    return { calls: [], terms: {} };
  }
}

function writeRemotive(kv: KeyValue, state: RemotiveState) {
  kv.set(REMOTIVE_KEY, JSON.stringify(state));
}

async function remotiveWithinBudget(
  term: string,
  fetchJson: FetchJson,
  kv: KeyValue,
  now: number,
): Promise<Posting[]> {
  const key = term.toLowerCase();
  const state = readRemotive(kv);
  const cached = state.terms[key];
  if (cached && now - cached.at < REMOTIVE_TTL_MS) return cached.postings;

  const calls = state.calls.filter((at) => now - at < DAY_MS);
  if (calls.length >= REMOTIVE_DAILY_MAX) {
    // Over budget: a copy under a day old beats nothing.
    if (cached && now - cached.at < DAY_MS) return cached.postings;
    throw new RemotiveBudgetSpent();
  }
  // Count the call before making it — a failed request still reached Remotive.
  const terms = Object.fromEntries(
    Object.entries(state.terms).filter(([, v]) => now - v.at < DAY_MS),
  );
  writeRemotive(kv, { calls: [...calls, now], terms });
  const postings = await fetchRemotive(term, fetchJson);
  terms[key] = {
    at: now,
    postings: postings.map((p) => ({ ...p, text: p.text.slice(0, STORED_TEXT_MAX) })),
  };
  writeRemotive(kv, { calls: [...calls, now], terms });
  return postings;
}

export function createFetchJson({
  fetchImpl = (u: string, init?: RequestInit) => fetch(u, init),
  now = Date.now,
  ttlMs = CACHE_TTL_MS,
  timeoutMs = FETCH_TIMEOUT_MS,
}: {
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  now?: () => number;
  ttlMs?: number;
  timeoutMs?: number;
} = {}): FetchJson {
  const cache = new Map<string, { at: number; body: unknown }>();
  return async (url) => {
    const hit = cache.get(url);
    if (hit && now() - hit.at < ttlMs) return hit.body;
    let res: Response;
    try {
      const signal = AbortSignal.timeout(timeoutMs);
      res = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new FetchError(0, url, true);
      }
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
  if (e instanceof RemotiveBudgetSpent)
    return `${label}: daily limit reached — Remotive allows about ${REMOTIVE_DAILY_MAX} requests a day, so new terms load from it again tomorrow.`;
  if (!(e instanceof FetchError)) return `${label}: unexpected response.`;
  if (e.isTimeout) return `${label}: timed out — try again later.`;
  if (e.status === 404 && isBoard)
    return `${label}: board not found — check the tile URL (the company may have moved to another ATS or closed its board).`;
  if (e.status === 429) return `${label}: rate-limited — try again in a few minutes.`;
  if (e.status === 0)
    return `${label}: couldn't connect — offline, or a privacy/ad blocker is blocking it.`;
  return `${label}: HTTP ${e.status} — the service is having trouble; try again later.`;
}

/** Promise.allSettled over thunks, with `limited` tasks run at most BOARD_CONCURRENCY at a time.
 *  The rest (HN, Remotive) start at once. */
export async function settleAll<T>(
  thunks: (() => Promise<T>)[],
  limited: (i: number) => boolean,
): Promise<PromiseSettledResult<T>[]> {
  const out: PromiseSettledResult<T>[] = new Array(thunks.length);
  const run = async (i: number) => {
    try {
      out[i] = { status: 'fulfilled', value: await thunks[i]() };
    } catch (reason) {
      out[i] = { status: 'rejected', reason };
    }
  };
  const queue = thunks.map((_, i) => i).filter(limited);
  const worker = async () => {
    for (let i = queue.shift(); i !== undefined; i = queue.shift()) await run(i);
  };
  await Promise.all([
    ...thunks
      .map((_, i) => i)
      .filter((i) => !limited(i))
      .map(run),
    ...Array.from({ length: Math.min(BOARD_CONCURRENCY, queue.length) }, worker),
  ]);
  return out;
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
  /** Distinct company boards beyond MAX_BOARDS that were not fetched. */
  boardsSkipped: number;
}

/** One source to read for this search — the feed's unit of fetch work. */
interface SourceTask {
  key: string;
  label: string;
  board?: Board;
  run: () => Promise<Posting[]>;
}

export async function fetchFeed(
  req: { term: string; boardUrls: string[] },
  fetchJson: FetchJson = liveFetchJson,
  {
    kv = browserKv(),
    now = Date.now,
    sources: enabled = SOURCE_ENABLED,
  }: { kv?: KeyValue; now?: () => number; sources?: Partial<typeof SOURCE_ENABLED> } = {},
): Promise<FeedResult> {
  const term = req.term.trim();
  if (!term) return { postings: [], sources: [], boardsSkipped: 0 };

  const allBoards = boardsFromUrls(req.boardUrls, Infinity);
  const boards = allBoards.slice(0, MAX_BOARDS);
  const tasks: SourceTask[] = [
    { key: 'hn', label: SOURCE_LABEL.hn, run: () => fetchHn(term, fetchJson) },
    {
      key: 'remotive',
      label: SOURCE_LABEL.remotive,
      run: () => remotiveWithinBudget(term, fetchJson, kv, now()),
    },
    ...(enabled.jobicy
      ? [
          {
            key: 'jobicy',
            label: SOURCE_LABEL.jobicy,
            run: () => fetchJobicy(term, fetchJson),
          },
        ]
      : []),
    ...(enabled.remoteok
      ? [
          {
            key: 'remoteok',
            label: SOURCE_LABEL.remoteok,
            run: () => fetchRemoteOk(term, fetchJson),
          },
        ]
      : []),
    ...boards.map((b) => ({
      key: `${b.kind}:${b.slug}`,
      label: `${boardLabel(b)} (${SOURCE_LABEL[b.kind]})`,
      board: b,
      run: () => fetchBoard(b, fetchJson),
    })),
  ];

  const settled = await settleAll(
    tasks.map((t) => () => t.run()),
    (i) => !!tasks[i].board,
  );
  const postings: Posting[] = [];
  const sources = settled.map((r, i): SourceStatus => {
    const { key, label, board } = tasks[i];
    if (r.status === 'fulfilled') {
      // A posting's URL is rendered as a link — only ever an http(s) one (never `javascript:`).
      postings.push(...r.value.filter((p) => /^https?:\/\//i.test(p.url)));
      return { key, label, fetched: r.value.length };
    }
    return { key, label, fetched: 0, error: describeError(r.reason, label, !!board) };
  });
  return { postings, sources, boardsSkipped: allBoards.length - boards.length };
}
