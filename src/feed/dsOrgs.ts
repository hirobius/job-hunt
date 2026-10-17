// Method 3: companies with a public design system on GitHub (docs/specs/discovery-methods.md). Keyless
// GitHub REST search finds repositories tagged `design-system`; the owning organisations are the
// companies, each looked up once for a display name and website, then probed for a job board. An
// organisation with no board is still returned: that is an outreach target, not a dead end.
//
// UNVERIFIED LIVE from the build sandbox (a search call was refused by its proxy); see
// DISCOVERY_SOURCE_ENABLED.github. Rate limits are respected, not worked around: `githubBudget.ts`
// keeps us under 8 searches a minute and 40 core calls an hour, and any 403/429 stops the run and
// reports when GitHub lets us back in.
import { browserKv, type KeyValue } from './fetchFeed';
import type { GithubBudget } from './githubBudget';
import { probeCompanies, slugCandidates, type Limiter } from './probe';
import type { Board } from './sources/ats';
import { arr, obj, str, type FetchJson } from './sources/http';

export const GH_API = 'https://api.github.com';
export const MIN_STARS = 20;
export const MAX_SEARCH_PAGES = 3;
export const MAX_ORG_LOOKUPS = 30;
export const PER_PAGE = 50;
export const GH_CACHE_KEY = 'rjb_gh_cache';
export const SEARCH_TTL_MS = 24 * 3600e3;
export const ORG_TTL_MS = 7 * 86400e3;
/** The most entries `rjb_gh_cache` keeps; a run adds at most 6 pages and 30 orgs. */
export const GH_CACHE_MAX = 500;

/** Drop expired (and unrecognised) entries, then keep the newest GH_CACHE_MAX, so the stored
 *  cache can't only grow (#180 review). Search pages are `s:`, org lookups `o:`. */
export function pruneGhCache<E extends { at: number }>(
  cache: Record<string, E>,
  now: number,
): Record<string, E> {
  const ttl = (k: string) =>
    k.startsWith('s:') ? SEARCH_TTL_MS : k.startsWith('o:') ? ORG_TTL_MS : 0;
  const live = Object.entries(cache).filter(
    ([k, e]) => e && typeof e.at === 'number' && now - e.at < ttl(k),
  );
  live.sort((a, b) => b[1].at - a[1].at);
  return Object.fromEntries(live.slice(0, GH_CACHE_MAX));
}
const GH_TIMEOUT_MS = 15_000;
const QUERIES: string[][] = [['design-system', 'design-tokens'], ['design-system']];

export function searchUrl(topics: string[], page: number): string {
  const q = topics.map((t) => `topic:${t}`).join(' ');
  const p = new URLSearchParams({
    q,
    sort: 'stars',
    per_page: String(PER_PAGE),
    page: String(page),
  });
  return `${GH_API}/search/repositories?${p}`;
}

// ---- the one GitHub call ----

export interface GhResponse {
  status: number;
  body: unknown;
  /** `x-ratelimit-remaining`. */
  remaining?: number;
  /** `x-ratelimit-reset`, epoch seconds. */
  reset?: number;
  /** `Retry-After`, seconds. */
  retryAfter?: number;
}
export type GhGet = (url: string) => Promise<GhResponse>;

const header = (res: Response, name: string): number | undefined => {
  const v = res.headers.get(name);
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export const liveGhGet: GhGet = async (url) => {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(GH_TIMEOUT_MS),
    });
  } catch {
    return { status: 0, body: null };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* an error page; the status says enough */
  }
  return {
    status: res.status,
    body,
    remaining: header(res, 'x-ratelimit-remaining'),
    reset: header(res, 'x-ratelimit-reset'),
    retryAfter: header(res, 'retry-after'),
  };
};

// ---- repositories ----

export interface DsRepo {
  login: string;
  ownerType: string;
  repo: string;
  repoUrl: string;
  stars: number;
  topics: string[];
  archived: boolean;
  fork: boolean;
}

export function parseRepo(raw: unknown): DsRepo | null {
  const o = obj(raw);
  const owner = obj(o.owner);
  const login = str(owner.login);
  const repo = str(o.full_name);
  if (!login || !repo) return null;
  return {
    login,
    ownerType: str(owner.type),
    repo,
    repoUrl: str(o.html_url) || `https://github.com/${repo}`,
    stars: typeof o.stargazers_count === 'number' ? o.stargazers_count : 0,
    topics: arr(o.topics).filter((t): t is string => typeof t === 'string'),
    archived: o.archived === true,
    fork: o.fork === true,
  };
}

