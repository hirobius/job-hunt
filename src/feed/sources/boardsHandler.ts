// The /api/boards function's whole behaviour (api/boards.ts only wires it in), tested here with a
// stubbed upstream. GET /api/boards?src=<id>[&q=<term>] reads that board's FIXED upstream URL(s)
// (the registry below; the caller never names a URL, so this is not an open proxy), parses them
// with the board's adapter and answers `{ postings }`.
// Politeness: one answer per source (and term, for a search source) is kept an hour in the
// instance, and the response carries an hour of shared CDN cache, so all users together read each
// board about hourly. Per caller: RATE_LIMIT upstream reads per window, then 429 (cache hits are
// free). Order: method → input → cache → rate limit → upstream. A partial upstream failure answers what did come back; a
// total one answers 502 with the board's name.
import { BRAND } from '../../brand';
import { authenticJobs } from './authenticjobs';
import { dsJobs } from './designsystemsjobs';
import { himalayas } from './himalayas';
import { isProxiedId, MAX_Q, type ProxiedId, type ProxiedSource } from './proxiedIds';
import { weWorkRemotely } from './weworkremotely';
import { workingNomads } from './workingnomads';
import { SOURCE_LABEL, type Posting } from '../types';

/** Every proxied board's adapter: one line each. */
export const BOARD_ADAPTERS: Record<ProxiedId, ProxiedSource> = {
  dsjobs: dsJobs,
  wwr: weWorkRemotely,
  workingnomads: workingNomads,
  himalayas,
  authenticjobs: authenticJobs,
};

export const CACHE_TTL_MS = 60 * 60 * 1000;
export const RATE_LIMIT = 60;
export const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_CALLERS = 2000;
const MAX_CACHED = 300;
const UPSTREAM_TIMEOUT_MS = 12_000;
/** Bigger upstream bodies are refused (a feed is tens of KB; a whole-list API a few MB). */
export const MAX_BODY_CHARS = 8_000_000;
/** Each posting's text is cut to this before it is sent (the matcher needs the start, not all). */
export const TEXT_MAX = 4000;
const MAX_QUERY = 200;

export interface BoardsHandlerDeps {
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  now?: () => number;
  adapters?: Record<ProxiedId, ProxiedSource>;
}

const json = (status: number, body: unknown, cache: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache,
      'X-Content-Type-Options': 'nosniff',
    },
  });
const fail = (status: number, error: string, extra: Record<string, string> = {}) => {
  const r = json(status, { error }, 'no-store');
  for (const [k, v] of Object.entries(extra)) r.headers.set(k, v);
  return r;
};

/** Vercel's x-real-ip only (a client can forge x-forwarded-for's first hop). */
const callerOf = (req: Request) => (req.headers.get('x-real-ip') || 'unknown').trim().slice(0, 64);

export function createBoardsHandler({
  fetchImpl = fetch,
  now = Date.now,
  adapters = BOARD_ADAPTERS,
}: BoardsHandlerDeps = {}) {
  const calls = new Map<string, number[]>();
  const cache = new Map<string, { at: number; postings: Posting[] }>();

  const limited = (caller: string, t: number): number | null => {
    const recent = (calls.get(caller) ?? []).filter((at) => t - at < RATE_WINDOW_MS);
    if (recent.length >= RATE_LIMIT) {
      calls.set(caller, recent);
      return Math.ceil((RATE_WINDOW_MS - (t - recent[0])) / 1000);
    }
    calls.delete(caller);
    calls.set(caller, [...recent, t]);
    while (calls.size > MAX_CALLERS) calls.delete(calls.keys().next().value as string);
    return null;
  };

  const readOne = async (a: ProxiedSource, url: string): Promise<Posting[]> => {
    const res = await fetchImpl(url, {
      headers: {
        Accept: 'application/rss+xml, application/xml, application/json;q=0.9, */*;q=0.5',
        'User-Agent': `${BRAND.name} job tracker`,
      },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Refuse a stated oversize body before reading it; the length check below catches the rest.
    if (Number(res.headers.get('content-length')) > MAX_BODY_CHARS) throw new Error('too big');
    const text = await res.text();
    if (text.length > MAX_BODY_CHARS) throw new Error('too big');
    return a.parse(text, url);
  };

  return async function handler(req: Request): Promise<Response> {
    if (req.method !== 'GET') return fail(405, 'Only GET is allowed.', { Allow: 'GET' });
    const t = now();
    const url = new URL(req.url);
    if (url.search.length > MAX_QUERY) return fail(400, 'The request is too long.');
    const src = url.searchParams.get('src') ?? '';
    if (!isProxiedId(src)) return fail(400, 'Unknown board.');
    const a = adapters[src];
    const q = a.search ? (url.searchParams.get('q') ?? '').trim().toLowerCase() : '';
    if (a.search && (!q || q.length > MAX_Q))
      return fail(400, `Give a search term of 1 to ${MAX_Q} characters.`);

    const key = `${src}|${q}`;
    const hit = cache.get(key);
    const shared = `public, max-age=0, s-maxage=${CACHE_TTL_MS / 1000}, stale-while-revalidate=600`;
    if (hit && t - hit.at < CACHE_TTL_MS) return json(200, { postings: hit.postings }, shared);

    // Only a read that reaches upstream counts against the caller: cache hits cost nothing.
    const wait = limited(callerOf(req), t);
    if (wait !== null)
      return fail(429, 'Too many board reads: try again in a few minutes.', {
        'Retry-After': String(wait),
      });
    const urls = a.upstream(q || undefined);
    const reads = await Promise.allSettled(urls.map((u) => readOne(a, u)));
    const ok = reads.filter(
      (r): r is PromiseFulfilledResult<Posting[]> => r.status === 'fulfilled',
    );
    if (urls.length && !ok.length)
      return fail(502, `${SOURCE_LABEL[src]} didn’t answer: try again later.`);
    const seen = new Set<string>();
    const postings: Posting[] = [];
    for (const p of ok.flatMap((r) => r.value)) {
      if (seen.has(p.id)) continue; // one job in two of a board's feeds (WWR's categories)
      seen.add(p.id);
      postings.push({ ...p, text: p.text.slice(0, TEXT_MAX) });
    }
    // Only a whole answer is kept and shared: a partial one is retried on the next request.
    const whole = ok.length === urls.length;
    if (whole) {
      cache.delete(key);
      cache.set(key, { at: t, postings });
      while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value as string);
    }
    // `partial` tells the browser to skip its own session cache next time (proxied.ts).
    return whole
      ? json(200, { postings }, shared)
      : json(200, { postings, partial: true }, 'no-store');
  };
}
