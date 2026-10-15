import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GH_CACHE_KEY,
  GH_CACHE_MAX,
  MAX_ORG_LOOKUPS,
  ORG_TTL_MS,
  SEARCH_TTL_MS,
  pruneGhCache,
  MAX_SEARCH_PAGES,
  companyFromOrg,
  findDesignSystemOrgs,
  keepRepo,
  parseRepo,
  searchUrl,
  type GhGet,
  type GhResponse,
  type OrgTarget,
  type RunReport,
} from './dsOrgs';
import { memoryKv } from './fetchFeed';
import { createGithubBudget } from './githubBudget';
import { FetchError, type FetchJson } from './sources/http';

const repo = (login: string, stars: number, extra: Record<string, unknown> = {}) => ({
  full_name: `${login}/ds`,
  html_url: `https://github.com/${login}/ds`,
  stargazers_count: stars,
  topics: ['design-system'],
  archived: false,
  fork: false,
  owner: { login, type: 'Organization' },
  ...extra,
});

describe('searchUrl', () => {
  it('ANDs topics, sorts by stars, 50 a page', () => {
    const u = new URL(searchUrl(['design-system', 'design-tokens'], 2));
    expect(u.origin + u.pathname).toBe('https://api.github.com/search/repositories');
    expect(u.searchParams.get('q')).toBe('topic:design-system topic:design-tokens');
    expect(u.searchParams.get('sort')).toBe('stars');
    expect(u.searchParams.get('per_page')).toBe('50');
    expect(u.searchParams.get('page')).toBe('2');
  });
});

describe('parseRepo and keepRepo', () => {
  it('reduces a repo to what we keep', () => {
    expect(parseRepo(repo('acme', 120))).toEqual({
      login: 'acme',
      ownerType: 'Organization',
      repo: 'acme/ds',
      repoUrl: 'https://github.com/acme/ds',
      stars: 120,
      topics: ['design-system'],
      archived: false,
      fork: false,
    });
    expect(parseRepo({})).toBeNull();
  });
  it.each([
    ['an org with stars', repo('a', 50), true],
    ['a user account', repo('a', 50, { owner: { login: 'a', type: 'User' } }), false],
    ['an archived repo', repo('a', 50, { archived: true }), false],
    ['a fork', repo('a', 50, { fork: true }), false],
    ['too few stars', repo('a', 19), false],
    ['exactly 20 stars', repo('a', 20), true],
  ])('%s', (_n, raw, want) => {
    expect(keepRepo(parseRepo(raw)!, 20)).toBe(want);
  });
});

describe('companyFromOrg', () => {
  it.each([
    [{ name: 'Acme Inc', blog: 'acme.com' }, 'acme', 'Acme Inc', 'https://acme.com'],
    [{ name: '', blog: 'https://www.acme.io/' }, 'acme', 'acme', 'https://www.acme.io/'],
    [{ name: 'Acme', blog: 'not a url' }, 'acme', 'Acme', undefined],
    [{ name: 'Acme', blog: 'javascript:alert(1)' }, 'acme', 'Acme', undefined],
    [undefined, 'acme', 'acme', undefined],
  ])('%j', (org, login, company, website) => {
    expect(companyFromOrg(login, org)).toEqual({ company, website });
  });
});

