// The feed's orchestration: run every source for a term in parallel, isolate failures (one broken
// board never blanks the feed), and turn each failure into a message that says WHICH source broke
// and what to do about it. Network goes through `FetchJson` so tests run on canned payloads.
import { boardLabel, boardsFromUrls, fetchBoard, type Board } from './sources/ats';
import { fetchBluesky } from './sources/bluesky';
import { fetchHn } from './sources/hn';
import { fetchJobicy } from './sources/jobicy';
import { fetchMastodon } from './sources/mastodon';
import { fetchRemoteOk } from './sources/remoteok';
import { FetchError, type FetchJson } from './sources/http';
import { fetchProxied } from './sources/proxied';
import { PROXIED_SEARCH, PROXIED_SOURCES } from './sources/proxiedIds';
import { fetchRemotive } from './sources/remotive';
import { SOURCE_LABEL, type Posting } from './types';
import { SOURCE_ENABLED } from './sourceEnabled';
import { lightBoards } from './lightBoards';
import { fillTexts } from './lightText';
import { passesInclude } from './include';
import { includeFields, type IncludeRule } from './mustInclude';

export { SOURCE_ENABLED };
/** The social sources: each a term source read like Jobicy, shown only when SOURCE_ENABLED. */
const SOCIAL = { bluesky: fetchBluesky, mastodon: fetchMastodon } as const;

/** Boards read at once — polite to the ATSs and kind to a phone's connection. There is no cap on
 *  how many boards a search reads (Adrian, 2026-10-15): every distinct watched board is read, this
 *  many at a time, and results appear as each one answers (see `onProgress`). */
export const BOARD_CONCURRENCY = 16;
/** At most this many board reads on one host at once (#448): what one ATS host already saw before
 *  BOARD_CONCURRENCY went up from 6, so mixed boards read faster and no host is asked harder. */
export const BOARD_PER_HOST = 6;
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

/** At most this many network reads at once through one fetcher (2026-11-07: on a phone, Review new
 *  and the scan together had far more in flight, and the main thread drowned in parsing). */
export const MAX_FETCHES_IN_FLIGHT = 6;

/** At most one progress snapshot this often while sources answer (the last one trails). */
export const SNAPSHOT_MS = 500;

