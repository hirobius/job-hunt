// The feed's orchestration: run every source for a term in parallel, isolate failures (one broken
// board never blanks the feed), and turn each failure into a message that says WHICH source broke
// and what to do about it. Network goes through `FetchJson` so tests run on canned payloads.
import { boardLabel, boardsFromUrls, fetchBoard, type Board } from './sources/ats';
import { fetchHn } from './sources/hn';
import { fetchJobicy } from './sources/jobicy';
import { fetchRemoteOk } from './sources/remoteok';
import { FetchError, type FetchJson } from './sources/http';
import { fetchProxied, PROXIED_SOURCES, type ProxiedId } from './sources/proxied';
import { fetchRemotive } from './sources/remotive';
import { fetchSam, SourceMessageError, type SamRequest } from './sources/sam';
import { SOURCE_LABEL, type Posting } from './types';

/** Per-source switch for the keyless aggregators we have not yet seen answer from a browser (no CORS
 *  proof from the build sandbox). Turn one off here if its first deployed check shows it blocked.
 *  A failure is already isolated and named per source either way. Remote OK stays off until its
 *  API's own legal notice has been read from a network that reaches it and its terms are checked
 *  against this adapter (#178): an attribution source does not ship on a guess of its terms. */
export const SOURCE_ENABLED: Record<'jobicy' | 'remoteok' | ProxiedId, boolean> = {
  jobicy: true,
  remoteok: false,
  // Read through /api/boards (sources/proxied.ts). designsystems.jobs is verified live; We Work
  // Remotely's feed page invites any use with links back. The other three wait on their terms or
  // their feed being read live (each adapter's header says which).
  dsjobs: true,
  wwr: true,
  workingnomads: false,
  himalayas: false,
  authenticjobs: false,
};

/** Boards read at once — polite to the ATSs and kind to a phone's connection. There is no cap on
 *  how many boards a search reads (Adrian, 2026-10-15): every distinct watched board is read, this
 *  many at a time, and results appear as each one answers (see `onProgress`). */
export const BOARD_CONCURRENCY = 6;
/** Re-use a response for this long. Sources update a few times a day. In-memory only — board
 *  payloads are far too big for browser storage. (Remotive has its own, stricter budget below.) */
const CACHE_TTL_MS = 60 * 60 * 1000;

// ---- Remotive's request budget ----
// Remotive's API terms: "you only need to GET Remotive job data through this API a couple of times a
// day (we advise max. 4 times a day) … excessive requests will be blocked." Every browser running
// this app calls Remotive directly, so the budget is enforced per browser and persisted (a reload
// must not reset it): each term's parsed results are kept for 6 hours, and at most 4 network calls
// go out in any rolling 24 hours. Over budget, a term with no fresh-enough copy says so instead.
export const REMOTIVE_DAILY_MAX = 4;
const REMOTIVE_TTL_MS = 6 * 60 * 60 * 1000;
export const FETCH_TIMEOUT_MS = 15_000;
/** The whole of one source (a source can make several requests) gets this long, then it is marked
 *  failed and the rest carry on. Matches the per-request limit above. */
export const SOURCE_TIMEOUT_MS = 15_000;
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
  // Read again: a sweep's other terms counted their calls (and stored their copies) while this
  // one was in flight, and writing the snapshot from before the await would undo them.
  const after = readRemotive(kv);
  after.terms[key] = {
    at: now,
    postings: postings.map((p) => ({ ...p, text: p.text.slice(0, STORED_TEXT_MAX) })),
  };
  writeRemotive(kv, after);
  return postings;
}

/** The most raw JSON the session cache keeps, in characters (~16 MB). Board payloads run 2–3 MB
 *  each and a track can watch 100+ boards, so the cache holds the most recently used few and drops
 *  the rest rather than every body for an hour (#178 review). */
export const CACHE_BUDGET_CHARS = 16_000_000;

