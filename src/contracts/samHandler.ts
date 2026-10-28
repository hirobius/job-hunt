// The /api/sam function's whole behaviour (api/sam.ts only wires in the env and the real fetch),
// so it is tested here with a stubbed SAM.gov. Order: method → rate limit → input → key → cache →
// SAM.gov. Every answer is JSON; the key never appears in one, in a log or in an error.
import {
  MAX_NAICS,
  NO_KEY_MESSAGE,
  POSTED_WITHIN_DAYS,
  isNaics,
  isStateCode,
  parseSamRecord,
  type SamOpportunity,
} from './sam';

export const SAM_SEARCH_URL = 'https://api.sam.gov/opportunities/v2/search';
/** Per caller (by IP): this many requests in the window, then 429. Best effort: the counts live in
 *  one function instance, which is enough to stop a loop or a casual script from spending the
 *  key's daily SAM.gov quota. */
export const RATE_LIMIT = 20;
export const RATE_WINDOW_MS = 10 * 60 * 1000;
/** A search's answer is reused this long (SAM.gov's free keys allow few requests a day). */
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
/** Bounded memory: the oldest entries go first. */
const MAX_CALLERS = 2000;
const MAX_CACHED = 200;
const UPSTREAM_TIMEOUT_MS = 12_000;
/** Results per NAICS code. */
const PAGE = 100;
const MAX_QUERY = 200;

export interface SamHandlerDeps {
  getKey: () => string | undefined;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  now?: () => number;
}

export interface SamAnswer {
  opportunities: SamOpportunity[];
}

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    },
  });
const fail = (status: number, error: string, extra?: Record<string, string>) =>
  json(status, { error }, extra);

/** MM/dd/yyyy in UTC (SAM.gov's date format). */
const samDate = (t: number) => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}/${d.getUTCFullYear()}`;
};

/** The caller's IP as Vercel's edge sets it (the first hop of x-forwarded-for). */
const callerOf = (req: Request) =>
  (req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown')
    .trim()
    .slice(0, 64);

/** What a SAM.gov failure means to the person reading the source row. */
function upstreamMessage(status: number): string {
  if (status === 401 || status === 403)
    return 'SAM.gov refused the API key: check SAM_GOV_API_KEY in Vercel → Settings → Environment Variables (a new key can take a day to work).';
  if (status === 429) return 'SAM.gov’s request limit for this key is used up: try again tomorrow.';
  if (status === 0) return 'SAM.gov didn’t answer in time: try again later.';
  return `SAM.gov is having trouble (HTTP ${status}): try again later.`;
}

class Upstream extends Error {
  constructor(readonly status: number) {
    super(`upstream ${status}`);
  }
}

export function createSamHandler({ getKey, fetchImpl = fetch, now = Date.now }: SamHandlerDeps) {
  const calls = new Map<string, number[]>();
  const cache = new Map<string, { at: number; body: SamAnswer }>();

  const limited = (caller: string, t: number): number | null => {
    const recent = (calls.get(caller) ?? []).filter((at) => t - at < RATE_WINDOW_MS);
    if (recent.length >= RATE_LIMIT) {
      calls.set(caller, recent);
      return Math.ceil((RATE_WINDOW_MS - (t - recent[0])) / 1000);
    }
    calls.delete(caller); // re-insert: the Map's first key is the least recent caller
    calls.set(caller, [...recent, t]);
    while (calls.size > MAX_CALLERS) calls.delete(calls.keys().next().value as string);
    return null;
  };

  const readOne = async (key: string, naics: string, state: string | undefined, t: number) => {
    const q = new URLSearchParams({
      postedFrom: samDate(t - POSTED_WITHIN_DAYS * 24 * 60 * 60 * 1000),
      postedTo: samDate(t),
      ncode: naics,
      limit: String(PAGE),
      offset: '0',
    });
    if (state) q.set('state', state);
    // The key goes last and only into this request; the URL is never logged or returned.
    q.set('api_key', key);
    let res: Response;
    try {
      res = await fetchImpl(`${SAM_SEARCH_URL}?${q}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch {
      throw new Upstream(0);
    }
    if (!res.ok) throw new Upstream(res.status);
    const body: unknown = await res.json().catch(() => null);
    const rows = (body as { opportunitiesData?: unknown } | null)?.opportunitiesData;
    if (!Array.isArray(rows)) throw new Upstream(502);
    return rows;
  };

  return async function handler(req: Request): Promise<Response> {
    if (req.method !== 'GET') return fail(405, 'Only GET is allowed.', { Allow: 'GET' });
    const t = now();
    const wait = limited(callerOf(req), t);
    if (wait !== null)
      return fail(429, 'Too many contract searches: try again in a few minutes.', {
        'Retry-After': String(wait),
      });

    const url = new URL(req.url);
    if (url.search.length > MAX_QUERY) return fail(400, 'The search is too long.');
    const raw = (url.searchParams.get('naics') ?? '').split(',').map((s) => s.trim());
    const naics = [...new Set(raw.filter(Boolean))];
    if (!naics.length || naics.length > MAX_NAICS || !naics.every(isNaics))
      return fail(400, `Give 1 to ${MAX_NAICS} NAICS codes of 2 to 6 digits, commas between.`);
    const stateParam = url.searchParams.get('state');
    const state = stateParam ? stateParam.toUpperCase() : undefined;
    if (state !== undefined && !isStateCode(state))
      return fail(400, 'State must be a two-letter US state code.');

    const key = getKey()?.trim();
    if (!key) return fail(503, NO_KEY_MESSAGE);

    const cacheKey = `${[...naics].sort().join(',')}|${state ?? ''}`;
    const hit = cache.get(cacheKey);
    if (hit && t - hit.at < CACHE_TTL_MS) return json(200, hit.body);

    let rows: unknown[][];
    try {
      rows = await Promise.all(naics.map((code) => readOne(key, code, state, t)));
    } catch (e) {
      return fail(502, upstreamMessage(e instanceof Upstream ? e.status : 502));
    }
    const today = new Date(t).toISOString().slice(0, 10);
    const seen = new Set<string>();
    const opportunities: SamOpportunity[] = [];
    for (const r of rows.flat()) {
      const o = parseSamRecord(r, today);
      if (!o || seen.has(o.id)) continue;
      seen.add(o.id);
      opportunities.push(o);
    }
    const body: SamAnswer = { opportunities };
    cache.delete(cacheKey);
    cache.set(cacheKey, { at: t, body });
    while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value as string);
    return json(200, body);
  };
}