export function createFetchJson({
  fetchImpl = (u: string, init?: RequestInit) => fetch(u, init),
  now = Date.now,
  ttlMs = CACHE_TTL_MS,
  timeoutMs = FETCH_TIMEOUT_MS,
  budgetChars = CACHE_BUDGET_CHARS,
  maxInFlight = MAX_FETCHES_IN_FLIGHT,
}: {
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  now?: () => number;
  ttlMs?: number;
  timeoutMs?: number;
  budgetChars?: number;
  maxInFlight?: number;
} = {}): FetchJson & {
  cachedChars: () => number;
  inFlight: () => number;
  clear: () => void;
} {
  // A plain semaphore: a read waits for a slot, so at most `maxInFlight` are on the network.
  let active = 0;
  const waiting: (() => void)[] = [];
  // Null when a slot is free now (taken at once, so the request starts in this same tick).
  // An aborted wait leaves the queue (it never takes a slot) and rejects.
  const slot = (signal?: AbortSignal): Promise<void> | null => {
    if (active < maxInFlight) {
      active++;
      return null;
    }
    return new Promise<void>((go, stop) => {
      const take = () => {
        signal?.removeEventListener('abort', give);
        go();
      };
      const give = () => {
        const i = waiting.indexOf(take);
        if (i >= 0) waiting.splice(i, 1);
        stop(new FetchError(0, '', true));
      };
      waiting.push(take);
      signal?.addEventListener('abort', give, { once: true });
    });
  };
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else active--;
  };
  // A Map keeps insertion order, so re-inserting on a hit makes its first key the least recently used.
  const cache = new Map<string, { at: number; body: unknown; size: number }>();
  let total = 0;
  const drop = (url: string) => {
    const e = cache.get(url);
    if (!e) return;
    total -= e.size;
    cache.delete(url);
  };
  // A read still in flight is shared (Today's Feed and the auto-scan read the same boards on open),
  // so a url is asked once; a fresh read (liveness) never waits on one.
  const pending = new Map<string, Promise<unknown>>();
  const fetchJson = (
    url: string,
    opts?: { fresh?: boolean; signal?: AbortSignal },
  ): Promise<unknown> => {
    if (opts?.signal?.aborted) return Promise.reject(new FetchError(0, url, true));
    const hit = cache.get(url);
    if (hit && !opts?.fresh && now() - hit.at < ttlMs) {
      cache.delete(url);
      cache.set(url, hit);
      return Promise.resolve(hit.body);
    }
    if (opts?.fresh) return read(url, opts.signal);
    const inFlight = pending.get(url);
    if (inFlight) return inFlight;
    // A read that can be given up is not shared: another caller must not lose it.
    if (opts?.signal) return read(url, opts.signal);
    const p = read(url).finally(() => pending.delete(url));
    pending.set(url, p);
    return p;
  };
  const read = async (url: string, given?: AbortSignal): Promise<unknown> => {
    drop(url);
    let res: Response;
    let text: string;
    const wait = slot(given);
    if (wait) await wait.catch(() => Promise.reject(new FetchError(0, url, true)));
    try {
      try {
        const timeout = AbortSignal.timeout(timeoutMs);
        const signal = given ? AbortSignal.any([timeout, given]) : timeout;
        res = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal });
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'TimeoutError') {
          throw new FetchError(0, url, true);
        }
        throw new FetchError(0, url);
      }
      if (!res.ok) throw new FetchError(res.status, url);
      text = await res.text();
    } finally {
      release();
    }
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
  return Object.assign(fetchJson, {
    cachedChars: () => total,
    inFlight: () => active,
    // Drop every cached body (a scan's end frees the parsed JSON it read; 2026-11-07).
    clear: () => {
      cache.clear();
      total = 0;
    },
  });
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
  onSettled?: (i: number, result: PromiseSettledResult<T>) => void,
  hostOf: (i: number) => string = () => '',
  /** The unlimited tasks start once every limited one has settled, not at once. */
  unlimitedLast = false,
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
  const busy = new Map<string, number>();
  let wake: (() => void)[] = [];
  // The next queued task whose host has room, else undefined (the worker waits for one to free).
  const take = (): number | undefined => {
    const at = queue.findIndex((i) => (busy.get(hostOf(i)) ?? 0) < BOARD_PER_HOST);
    return at < 0 ? undefined : queue.splice(at, 1)[0];
  };
  const worker = async (): Promise<void> => {
    while (queue.length) {
      const i = take();
      if (i === undefined) {
        await new Promise<void>((r) => wake.push(r));
        continue;
      }
      const h = hostOf(i);
      busy.set(h, (busy.get(h) ?? 0) + 1);
      await run(i);
      busy.set(h, busy.get(h)! - 1);
      const w = wake;
      wake = [];
      w.forEach((f) => f());
    }
  };
  const unlimited = () =>
    thunks
      .map((_, i) => i)
      .filter((i) => !limited(i))
      .map(run);
  const workers = () => Array.from({ length: Math.min(BOARD_CONCURRENCY, queue.length) }, worker);
  if (unlimitedLast) {
    await Promise.all(workers());
    await Promise.all(unlimited());
  } else await Promise.all([...unlimited(), ...workers()]);
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
  /** Work after the read that must never cost it (a phone's description reads): it runs outside
   *  the read's timeout, with its own deadline, and gives back what it has by then. */
  after?: (read: Posting[]) => Promise<Posting[]>;
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
    /** The profile's inclusion check. With one that reads titles only, a phone reads Greenhouse
     *  boards as plain lists and then reads the description of each posting it lets in (lightText.ts),
     *  so what can be listed ranks as a full read does. */
    include?: IncludeRule;
    /** The term feeds after the boards (FeedRequest `feedsLast`). */
    feedsLast?: boolean;
  },
  fetchJson: FetchJson = liveFetchJson,
  {
    kv = browserKv(),
    now = Date.now,
    sources: enabled = SOURCE_ENABLED,
    sourceTimeoutMs = SOURCE_TIMEOUT_MS,
  }: {
    kv?: KeyValue;
    now?: () => number;
    sources?: Partial<typeof SOURCE_ENABLED>;
    sourceTimeoutMs?: number;
  } = {},
): Promise<FeedResult> {
  const seen = new Set<string>();
  const terms = (req.terms ?? [req.term ?? ''])
    .map((t) => t.trim())
    .filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
  if (!terms.length) return { postings: [], sources: [] };

  const proxied = PROXIED_SOURCES.filter((id) => enabled[id]);
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
      ...proxied
        .filter((id) => PROXIED_SEARCH.has(id))
        .map((id) => ({
          key: k(id),
          label: l(SOURCE_LABEL[id]),
          run: () => fetchProxied(id, fetchJson, term),
        })),
      ...(Object.keys(SOCIAL) as (keyof typeof SOCIAL)[])
        .filter((id) => enabled[id])
        .map((id) => ({
          key: k(id),
          label: l(SOURCE_LABEL[id]),
          run: () => SOCIAL[id](term, fetchJson),
        })),
    ];
  };

  const boards = boardsFromUrls(req.boardUrls, Infinity);
  // A phone reads a Greenhouse board's plain list (lightBoards.ts) when the inclusion check reads
  // titles only, then the description of each posting that passes it.
  const include = req.include;
  const light = !!include && lightBoards() && !includeFields(include).text ? include : null;
  const readBoard = async (b: Board): Promise<Posting[]> => {
    if (!light || b.kind !== 'greenhouse') return fetchBoard(b, fetchJson);
    return fetchBoard(b, fetchJson, { light: true });
  };
  // Outside the list read's timeout (#498 review): a slow description read never loses the board.
  const fillBoard = (b: Board) =>
    light && b.kind === 'greenhouse'
      ? (list: Posting[]) =>
          fillTexts(list, fetchJson, (p) => passesInclude(light, p.title, ''), {
            deadlineMs: sourceTimeoutMs,
          })
      : undefined;
  const all: SourceTask[] = [
    ...terms.flatMap(termTasks),
    // A whole-feed board (designsystems.jobs, WWR) is read once per search, like a watched board,
    // and the term matching happens downstream for every term of a sweep.
    ...proxied
      .filter((id) => !PROXIED_SEARCH.has(id))
      .map((id) => ({
        key: id,
        label: SOURCE_LABEL[id],
        run: () => fetchProxied(id, fetchJson),
      })),
    ...boards.map((b) => ({
      key: `${b.kind}:${b.slug}`,
      label: `${boardLabel(b)} (${SOURCE_LABEL[b.kind]})`,
      board: b,
      run: () => readBoard(b),
      after: fillBoard(b),
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
  // A snapshot walks every posting read so far, so one per answer was quadratic over hundreds of
  // boards (2026-11-07 phone profile): at most one per SNAPSHOT_MS, the last one trailing.
  let lastSnap = -Infinity;
  let snapTimer: ReturnType<typeof setTimeout> | undefined;
  const progress = () => {
    if (!req.onProgress) return;
    const wait = lastSnap + SNAPSHOT_MS - Date.now();
    if (wait <= 0) {
      lastSnap = Date.now();
      req.onProgress(snapshot());
    } else
      snapTimer ??= setTimeout(() => {
        snapTimer = undefined;
        lastSnap = Date.now();
        req.onProgress?.(snapshot());
      }, wait);
  };
  let settled: PromiseSettledResult<Posting[]>[];
  try {
    settled = await settleAll(
      tasks.map((t) => async () => {
        const read = await withTimeout(t.run(), sourceTimeoutMs);
        return t.after ? t.after(read) : read;
      }),
      (i) => !!tasks[i].board,
      (i, r) => {
        results[i] = r;
        progress();
      },
      (i) => tasks[i].board?.kind ?? '',
      !!req.feedsLast,
    );
  } finally {
    // Never left running past the read, whatever ends it.
    clearTimeout(snapTimer);
  }
  // A trailing snapshot still due goes out now, so the last progress is the whole read.
  if (snapTimer !== undefined) {
    clearTimeout(snapTimer);
    snapTimer = undefined;
    req.onProgress?.(snapshot());
  }
  const postings: Posting[] = [];
  const have = new Set<string>();
  const sources = settled.map((r, i) => statusOf(tasks[i], r, postings, have));
  return { postings, sources };
}