export function createFetchJson({
  fetchImpl = (u: string, init?: RequestInit) => fetch(u, init),
  now = Date.now,
  ttlMs = CACHE_TTL_MS,
  timeoutMs = FETCH_TIMEOUT_MS,
  budgetChars = CACHE_BUDGET_CHARS,
}: {
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  now?: () => number;
  ttlMs?: number;
  timeoutMs?: number;
  budgetChars?: number;
} = {}): FetchJson & { cachedChars: () => number } {
  // A Map keeps insertion order, so re-inserting on a hit makes its first key the least recently used.
  const cache = new Map<string, { at: number; body: unknown; size: number }>();
  let total = 0;
  const drop = (url: string) => {
    const e = cache.get(url);
    if (!e) return;
    total -= e.size;
    cache.delete(url);
  };
  const fetchJson = async (url: string, opts?: { fresh?: boolean }) => {
    const hit = cache.get(url);
    if (hit && !opts?.fresh && now() - hit.at < ttlMs) {
      cache.delete(url);
      cache.set(url, hit);
      return hit.body;
    }
    drop(url);
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
    const text = await res.text();
    const body: unknown = JSON.parse(text);
    if (text.length <= budgetChars) {
      drop(url); // a parallel read of the same url may have landed meanwhile
      cache.set(url, { at: now(), body, size: text.length });
      total += text.length;
      for (const key of cache.keys()) {
        if (total <= budgetChars) break;
        drop(key);
      }
    }
    return body;
  };
  return Object.assign(fetchJson, { cachedChars: () => total });
}

/** The app's shared fetcher — one cache for the whole session. */
export const liveFetchJson = createFetchJson();

