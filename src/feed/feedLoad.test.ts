// Review new's load on a phone (2026-11-07): signed in it reads the server's rows (the browser sweep
// only when there are none or the server fails); a phone reads Greenhouse boards without
// descriptions; and a posting's text is fetched when it is opened.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { resultFromRows, serverFirstReader } from './serverFeed';
import { fetchFeed } from './fetchFeed';
import { setLightBoards } from './lightBoards';
import { greenhouseRef, loadPostingText, resetPostingTexts, usePostingText } from './postingText';
import type { StoredPosting } from '../tracks/postings';
import type { PostingReader } from './reader';
import type { Posting } from './types';
import { rankAll } from './match';
import { passesInclude } from './mustInclude';
import { designSystemRule } from './profile';

const row = (n: number, company = 'Acme'): StoredPosting => ({
  id: n,
  trackSlug: 'design-systems',
  source: 'greenhouse',
  sourceId: `greenhouse:acme:${n}`,
  company,
  title: `Design Systems Engineer ${n}`,
  location: 'Remote',
  remote: true,
  url: `https://boards.greenhouse.io/acme/jobs/${n}`,
  score: 80,
  verdict: 'queue',
  reasons: [],
  fingerprint: `acme::design systems engineer ${n}`,
});
const req = {
  terms: ['Design Systems Engineer'],
  boardUrls: ['https://boards.greenhouse.io/acme'],
};

afterEach(() => {
  setLightBoards(null);
  resetPostingTexts();
});

describe('signed in: the server rows first', () => {
  it('reads the rows and never sweeps the boards when there are some', async () => {
    const fallback: PostingReader = { read: vi.fn() };
    const r = await serverFirstReader(fallback, async () => [row(1), row(2), row(3, 'Beta')]).read(
      req,
    );
    expect(fallback.read).not.toHaveBeenCalled();
    expect(r.postings.map((p) => p.id)).toEqual([
      'greenhouse:acme:1',
      'greenhouse:acme:2',
      'greenhouse:acme:3',
    ]);
    // One source per company and source.
    expect(r.sources.map((s) => [s.label, s.fetched])).toEqual([
      ['Acme (Greenhouse)', 2],
      ['Beta (Greenhouse)', 1],
    ]);
  });

  it('falls back to the browser read with no rows yet, or when the server fails', async () => {
    const browser = { postings: [], sources: [{ key: 'hn', label: 'HN', fetched: 0 }] };
    const fallback: PostingReader = { read: vi.fn(async () => browser) };
    expect(await serverFirstReader(fallback, async () => []).read(req)).toBe(browser);
    expect(
      await serverFirstReader(fallback, async () => {
        throw new Error('no table');
      }).read(req),
    ).toBe(browser);
    expect(fallback.read).toHaveBeenCalledTimes(2);
  });

  it('a row with a source the app has no name for is left out', () => {
    expect(resultFromRows([{ ...row(1), source: 'nope' }]).postings).toEqual([]);
  });
});

