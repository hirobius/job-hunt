import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFetchJson,
  describeError,
  BOARD_CONCURRENCY,
  fetchFeed,
  memoryKv,
  REMOTIVE_DAILY_MAX,
} from './fetchFeed';
import { FetchError } from './sources/http';

// fetchFeed's default Remotive budget lives in localStorage — never let it leak between tests.
beforeEach(() => localStorage.clear());

const NO_AGGREGATORS = { jobicy: false, remoteok: false };
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

  it('aborts each request after the timeout and maps TimeoutError to FetchError with isTimeout', async () => {
    const timeoutErr = new Error('The operation was aborted');
    timeoutErr.name = 'TimeoutError';
    const fetchImpl = vi.fn().mockRejectedValue(timeoutErr);
    const fetchJson = createFetchJson({ fetchImpl, timeoutMs: 100 });
    await expect(fetchJson('https://a/slow')).rejects.toMatchObject({
      status: 0,
      isTimeout: true,
    });
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
      { sources: NO_AGGREGATORS },
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
  });

  it('drops postings whose link is not http(s) — it becomes a clickable href', async () => {
    const out = await fetchFeed(
      { term: 'x', boardUrls: [] },
      async (url) => {
        if (url.includes('search_by_date')) return { hits: [] };
        return {
          jobs: [
            { id: 1, url: 'javascript:alert(1)', title: 'x' },
            { id: 2, url: 'https://remotive.com/remote-jobs/2', title: 'x' },
          ],
        };
      },
      { sources: NO_AGGREGATORS },
    );
    expect(out.postings.map((p) => p.id)).toEqual(['remotive:2']);
  });

  it('reads every distinct board: there is no cap', async () => {
    const urls = Array.from({ length: 130 }, (_, i) => `https://jobs.lever.co/co${i}`);
    const out = await fetchFeed(
      { term: 'x', boardUrls: urls },
      async (url) =>
        url.includes('search_by_date')
          ? { hits: [] }
          : url.includes('remotive')
            ? { jobs: [] }
            : [],
      { sources: NO_AGGREGATORS },
    );
    expect(out.sources.filter((s) => s.key.startsWith('lever:'))).toHaveLength(130);
    expect(out).not.toHaveProperty('boardsSkipped');
  });

  it('reports progress as boards finish, so fast boards show before slow ones', async () => {
    const urls = ['https://jobs.lever.co/fast', 'https://jobs.lever.co/slow'];
    let releaseSlow: () => void = () => {};
    const slow = new Promise<void>((r) => (releaseSlow = r));
    const snaps: { done: number; total: number; ids: string[] }[] = [];
    const run = fetchFeed(
      {
        term: 'engineer',
        boardUrls: urls,
        onProgress: (p) =>
          snaps.push({
            done: p.boardsDone,
            total: p.boardsTotal,
            ids: p.postings.map((x) => x.id),
          }),
      },
      async (url) => {
        if (url.includes('search_by_date')) return { hits: [] };
        if (url.includes('remotive')) return { jobs: [] };
        if (url.includes('lever.co/v0/postings/slow')) {
          await slow;
          return [{ id: 's', text: 'Engineer', hostedUrl: 'https://jobs.lever.co/slow/s' }];
        }
        return [{ id: 'f', text: 'Engineer', hostedUrl: 'https://jobs.lever.co/fast/f' }];
      },
      { sources: NO_AGGREGATORS },
    );
    await vi.waitFor(() => expect(snaps.some((s) => s.ids.includes('lever:fast:f'))).toBe(true));
    const early = snaps.find((s) => s.ids.includes('lever:fast:f'))!;
    expect(early.ids).not.toContain('lever:slow:s');
    expect(early.total).toBe(2);
    expect(early.done).toBeLessThan(2);
    releaseSlow();
    const out = await run;
    const last = snaps[snaps.length - 1];
    expect(last.done).toBe(2);
    expect(last.ids.sort()).toEqual(out.postings.map((p) => p.id).sort());
    expect(snaps.map((s) => s.done)).toEqual([...snaps.map((s) => s.done)].sort((a, b) => a - b));
  });

  it('reads company boards a few at a time, not all at once', async () => {
    let inFlight = 0;
    let peak = 0;
    const urls = Array.from({ length: 130 }, (_, i) => `https://jobs.lever.co/co${i}`);
    await fetchFeed({ term: 'x', boardUrls: urls }, async (url) => {
      if (url.includes('search_by_date')) return { hits: [] };
      if (!url.includes('lever.co')) return url.includes('remotive') ? { jobs: [] } : [];
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return [];
    });
    expect(BOARD_CONCURRENCY).toBe(6);
    expect(peak).toBe(6);
  });

  it('skips the network entirely for a blank term', async () => {
    const fetchJson = vi.fn();
    const out = await fetchFeed({ term: '  ', boardUrls: [] }, fetchJson);
    expect(fetchJson).not.toHaveBeenCalled();
    expect(out).toEqual({ postings: [], sources: [] });
  });

  it('proves one hung source times out without blocking the others', async () => {
    const fetchImpl = (url: string, init?: RequestInit) => {
      if (url.includes('search_by_date')) return Promise.resolve(res(200, hnListing));
      if (url.includes('hn.algolia.com'))
        return Promise.resolve(
          res(200, {
            hits: [{ objectID: '1', story_id: 7, parent_id: 7, comment_text: 'A | UI Engineer' }],
          }),
        );
      if (url.includes('remotive.com')) {
        return new Promise<Response>((_, rej) => {
          init?.signal?.addEventListener('abort', () => rej(init?.signal?.reason));
        });
      }
      return Promise.resolve(res(200, { jobs: [] }));
    };

    const fetchJson = createFetchJson({ fetchImpl, timeoutMs: 50 });
    const out = await fetchFeed({ term: 'design engineer', boardUrls: [] }, fetchJson);

    expect(out.postings.map((p) => p.id)).toEqual(['hn:1']);
    expect(out.sources).toContainEqual({
      key: 'remotive',
      label: 'Remotive',
      fetched: 0,
      error: 'Remotive: timed out — try again later.',
    });
  });
});