export function describeError(e: unknown, label: string, isBoard: boolean): string {
  if (e instanceof RemotiveBudgetSpent)
    return `${label}: daily limit reached — Remotive allows about ${REMOTIVE_DAILY_MAX} requests a day, so new terms load from it again tomorrow.`;
  // The source's own words (the contracts function: "SAM_GOV_API_KEY is not set: …").
  if (e instanceof SourceMessageError) return `${label}: ${e.message}`;
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
  onSettled?: (i: number, result: PromiseSettledResult<T>) => void,
): Promise<PromiseSettledResult<T>[]> {
  const out: PromiseSettledResult<T>[] = new Array(thunks.length);
  const run = async (i: number) => {
    try {
      out[i] = { status: 'fulfilled', value: await thunks[i]() };
    } catch (reason) {
      out[i] = { status: 'rejected', reason };
    }
    onSettled?.(i, out[i]);
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
}

/** A snapshot of the search so far: everything that has answered, plus how many boards have. */
export interface FeedProgress extends FeedResult {
  boardsDone: number;
  boardsTotal: number;
}

/** One source to read for this search — the feed's unit of fetch work. */
interface SourceTask {
  key: string;
  label: string;
  board?: Board;
  run: () => Promise<Posting[]>;
}

/** Reject with a timeout FetchError if `p` hasn't settled in `ms` (the source is then reported failed). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new FetchError(0, '', true)), ms);
  });
  return Promise.race([p, limit]).finally(() => clearTimeout(timer));
}

/** Turn one task's settled result into its status, pushing its postings (http(s) links only). */
function statusOf(
  task: SourceTask,
  r: PromiseSettledResult<Posting[]>,
  into: Posting[],
  /** Ids already in `into` (shared across one pass). */
  have: Set<string>,
): SourceStatus {
  const { key, label, board } = task;
  if (r.status === 'fulfilled') {
    // A posting's URL is rendered as a link — only ever an http(s) one (never `javascript:`).
    // A sweep can read one posting through two terms (an HN comment naming both): keep it once.
    for (const p of r.value) {
      if (!/^https?:\/\//i.test(p.url) || have.has(p.id)) continue;
      have.add(p.id);
      into.push(p);
    }
    return { key, label, fetched: r.value.length };
  }
  return { key, label, fetched: 0, error: describeError(r.reason, label, !!board) };
}

export async function fetchFeed(
  req: {
    /** One search term. A sweep passes `terms` instead. */
    term?: string;
    /** The wide sweep (#213): every term source runs once per term; boards are read once. */
    terms?: string[];
    boardUrls: string[];
    /** Called as each source answers, with everything gathered so far (in source order). */
    onProgress?: (p: FeedProgress) => void;
    /** Read only these sources (by `SourceStatus.key`) — "Retry" on a failed source. */
    only?: string[];
    /** A Contracts track (#275): SAM.gov by NAICS code replaces every term source, once per
     *  search (the term only filters what is shown). */
    contracts?: SamRequest;
  },
  fetchJson: FetchJson = liveFetchJson,
  {
    kv = browserKv(),
    now = Date.now,
    sources: enabled = SOURCE_ENABLED,
    sourceTimeoutMs = SOURCE_TIMEOUT_MS,
    readSam = (r) => fetchSam(r),
  }: {
    kv?: KeyValue;
    now?: () => number;
    sources?: Partial<typeof SOURCE_ENABLED>;
    sourceTimeoutMs?: number;
    /** The SAM.gov read (tests stub it). */
    readSam?: (req: SamRequest) => Promise<Posting[]>;
  } = {},
): Promise<FeedResult> {
  const seen = new Set<string>();
  const terms = (req.terms ?? [req.term ?? ''])
    .map((t) => t.trim())
    .filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
  const contracts = req.contracts;
  if (!terms.length && !contracts?.naics.length) return { postings: [], sources: [] };

  // One term keeps the plain keys ('hn'); a sweep names the term in each key and label.
  const many = terms.length > 1;
  const termTasks = (term: string): SourceTask[] => {
    const k = (key: string) => (many ? `${key}|${term}` : key);
    const l = (label: string) => (many ? `${label} · “${term}”` : label);
    return [
      { key: k('hn'), label: l(SOURCE_LABEL.hn), run: () => fetchHn(term, fetchJson) },
      {
        key: k('remotive'),
        label: l(SOURCE_LABEL.remotive),
        run: () => remotiveWithinBudget(term, fetchJson, kv, now()),
      },
      ...(enabled.jobicy
        ? [
            {
              key: k('jobicy'),
              label: l(SOURCE_LABEL.jobicy),
              run: () => fetchJobicy(term, fetchJson),
            },
          ]
        : []),
      ...(enabled.remoteok
        ? [
            {
              key: k('remoteok'),
              label: l(SOURCE_LABEL.remoteok),
              run: () => fetchRemoteOk(term, fetchJson),
            },
          ]
        : []),
      ...PROXIED_SOURCES.filter((id) => enabled[id]).map((id) => ({
        key: k(id),
        label: l(SOURCE_LABEL[id]),
        run: () => fetchProxied(id, term, fetchJson),
      })),
    ];
  };

  const boards = boardsFromUrls(req.boardUrls, Infinity);
  const all: SourceTask[] = [
    ...(contracts
      ? contracts.naics.length
        ? [{ key: 'sam', label: SOURCE_LABEL.sam, run: () => readSam(contracts) }]
        : []
      : terms.flatMap(termTasks)),
    ...boards.map((b) => ({
      key: `${b.kind}:${b.slug}`,
      label: `${boardLabel(b)} (${SOURCE_LABEL[b.kind]})`,
      board: b,
      run: () => fetchBoard(b, fetchJson),
    })),
  ];
  const tasks = req.only ? all.filter((t) => req.only!.includes(t.key)) : all;
  const boardsRead = tasks.filter((t) => t.board).length;

  const results: (PromiseSettledResult<Posting[]> | undefined)[] = new Array(tasks.length);
  const snapshot = (): FeedProgress => {
    const postings: Posting[] = [];
    const sources: SourceStatus[] = [];
    const have = new Set<string>();
    tasks.forEach((t, i) => {
      const r = results[i];
      if (r) sources.push(statusOf(t, r, postings, have));
    });
    return {
      postings,
      sources,
      boardsDone: tasks.filter((t, i) => t.board && results[i]).length,
      boardsTotal: boardsRead,
    };
  };
  const settled = await settleAll(
    tasks.map((t) => () => withTimeout(t.run(), sourceTimeoutMs)),
    (i) => !!tasks[i].board,
    (i, r) => {
      results[i] = r;
      req.onProgress?.(snapshot());
    },
  );
  const postings: Posting[] = [];
  const have = new Set<string>();
  const sources = settled.map((r, i) => statusOf(tasks[i], r, postings, have));
  return { postings, sources };
}
