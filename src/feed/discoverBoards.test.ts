import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { discoverBoards, MAX_LIST, parseList, type DiscoverOptions } from './discoverBoards';
import { memoryKv } from './fetchFeed';
import { FetchError, type FetchJson } from './sources/http';

describe('parseList', () => {
  it('reads names, slugs and board URLs, one per line', () => {
    const r = parseList('Acme Labs\nstripe\nhttps://jobs.lever.co/plaid\n\n  Ramp  ');
    expect(r.lines).toEqual(['Acme Labs', 'stripe', 'https://jobs.lever.co/plaid', 'Ramp']);
    expect(r.ignored).toEqual([]);
    expect(r.trimmed).toBe(0);
  });
  it('sets junk lines aside instead of probing them', () => {
    const r = parseList('Acme\n!!!\nhttps://example.com/careers\nnot/a/slug');
    expect(r.lines).toEqual(['Acme']);
    expect(r.ignored).toEqual(['!!!', 'https://example.com/careers', 'not/a/slug']);
  });
  it('drops duplicates, ignoring case', () => {
    expect(parseList('Acme\nACME\nacme ').lines).toEqual(['Acme']);
  });
  it('trims a list over 500 and says how many were left out', () => {
    const text = Array.from({ length: 520 }, (_, i) => `co${i}`).join('\n');
    const r = parseList(text);
    expect(r.lines).toHaveLength(MAX_LIST);
    expect(r.trimmed).toBe(20);
  });
});

describe('discoverBoards', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const live: Record<string, unknown> = {
    'https://boards-api.greenhouse.io/v1/boards/figma/jobs': { jobs: [{}, {}, {}] },
    'https://api.lever.co/v0/postings/plaid?mode=json': [{}],
  };
  const world: FetchJson = async (url) => {
    if (url in live) return live[url];
    if (url.includes('flaky')) throw new FetchError(503, url);
    throw new FetchError(404, url);
  };
  const run = async (text: string, extra: Partial<DiscoverOptions> = {}) => {
    const p = discoverBoards(parseList(text).lines, { fetchJson: world, kv: memoryKv(), ...extra });
    await vi.advanceTimersByTimeAsync(600_000);
    return p;
  };

  it('sorts companies into found, missed and unknown', async () => {
    const r = await run('Figma\nPlaid\nNobody Inc\nflaky');
    expect(r.found.map((f) => [f.company, f.board.kind, f.board.slug, f.jobs])).toEqual(
      expect.arrayContaining([
        ['Figma', 'greenhouse', 'figma', 3],
        ['Plaid', 'lever', 'plaid', 1],
      ]),
    );
    expect(r.found).toHaveLength(2);
    expect(r.missed).toEqual(['Nobody Inc']);
    expect(r.unknown).toEqual(['flaky']);
    expect(r.done).toBe(4);
    expect(r.total).toBe(4);
  });

  it('leaves out boards the track already watches, and says so', async () => {
    const r = await run('Figma\nPlaid', { watched: [{ kind: 'lever', slug: 'Plaid' }] });
    expect(r.found.map((f) => f.company)).toEqual(['Figma']);
    expect(r.alreadyWatched).toEqual(['Plaid']);
  });

  it('reports progress as each company answers', async () => {
    const seen: number[] = [];
    await run('Figma\nPlaid\nNobody', { onProgress: (s) => seen.push(s.done) });
    expect(seen).toEqual([1, 2, 3]);
  });

  it('stops on abort and returns what it has', async () => {
    const ac = new AbortController();
    const names = Array.from({ length: 50 }, (_, i) => `co${i}`).join('\n');
    const r = await run(names, {
      signal: ac.signal,
      onProgress: (s) => s.done === 2 && ac.abort(),
    });
    expect(r.done).toBeLessThan(50);
    expect(r.done).toBeGreaterThanOrEqual(2);
  });

  it('handles 20 names and the retry of just the unknown ones', async () => {
    const names = ['Figma', ...Array.from({ length: 18 }, (_, i) => `none${i}`), 'flaky'];
    const first = await run(names.join('\n'));
    expect(first.done).toBe(20);
    expect(first.unknown).toEqual(['flaky']);
    const again = await run(first.unknown.join('\n'));
    expect(again.total).toBe(1);
  });
});