describe('Jobicy and Remote OK', () => {
  const hn = { hits: [] };
  const jobicyJob = {
    id: 1,
    url: 'https://jobicy.com/jobs/1',
    jobTitle: 'Design Systems Engineer',
  };
  const rokJob = {
    id: 2,
    url: 'https://remoteok.com/remote-jobs/2',
    position: 'Design Systems Lead',
  };

  it('both show up as named sources with a count', async () => {
    const out = await fetchFeed(
      { term: 'design systems', boardUrls: [] },
      async (url) => {
        if (url.includes('jobicy')) return { jobs: [jobicyJob] };
        if (url.includes('remoteok')) return [{ legal: 'x' }, rokJob];
        return url.includes('remotive') ? { jobs: [] } : hn;
      },
      { kv: memoryKv() },
    );
    expect(out.sources).toContainEqual({ key: 'jobicy', label: 'Jobicy', fetched: 1 });
    expect(out.sources).toContainEqual({ key: 'remoteok', label: 'Remote OK', fetched: 1 });
    expect(out.postings.map((p) => p.id).sort()).toEqual(['jobicy:1', 'remoteok:2']);
  });

  it('a blocked one is named and does not block the others', async () => {
    const out = await fetchFeed(
      { term: 'design systems', boardUrls: [] },
      async (url) => {
        if (url.includes('jobicy')) throw new FetchError(0, url);
        if (url.includes('remoteok')) return [rokJob];
        return url.includes('remotive') ? { jobs: [] } : hn;
      },
      { kv: memoryKv() },
    );
    expect(out.sources.find((s) => s.key === 'jobicy')?.error).toMatch(/^Jobicy: couldn't connect/);
    expect(out.postings.map((p) => p.id)).toEqual(['remoteok:2']);
  });

  it('the per-source switch leaves a source out entirely', async () => {
    const urls: string[] = [];
    const out = await fetchFeed(
      { term: 'design systems', boardUrls: [] },
      async (url) => {
        urls.push(url);
        return url.includes('remotive') ? { jobs: [] } : hn;
      },
      { kv: memoryKv(), sources: { jobicy: false, remoteok: false } },
    );
    expect(urls.some((u) => /jobicy|remoteok/.test(u))).toBe(false);
    expect(out.sources.map((s) => s.key)).toEqual(['hn', 'remotive']);
  });

  it('a term too short for Jobicy skips it without a request', async () => {
    const urls: string[] = [];
    await fetchFeed(
      { term: 'UI', boardUrls: [] },
      async (url) => {
        urls.push(url);
        return url.includes('remotive') ? { jobs: [] } : url.includes('remoteok') ? [] : hn;
      },
      { kv: memoryKv() },
    );
    expect(urls.some((u) => u.includes('jobicy'))).toBe(false);
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
    const opts = { kv, now: () => t, sources: NO_AGGREGATORS };
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
    const opts = { kv, now: () => 0, sources: NO_AGGREGATORS };
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
    const opts = { kv, now: () => t, sources: NO_AGGREGATORS };
    for (let i = 0; i < REMOTIVE_DAILY_MAX; i++)
      await fetchFeed({ term: `term ${i}`, boardUrls: [] }, remotiveOnly(calls), opts);
    t = 24 * 3600e3 + 1;
    await fetchFeed({ term: 'next day', boardUrls: [] }, remotiveOnly(calls), opts);
    expect(calls).toHaveLength(REMOTIVE_DAILY_MAX + 1);
  });
});
