// The browser scan's load (2026-11-07, after the phone sign-in profile): at most 6 reads on the
// network at once, the parsed JSON freed when a run ends, a lead probed only on the kind the board
// set knows for it (else the three most common), and a real stop: a cancelled run starts no more
// reads. Driven through the real fetcher and the real run (no mocked scan).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_FETCHES_IN_FLIGHT, createFetchJson } from './fetchFeed';
import {
  GUESS_KINDS,
  cancelScan,
  getScanState,
  isScanning,
  kindsForSlug,
  resetScan,
  scanNow,
  type ScanDeps,
} from './autoScan';
import { YC_HIRING_URL } from './companySource';
import { createLimiter, probeCompanies } from './probe';
import type { PostingReader } from './reader';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  resetScan();
});

describe('the shared fetcher', () => {
  it(`keeps at most ${MAX_FETCHES_IN_FLIGHT} reads on the network; the next starts as one ends`, async () => {
    const answers: (() => void)[] = [];
    const fetchImpl = vi.fn(
      () => new Promise<Response>((r) => answers.push(() => r(json({ ok: 1 })))),
    );
    const fetchJson = createFetchJson({ fetchImpl, now: () => 0 });
    const reads = Array.from({ length: 10 }, (_, i) => fetchJson(`https://a.example/${i}`));
    await flush();
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_FETCHES_IN_FLIGHT);
    expect(fetchJson.inFlight()).toBe(MAX_FETCHES_IN_FLIGHT);
    answers.shift()!();
    await reads[0];
    await flush();
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_FETCHES_IN_FLIGHT + 1);
    while (answers.length) {
      answers.shift()!();
      await flush();
    }
    await Promise.all(reads);
    expect(fetchImpl).toHaveBeenCalledTimes(10);
    expect(fetchJson.inFlight()).toBe(0);
  });

  it('clear() frees every cached body', async () => {
    const fetchImpl = vi.fn(async () => json({ pad: 'x'.repeat(100) }));
    const fetchJson = createFetchJson({ fetchImpl, now: () => 0 });
    await fetchJson('https://a.example/1');
    expect(fetchJson.cachedChars()).toBeGreaterThan(0);
    fetchJson.clear();
    expect(fetchJson.cachedChars()).toBe(0);
    await fetchJson('https://a.example/1');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('probing a lead', () => {
  it('asks only the kind the board set knows, else the three most common kinds', () => {
    const kinds = kindsForSlug(new Set(['lever:acme']));
    expect(kinds('acme')).toEqual(['lever']);
    expect(kinds('Acme')).toEqual(['lever']);
    expect(kinds('nobody')).toEqual([...GUESS_KINDS]);
    expect(kindsForSlug(null)('acme')).toEqual([...GUESS_KINDS]);
  });

  it('the probe asks no other kind', async () => {
    const asked: string[] = [];
    const fetchJson = vi.fn(async (url: string) => {
      asked.push(new URL(url).host);
      throw Object.assign(new Error('404'), { status: 404 });
    });
    for await (const _ of probeCompanies(['Acme'], {
      fetchJson,
      limiter: createLimiter({ gapMs: 0 }),
      kv: { get: () => null, set: () => {} },
      kindsFor: () => ['greenhouse'],
    })) {
      // drain
    }
    expect(asked.length).toBeGreaterThan(0);
    expect(new Set(asked)).toEqual(new Set(['boards-api.greenhouse.io']));
  });
});

describe('a cancelled scan really stops', () => {
  it('starts no more reads once cancelled, ends, keeps its place and frees the cache', async () => {
    // YC names 30 hiring design-system companies; every board read hangs until answered.
    const yc = Array.from({ length: 30 }, (_, i) => ({
      name: `Company ${i}`,
      website: `https://company${i}.example`,
      one_liner: 'We build a design system',
      status: 'Active',
      isHiring: true,
    }));
    const pending: (() => void)[] = [];
    const fetchImpl = vi.fn((url: string) =>
      url === YC_HIRING_URL
        ? Promise.resolve(json(yc))
        : new Promise<Response>((r) => pending.push(() => r(new Response('{}', { status: 404 })))),
    );
    const fetchJson = createFetchJson({ fetchImpl, now: () => Date.now() });
    const release = vi.fn(fetchJson.clear);
    const reader: PostingReader = { read: async () => ({ postings: [], sources: [] }) };
    const deps: ScanDeps = {
      fetchJson,
      reader,
      limiter: createLimiter({ gapMs: 0 }),
      now: Date.now,
      pause: () => Promise.resolve(),
      sources: { adele: false, github: false },
      knownBoards: async () => new Set<string>(),
      release,
    };
    const done = scanNow({ terms: ['Design Systems Engineer'], boardUrls: [] }, deps);
    await vi.waitFor(() => expect(fetchJson.inFlight()).toBe(MAX_FETCHES_IN_FLIGHT));
    expect(isScanning()).toBe(true);
    cancelScan();
    const asked = fetchImpl.mock.calls.length;
    // Let every read in flight answer: the run must not start another.
    while (pending.length) {
      pending.shift()!();
      await flush();
    }
    await done;
    expect(fetchImpl.mock.calls.length).toBe(asked);
    expect(isScanning()).toBe(false);
    expect(release).toHaveBeenCalledTimes(1);
    expect(fetchJson.cachedChars()).toBe(0);
    // Cut short, not finished: the next start picks it up.
    const s = getScanState();
    expect((s.startedAt ?? 0) > (s.finishedAt ?? 0)).toBe(true);
  });
});
