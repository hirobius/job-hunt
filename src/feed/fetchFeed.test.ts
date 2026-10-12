import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFetchJson,
  describeError,
  fetchFeed,
  memoryKv,
  REMOTIVE_DAILY_MAX,
} from './fetchFeed';
import { FetchError } from './sources/http';

// fetchFeed's default Remotive budget lives in localStorage — never let it leak between tests.
beforeEach(() => localStorage.clear());

const res = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe('createFetchJson', () => {
  it('caches successful responses for the TTL, then refetches', async () => {
    let t = 0;
    const fetchImpl = vi.fn(async () => res(200, { n: 1 }));
    const fetchJson = createFetchJson({ fetchImpl, now: () => t, ttlMs: 1000 });
    await fetchJson('https://a/x');
    t = 999;
    await fetchJson('https://a/x');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    t = 1000;
    expect(await fetchJson('https://a/x')).toEqual({ n: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('maps HTTP errors and network failures to FetchError and never caches them', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res(429))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(res(200, { ok: true }));
    const fetchJson = createFetchJson({ fetchImpl, now: () => 0, ttlMs: 1000 });
    await expect(fetchJson('https://a/y')).rejects.toMatchObject({ status: 429 });
    await expect(fetchJson('https://a/y')).rejects.toMatchObject({ status: 0 });
    expect(await fetchJson('https://a/y')).toEqual({ ok: true });
  });
});

describe('describeError', () => {
  it.each([
    [new FetchError(404, 'u'), true, 'Acme (Lever): board not found — check the tile URL'],
    [new FetchError(429, 'u'), false, 'Acme (Lever): rate-limited — try again in a few minutes.'],
    [
      new FetchError(0, 'u'),
      false,
      "Acme (Lever): couldn't connect — offline, or a privacy/ad blocker is blocking it.",
    ],
    [
      new FetchError(503, 'u'),
      false,
      'Acme (Lever): HTTP 503 — the service is having trouble; try again later.',
    ],
    [new SyntaxError('bad json'), false, 'Acme (Lever): unexpected response.'],
  ])('%s', (err, isBoard, msg) => {
    expect(describeError(err, 'Acme (Lever)', isBoard)).toContain(msg);
  });
});

describe('fetchFeed', () => {
  const hnListing = {
    hits: [
      { objectID: '7', title: 'Ask HN: Who is hiring? (October 2026)', created_at: '2026-10-01' },
    ],
  };

  it('runs every source, isolates failures, and reports each one', async () => {
    const fetchJson = async (url: string) => {
      if (url.includes('search_by_date')) return hnListing;
      if (url.includes('hn.algolia.com'))
        return {
          hits: [{ objectID: '1', story_id: 7, parent_id: 7, comment_text: 'A | UI Engineer' }],
        };
      if (url.includes('remotive.com')) throw new FetchError(429, url);
      if (url.includes('ashbyhq'))
        return {
          jobs: [{ id: 'u', title: 'Design Engineer', jobUrl: 'https://jobs.ashbyhq.com/ramp/u' }],
        };
      throw new FetchError(404, url);
    };
    const out = await fetchFeed(
      {
        term: 'design engineer',
        boardUrls: [
          'https://jobs.ashbyhq.com/ramp',
          'https://jobs.lever.co/gone',
          'https://www.linkedin.com/jobs',
        ],
      },
      fetchJson,
    );
    expect(out.postings.map((p) => p.id).sort()).toEqual(['ashby:ramp:u', 'hn:1']);
    expect(out.sources).toEqual([
      { key: 'hn', label: 'Hacker News', fetched: 1 },
      {
        key: 'remotive',
        label: 'Remotive',
        fetched: 0,
        error: 'Remotive: rate-limited — try again in a few minutes.',
      },
      { key: 'ashby:ramp', label: 'Ramp (Ashby)', fetched: 1 },
      expect.objectContaining({
        key: 'lever:gone',
        fetched: 0,
        error: expect.stringContaining('board not found'),
      }),
    ]);
    expect(out.boardsSkipped).toBe(0);
  });

  it('drops postings whose link is not http(s) — it becomes a clickable href', async () => {
    const out = await fetchFeed({ term: 'x', boardUrls: [] }, async (url) => {
      if (url.includes('search_by_date')) return { hits: [] };
      return {
        jobs: [
          { id: 1, url: 'javascript:alert(1)', title: 'x' },
          { id: 2, url: 'https://remotive.com/remote-jobs/2', title: 'x' },
        ],
      };
    });
    expect(out.postings.map((p) => p.id)).toEqual(['remotive:2']);
  });

  it('caps watched boards and says how many it skipped', async () => {
    const urls = Array.from({ length: 30 }, (_, i) => `https://jobs.lever.co/co${i}`);
    const out = await fetchFeed({ term: 'x', boardUrls: urls }, async (url) =>
      url.includes('search_by_date') ? { hits: [] } : url.includes('remotive') ? { jobs: [] } : [],
    );
    expect(out.sources.filter((s) => s.key.startsWith('lever:'))).toHaveLength(25);
    expect(out.boardsSkipped).toBe(5);
  });

  it('skips the network entirely for a blank term', async () => {
    const fetchJson = vi.fn();
    const out = await fetchFeed({ term: '  ', boardUrls: [] }, fetchJson);
    expect(fetchJson).not.toHaveBeenCalled();
    expect(out).toEqual({ postings: [], sources: [], boardsSkipped: 0 });
  });
});

describe('Remotive request budget (its API terms: at most ~4 requests a day)', () => {
  const remotiveOnly = (calls: string[]) => async (url: string) => {
    if (url.includes('search_by_date')) return { hits: [] };
    calls.push(url);
    return {
      jobs: [
        { id: calls.length, url: `https://remotive.com/remote-jobs/${calls.length}`, title: 'x' },
      ],
    };
  };

  it('serves a term from its 6-hour cache instead of calling again', async () => {
    const calls: string[] = [];
    const kv = memoryKv();
    let t = 0;
    const opts = { kv, now: () => t };
    await fetchFeed({ term: 'design systems', boardUrls: [] }, remotiveOnly(calls), opts);
    t = 5 * 3600e3;
    const again = await fetchFeed(
      { term: 'design systems', boardUrls: [] },
      remotiveOnly(calls),
      opts,
    );
    expect(calls).toHaveLength(1);
    expect(again.postings.map((p) => p.id)).toEqual(['remotive:1']);
  });

  it('stops calling Remotive after the daily budget and says so', async () => {
    const calls: string[] = [];
    const kv = memoryKv();
    const opts = { kv, now: () => 0 };
    for (let i = 0; i < REMOTIVE_DAILY_MAX; i++)
      await fetchFeed({ term: `term ${i}`, boardUrls: [] }, remotiveOnly(calls), opts);
    const over = await fetchFeed({ term: 'one more', boardUrls: [] }, remotiveOnly(calls), opts);
    expect(calls).toHaveLength(REMOTIVE_DAILY_MAX);
    expect(over.sources.find((s) => s.key === 'remotive')?.error).toMatch(/daily limit/i);
  });

  it('frees the budget again 24 hours after a call', async () => {
    const calls: string[] = [];
    const kv = memoryKv();
    let t = 0;
    const opts = { kv, now: () => t };
    for (let i = 0; i < REMOTIVE_DAILY_MAX; i++)
      await fetchFeed({ term: `term ${i}`, boardUrls: [] }, remotiveOnly(calls), opts);
    t = 24 * 3600e3 + 1;
    await fetchFeed({ term: 'next day', boardUrls: [] }, remotiveOnly(calls), opts);
    expect(calls).toHaveLength(REMOTIVE_DAILY_MAX + 1);
  });
});