describe('findDesignSystemOrgs', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const page = (items: unknown[]): GhResponse => ({ status: 200, body: { items }, remaining: 9 });
  const run = async (
    opts: Partial<Parameters<typeof findDesignSystemOrgs>[0]> & { ghGet: GhGet },
  ) => {
    const report: RunReport = {} as RunReport;
    const kv = opts.kv ?? memoryKv();
    const out: OrgTarget[] = [];
    const none: FetchJson = async (u) => {
      throw new FetchError(404, u);
    };
    const p = (async () => {
      for await (const o of findDesignSystemOrgs({
        fetchJson: none,
        kv,
        budget: createGithubBudget({ kv }),
        report,
        ...opts,
      }))
        out.push(o);
    })();
    await vi.advanceTimersByTimeAsync(600_000);
    await p;
    return { out, report };
  };

  const orgInfo: Record<string, unknown> = {
    acme: { name: 'Acme Inc', blog: 'acme.com', description: 'x' },
  };
  const standard = async (url: string) => {
    if (url.includes('/search/repositories')) {
      return page([
        repo('acme', 900),
        repo('forky', 500, { fork: true }),
        repo('someone', 400, { owner: { login: 'someone', type: 'User' } }),
        repo('tiny', 5),
        repo('nocorp', 300),
      ]);
    }
    const login = url.split('/orgs/')[1];
    if (login in orgInfo) return { status: 200, body: orgInfo[login], remaining: 50 };
    return { status: 404, body: {} };
  };

  it('keeps organisations only, no forks or archived or tiny, most stars first', async () => {
    const { out } = await run({ ghGet: standard });
    expect(out.map((o) => o.login)).toEqual(['acme', 'nocorp']);
    expect(out[0]).toMatchObject({
      company: 'Acme Inc',
      website: 'https://acme.com',
      repo: 'acme/ds',
      stars: 900,
    });
  });

  it('still returns an org it cannot resolve or find a board for', async () => {
    const { out } = await run({ ghGet: standard });
    const nocorp = out.find((o) => o.login === 'nocorp')!;
    expect(nocorp.company).toBe('nocorp');
    expect(nocorp.board).toBeUndefined();
    expect(nocorp.repoUrl).toBe('https://github.com/nocorp/ds');
  });

  it('attaches a board and its open roles when the probe finds one', async () => {
    const fetchJson: FetchJson = async (u) => {
      if (u === 'https://api.lever.co/v0/postings/acme?mode=json') return [{}, {}];
      throw new FetchError(404, u);
    };
    const { out } = await run({ ghGet: standard, fetchJson });
    const acme = out.find((o) => o.login === 'acme')!;
    expect(acme.board).toEqual({ kind: 'lever', slug: 'acme' });
    expect(acme.openRoles).toBe(2);
  });

  it('tries the org login when the company name finds nothing', async () => {
    const fetchJson: FetchJson = async (u) => {
      if (u === 'https://api.ashbyhq.com/posting-api/job-board/acme') return { jobs: [] };
      throw new FetchError(404, u);
    };
    const gh: GhGet = async (url) =>
      url.includes('/search/repositories')
        ? page([repo('acme', 900)])
        : { status: 200, body: { name: 'Totally Different Name' } };
    const { out } = await run({ ghGet: gh, fetchJson });
    expect(out[0].board).toEqual({ kind: 'ashby', slug: 'acme' });
    expect(out[0].openRoles).toBe(0);
  });

  it('reads at most 3 search pages (150 repos) and 30 org lookups per run', async () => {
    let searches = 0;
    let lookups = 0;
    const gh: GhGet = async (url) => {
      if (url.includes('/search/repositories')) {
        const p = Number(new URL(url).searchParams.get('page'));
        searches++;
        return page(Array.from({ length: 50 }, (_, i) => repo(`org${p}x${i}`, 1000 - p * 50 - i)));
      }
      lookups++;
      return { status: 200, body: { name: 'N' } };
    };
    const { out, report } = await run({ ghGet: gh });
    expect(searches).toBe(MAX_SEARCH_PAGES);
    expect(lookups).toBe(MAX_ORG_LOOKUPS);
    expect(out).toHaveLength(150); // every org is listed, only 30 resolved
    expect(report.searchPages).toBe(3);
    expect(report.orgLookups).toBe(30);
    expect(out.filter((o) => o.company === 'N')).toHaveLength(30);
  });

  it('stops on a rate limit, says when it lifts, and still lists what it has', async () => {
    const reset = Math.floor(Date.now() / 1000) + 600;
    const gh: GhGet = async (url) =>
      url.includes('/search/repositories')
        ? page([repo('a', 300), repo('b', 200)])
        : { status: 403, body: {}, remaining: 0, reset };
    const { out, report } = await run({ ghGet: gh });
    expect(report.stoppedUntil).toBe(reset * 1000);
    expect(out.map((o) => o.login)).toEqual(['a', 'b']);
    expect(out.every((o) => o.company === o.login)).toBe(true);
  });

  it('stops searching on a 403 and respects Retry-After', async () => {
    const gh: GhGet = vi.fn(async () => ({ status: 429, body: {}, retryAfter: 120 }));
    const t0 = Date.now();
    const { out, report } = await run({ ghGet: gh });
    expect(out).toEqual([]);
    expect(report.stoppedUntil).toBe(t0 + 120_000);
    expect(gh).toHaveBeenCalledTimes(1);
  });

  it('makes no call while the budget says to wait', async () => {
    const kv = memoryKv();
    const budget = createGithubBudget({ kv });
    const t0 = Date.now();
    budget.blockUntil(t0 + 300_000);
    const gh = vi.fn((u: string) => standard(u));
    const { out, report } = await run({ ghGet: gh, kv, budget });
    expect(gh).not.toHaveBeenCalled();
    expect(out).toEqual([]);
    expect(report.stoppedUntil).toBe(t0 + 300_000);
  });

  it('caches search pages and org lookups, so a second run spends nothing', async () => {
    const kv = memoryKv();
    const gh = vi.fn((u: string) => standard(u));
    await run({ ghGet: gh, kv });
    const first = gh.mock.calls.length;
    expect(first).toBeGreaterThan(0);
    const { out } = await run({ ghGet: gh, kv });
    expect(gh.mock.calls.length).toBe(first);
    expect(out.map((o) => o.login)).toEqual(['acme', 'nocorp']);
  });

  // #180 review: rjb_gh_cache only ever grew; expired pages and lookups stay forever otherwise.
  it('prunes expired entries from the stored cache when a run saves it', async () => {
    const kv = memoryKv();
    const now = Date.now();
    kv.set(
      GH_CACHE_KEY,
      JSON.stringify({
        's:https://old': { at: now - SEARCH_TTL_MS - 1, v: { list: [], n: 0 } },
        'o:gone': { at: now - ORG_TTL_MS - 1, v: { missing: true } },
        'o:kept': { at: now - 1000, v: { missing: true } },
      }),
    );
    await run({ ghGet: (u) => standard(u), kv });
    const stored = JSON.parse(kv.get(GH_CACHE_KEY) ?? '{}');
    expect(stored['s:https://old']).toBeUndefined();
    expect(stored['o:gone']).toBeUndefined();
    expect(stored['o:kept']).toBeDefined();
  });

  it('honours a minimum-stars setting', async () => {
    const { out } = await run({ ghGet: standard, minStars: 600 });
    expect(out.map((o) => o.login)).toEqual(['acme']);
  });

  it('reports a failed search plainly', async () => {
    const gh: GhGet = async () => ({ status: 500, body: {} });
    const { out, report } = await run({ ghGet: gh });
    expect(out).toEqual([]);
    expect(report.error).toMatch(/GitHub/);
  });

  it('stops when aborted', async () => {
    const ac = new AbortController();
    const gh: GhGet = async (url) =>
      url.includes('/search/repositories')
        ? page(Array.from({ length: 20 }, (_, i) => repo(`o${i}`, 100 + i)))
        : { status: 200, body: { name: 'N' } };
    const report: RunReport = {} as RunReport;
    const kv = memoryKv();
    const got: OrgTarget[] = [];
    const p = (async () => {
      for await (const o of findDesignSystemOrgs({
        ghGet: gh,
        fetchJson: async (u) => {
          throw new FetchError(404, u);
        },
        kv,
        budget: createGithubBudget({ kv }),
        report,
        signal: ac.signal,
      })) {
        got.push(o);
        if (got.length === 2) ac.abort();
      }
    })();
    await vi.advanceTimersByTimeAsync(600_000);
    await p;
    expect(got.length).toBeLessThan(20);
  });
});

describe('pruneGhCache', () => {
  it('drops expired and unknown entries and keeps the newest GH_CACHE_MAX', () => {
    const now = 10 * ORG_TTL_MS;
    const cache: Record<string, { at: number; v: unknown }> = {
      'x:odd': { at: now, v: 1 },
      's:stale': { at: now - SEARCH_TTL_MS - 1, v: 1 },
    };
    for (let i = 0; i < GH_CACHE_MAX + 10; i++) cache[`o:${i}`] = { at: now - i, v: 1 };
    const out = pruneGhCache(cache, now);
    expect(Object.keys(out)).toHaveLength(GH_CACHE_MAX);
    expect(out['x:odd']).toBeUndefined();
    expect(out['s:stale']).toBeUndefined();
    expect(out['o:0']).toBeDefined(); // newest kept
    expect(out[`o:${GH_CACHE_MAX + 9}`]).toBeUndefined(); // oldest dropped
  });
});