describe('a phone reads Greenhouse boards without descriptions, and ranks as a full read', () => {
  const include = designSystemRule({ terms: [], atsOff: [] });
  const JOBS = [
    {
      id: 1,
      title: 'Senior Design Systems Engineer',
      content: 'Contract role. Build our design system.',
    },
    { id: 2, title: 'Backend Engineer', content: 'Go and Postgres.' },
    {
      id: 3,
      title: 'Design Systems Lead',
      content: 'Be our founding designer and build the design system from scratch.',
    },
  ].map((j) => ({
    ...j,
    absolute_url: `https://boards.greenhouse.io/acme/jobs/${j.id}`,
    location: { name: 'Remote' },
    first_published: '2026-11-01T00:00:00Z',
  }));
  const network = (asked: string[]) =>
    vi.fn(async (url: string) => {
      asked.push(url);
      const one = /\/jobs\/(\d+)$/.exec(url);
      if (one) return JOBS.find((j) => String(j.id) === one[1]);
      if (url.endsWith('/jobs?content=true')) return { jobs: JOBS };
      if (url.endsWith('/jobs')) return { jobs: JOBS.map(({ content: _c, ...j }) => j) };
      return { hits: [], jobs: [] };
    });
  const read = async (light: boolean) => {
    setLightBoards(light);
    const asked: string[] = [];
    const out = await fetchFeed(
      {
        terms: ['Design Systems Engineer'],
        boardUrls: ['https://boards.greenhouse.io/acme'],
        include,
      },
      network(asked),
      { kv: { get: () => null, set: () => {} } },
    );
    return { out, asked: asked.filter((u) => u.includes('greenhouse')) };
  };

  it('light: the plain list, then the description of each posting the check lets in', async () => {
    const { asked } = await read(true);
    expect(asked.sort()).toEqual([
      'https://boards-api.greenhouse.io/v1/boards/acme/jobs',
      'https://boards-api.greenhouse.io/v1/boards/acme/jobs/1',
      'https://boards-api.greenhouse.io/v1/boards/acme/jobs/3',
    ]);
  });

  it('desk: the list with content, as before', async () => {
    const { asked } = await read(false);
    expect(asked).toEqual(['https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true']);
  });

  it('every posting that can be listed ranks as it does on a full read: score, signals, snippet', async () => {
    const pick = (ps: Posting[]) =>
      rankAll(ps, { where: '', mode: 'any', now: Date.parse('2026-11-07T00:00:00Z') })
        .filter((p) => passesInclude(include, p.title, ''))
        .map((p) => ({
          id: p.id,
          score: p.score,
          signals: p.signals.map((x) => x.id),
          snippet: p.snippet,
        }));
    const full = pick((await read(false)).out.postings);
    const light = pick((await read(true)).out.postings);
    expect(full.length).toBe(2);
    expect(full.some((p) => p.signals.length > 0)).toBe(true);
    expect(light).toEqual(full);
  });

  it('a check that reads descriptions keeps the full read', async () => {
    setLightBoards(true);
    const asked: string[] = [];
    await fetchFeed(
      {
        terms: ['x'],
        boardUrls: ['https://boards.greenhouse.io/acme'],
        include: ['design system'],
      },
      network(asked),
      { kv: { get: () => null, set: () => {} } },
    );
    expect(asked.filter((u) => u.includes('greenhouse'))).toEqual([
      'https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true',
    ]);
  });
});

describe('server rows carry their stored text, and only the request’s', () => {
  it('a row’s stored description is the posting’s text', () => {
    expect(
      resultFromRows([{ ...row(1), descriptionText: 'Own the system.' }]).postings[0].text,
    ).toBe('Own the system.');
  });

  it('keeps the request’s boards, and feeds only when it searches a title; says its progress', async () => {
    const rows = [
      { ...row(1), board: 'greenhouse:acme' },
      { ...row(2, 'Beta'), sourceId: 'greenhouse:beta:2', board: 'greenhouse:beta' },
      { ...row(3, 'HN'), source: 'hn', sourceId: 'hn:3', board: 'hn' },
    ];
    const onProgress = vi.fn();
    const reader = serverFirstReader({ read: vi.fn() }, async () => rows);
    const all = await reader.read(req, onProgress);
    expect(all.postings.map((p) => p.id)).toEqual(['greenhouse:acme:1', 'hn:3']);
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ boardsDone: 1, boardsTotal: 1, postings: all.postings }),
    );
    const boardsOnly = await reader.read({ terms: [], boardUrls: req.boardUrls });
    expect(boardsOnly.postings.map((p) => p.id)).toEqual(['greenhouse:acme:1']);
  });
});

describe("a posting's text, on open", () => {
  it('reads Greenhouse’s single job when the posting has none, once', async () => {
    const fetchJson = vi.fn(async () => ({ content: '&lt;p&gt;Own the design system.&lt;/p&gt;' }));
    const p = { id: 'greenhouse:acme:7', text: '' };
    expect(await loadPostingText(p, fetchJson)).toBe('Own the design system.');
    expect(await loadPostingText(p, fetchJson)).toBe('Own the design system.');
    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(fetchJson).toHaveBeenCalledWith(
      'https://boards-api.greenhouse.io/v1/boards/acme/jobs/7',
    );
  });

  it('keeps a posting’s own text, and has none to fetch for other sources', async () => {
    const fetchJson = vi.fn();
    expect(await loadPostingText({ id: 'greenhouse:acme:7', text: 'Mine' }, fetchJson)).toBe(
      'Mine',
    );
    expect(await loadPostingText({ id: 'hn:1', text: '' }, fetchJson)).toBe('');
    expect(fetchJson).not.toHaveBeenCalled();
    expect(greenhouseRef('lever:acme:1')).toBeNull();
  });

  it('usePostingText says it is loading, then gives the text', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ content: 'Hello' }), { status: 200 }),
    );
    const wrap = ({ children }: { children: ReactNode }) => createElement('div', null, children);
    const { result } = renderHook(() => usePostingText({ id: 'greenhouse:acme:9', text: '' }), {
      wrapper: wrap,
    });
    expect(result.current).toEqual({ text: '', loading: true });
    await waitFor(() => expect(result.current).toEqual({ text: 'Hello', loading: false }));
    vi.restoreAllMocks();
  });
});
