import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADELE, adeleNames, watchAdeleBoards } from './adele';
import { memoryKv } from './fetchFeed';
import { FetchError, type FetchJson } from './sources/http';
import { addCategory, getCurationState, replaceCurationState } from '../curation/curationStore';
import { EMPTY_CURATION } from '../curation/types';
import { boardUrlsFor } from './watchlist';

describe('the Adele snapshot', () => {
  it('is UXPin’s MIT list: company names and sites, deduped, every site http(s)', () => {
    expect(ADELE.license).toMatch(/^MIT/);
    expect(ADELE.licenseText).toMatch(/Permission is hereby granted, free of charge/);
    expect(ADELE.source).toBe('https://github.com/uxpin/adele');
    expect(ADELE.companies.length).toBeGreaterThan(90);
    const names = ADELE.companies.map((c) => c.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    for (const c of ADELE.companies)
      expect(c.site === '' || /^https?:\/\//.test(c.site)).toBe(true);
    expect(names).toEqual(expect.arrayContaining(['shopify', 'atlassian', 'github']));
  });

  it('gives the probe only names it can read', () => {
    const names = adeleNames();
    expect(names.length).toBeGreaterThan(90);
    expect(names).toContain('Shopify');
    expect(names).not.toEqual(expect.arrayContaining(['Estonia']));
    expect(names.map((n) => n.toLowerCase())).not.toContain('gov.uk');
  });
});

describe('watchAdeleBoards', () => {
  let cat: string;
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    replaceCurationState(EMPTY_CURATION);
    cat = addCategory({ label: 'Design Systems', seniority: 'any' });
  });
  afterEach(() => vi.useRealTimers());

  const live: Record<string, unknown> = {
    'https://boards-api.greenhouse.io/v1/boards/figma/jobs': { jobs: [{}] },
    'https://api.ashbyhq.com/posting-api/job-board/acme': { jobs: [{}, {}] },
  };
  const world: FetchJson = async (url) => {
    if (url in live) return live[url];
    if (url.includes('flaky')) throw new FetchError(503, url);
    throw new FetchError(404, url);
  };

  it('watches every live board it finds, as it finds them, and says what came of the rest', async () => {
    const seen: number[] = [];
    const p = watchAdeleBoards(cat, ['Figma', 'Acme', 'Nobody', 'flaky'], {
      fetchJson: world,
      kv: memoryKv(),
      boardUrls: [],
      onProgress: (s) => seen.push(s.done),
    });
    await vi.advanceTimersByTimeAsync(600_000);
    const r = await p;
    expect(r).toMatchObject({ watched: 2, missed: 1, unknown: 1, alreadyWatched: 0, total: 4 });
    expect(boardUrlsFor(cat, getCurationState()).sort()).toEqual([
      'https://boards.greenhouse.io/figma',
      'https://jobs.ashbyhq.com/acme',
    ]);
    expect(seen[seen.length - 1]).toBe(4);
  });

  it('leaves boards the track already watches alone', async () => {
    const p = watchAdeleBoards(cat, ['Figma'], {
      fetchJson: world,
      kv: memoryKv(),
      boardUrls: ['https://boards.greenhouse.io/figma'],
    });
    await vi.advanceTimersByTimeAsync(600_000);
    expect(await p).toMatchObject({ watched: 0, alreadyWatched: 1 });
  });
});