export const keepRepo = (r: DsRepo, minStars: number) =>
  r.ownerType === 'Organization' && !r.archived && !r.fork && r.stars >= minStars;

// ---- organisations ----

export interface OrgInfo {
  name?: string;
  blog?: string;
  description?: string;
}

export function companyFromOrg(
  login: string,
  org?: OrgInfo,
): { company: string; website: string | undefined } {
  const company = org?.name?.trim() || login;
  let website: string | undefined;
  const blog = org?.blog?.trim();
  if (blog) {
    try {
      const u = new URL(/^https?:\/\//i.test(blog) ? blog : `https://${blog}`);
      if ((u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.'))
        website = /^https?:\/\//i.test(blog) ? blog : `https://${blog}`;
    } catch {
      /* not a URL */
    }
  }
  return { company, website };
}

export interface OrgTarget {
  login: string;
  company: string;
  website?: string;
  repo: string;
  repoUrl: string;
  stars: number;
  topics: string[];
  board?: Board;
  /** Open roles on `board` at the time of the check. */
  openRoles?: number;
  /** Why there is no `board`, when it isn't "none": a board check that got no answer (rate-limited,
   *  offline: never read as none), or an organisation not looked up yet. */
  boardCheck?: 'unknown' | 'unchecked';
}

/** What a run did, filled in as it goes (a generator cannot also return a summary to `for await`). */
export interface RunReport {
  searchPages: number;
  orgLookups: number;
  /** Organisations found, before the 30-lookup cap. */
  orgs: number;
  /** Organisations listed without a lookup (cap reached or rate-limited): "Load more" resolves them. */
  unresolved: number;
  /** When GitHub (or our own budget) lets the next call through, if the run stopped for it. */
  stoppedUntil?: number;
  /** A plain-language problem, when the search itself failed. */
  error?: string;
}

export interface DsOrgOptions {
  ghGet?: GhGet;
  fetchJson: FetchJson;
  budget: GithubBudget;
  kv?: KeyValue;
  now?: () => number;
  limiter?: Limiter;
  signal?: AbortSignal;
  minStars?: number;
  report: RunReport;
}

type CacheEntry = { at: number; v: unknown };
const readCache = (kv: KeyValue): Record<string, CacheEntry> => {
  try {
    const v: unknown = JSON.parse(kv.get(GH_CACHE_KEY) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, CacheEntry>) : {};
  } catch {
    return {};
  }
};

export async function* findDesignSystemOrgs(opts: DsOrgOptions): AsyncGenerator<OrgTarget> {
  const { budget, report, signal } = opts;
  const ghGet = opts.ghGet ?? liveGhGet;
  const kv = opts.kv ?? browserKv();
  const now = opts.now ?? Date.now;
  const minStars = opts.minStars ?? MIN_STARS;
  Object.assign(report, { searchPages: 0, orgLookups: 0, orgs: 0, unresolved: 0 });
  delete report.stoppedUntil;
  delete report.error;

  const cache = readCache(kv);
  let dirty = false;
  const fromCache = <T>(key: string, ttl: number): T | undefined => {
    const e = cache[key];
    return e && typeof e.at === 'number' && now() - e.at < ttl ? (e.v as T) : undefined;
  };
  const toCache = (key: string, v: unknown) => {
    cache[key] = { at: now(), v };
    dirty = true;
  };
  const halt = () => !!signal?.aborted;

  /** One budgeted GitHub call. Null when the run must stop (the reason is on the report). */
  async function call(kind: 'search' | 'core', url: string): Promise<GhResponse | null> {
    const r = budget.reserve(kind);
    if (!r.ok) {
      report.stoppedUntil = r.until;
      return null;
    }
    const res = await ghGet(url);
    const limited =
      (res.status === 403 || res.status === 429) && (res.remaining === 0 || res.retryAfter != null);
    if (limited) {
      const until =
        res.retryAfter != null
          ? now() + res.retryAfter * 1000
          : res.reset != null
            ? res.reset * 1000
            : now() + 60_000;
      budget.blockUntil(until);
      report.stoppedUntil = until;
      return null;
    }
    // The last call of a window: hold the next one back rather than learn it from a refusal.
    if (res.remaining === 0 && res.reset != null) budget.blockUntil(res.reset * 1000);
    return res;
  }

  try {
    // 1. repositories, the narrower query first, at most MAX_SEARCH_PAGES pages in all
    const repos: DsRepo[] = [];
    let stop = false;
    for (const topics of QUERIES) {
      for (let page = 1; !stop && !halt() && report.searchPages < MAX_SEARCH_PAGES; page++) {
        const url = searchUrl(topics, page);
        let entry = fromCache<{ list: DsRepo[]; n: number }>(`s:${url}`, SEARCH_TTL_MS);
        if (!entry) {
          const res = await call('search', url);
          if (!res) {
            stop = true;
            break;
          }
          if (res.status !== 200) {
            report.error = `GitHub search didn't answer (HTTP ${res.status || 'no response'}). Try again in a few minutes.`;
            stop = true;
            break;
          }
          const raw = arr(obj(res.body).items);
          // Keep the reduced form only: a full repository object is ~8 KB and storage is small.
          entry = { list: raw.map(parseRepo).filter((r): r is DsRepo => !!r), n: raw.length };
          toCache(`s:${url}`, entry);
        }
        report.searchPages++;
        repos.push(...entry.list);
        if (entry.n < PER_PAGE) break;
      }
      if (stop) break;
    }

    // 2. organisations, most stars first, one row each
    const best = new Map<string, DsRepo>();
    for (const r of repos) {
      if (!keepRepo(r, minStars)) continue;
      const k = r.login.toLowerCase();
      const cur = best.get(k);
      if (!cur || r.stars > cur.stars) best.set(k, r);
    }
    const orgs = [...best.values()].sort((a, b) => b.stars - a.stars);
    report.orgs = orgs.length;

    // 3. each organisation: name and website, then a board
    for (const r of orgs) {
      if (halt()) return;
      let info: OrgInfo | undefined;
      const key = `o:${r.login.toLowerCase()}`;
      const cached = fromCache<OrgInfo | { missing: true }>(key, ORG_TTL_MS);
      if (cached) info = 'missing' in cached ? undefined : (cached as OrgInfo);
      else if (!report.stoppedUntil && report.orgLookups < MAX_ORG_LOOKUPS) {
        const res = await call('core', `${GH_API}/orgs/${encodeURIComponent(r.login)}`);
        if (res) {
          report.orgLookups++;
          if (res.status === 200) {
            const o = obj(res.body);
            info = { name: str(o.name), blog: str(o.blog), description: str(o.description) };
            toCache(key, info);
          } else if (res.status === 404) toCache(key, { missing: true });
        }
      }
      const resolved = !!info;
      if (!resolved) report.unresolved++;
      const { company, website } = companyFromOrg(r.login, info);
      const target: OrgTarget = {
        login: r.login,
        company,
        ...(website && { website }),
        repo: r.repo,
        repoUrl: r.repoUrl,
        stars: r.stars,
        topics: r.topics,
      };
      if (resolved) {
        const hit = await findBoard(company, r.login, opts, kv, now);
        if (hit === 'unknown') target.boardCheck = 'unknown';
        else if (hit) {
          target.board = hit.board;
          target.openRoles = hit.jobs;
        }
      } else target.boardCheck = 'unchecked';
      if (halt()) return;
      yield target;
    }
  } finally {
    const pruned = pruneGhCache(cache, now());
    if (dirty || Object.keys(pruned).length !== Object.keys(cache).length) {
      try {
        kv.set(GH_CACHE_KEY, JSON.stringify(pruned));
      } catch {
        /* storage full: the next run just asks again */
      }
    }
  }
}

/** The company's board by its name, else by the organisation's login. 'unknown' when no board was
 *  found and some check got no answer: that is not "none". */
async function findBoard(
  company: string,
  login: string,
  o: DsOrgOptions,
  kv: KeyValue,
  now: () => number,
): Promise<{ board: Board; jobs?: number } | 'unknown' | null> {
  let unknown = false;
  const lines = [company];
  const l = login.toLowerCase();
  if (!slugCandidates(company).includes(l)) lines.push(login);
  for (const line of lines) {
    for await (const r of probeCompanies([line], {
      fetchJson: o.fetchJson,
      signal: o.signal,
      kv,
      now,
      limiter: o.limiter,
    })) {
      if (r.state === 'found') return { board: r.hits[0].board, jobs: r.hits[0].jobs };
      if (r.state === 'unknown') unknown = true;
    }
  }
  return unknown ? 'unknown' : null;
}
