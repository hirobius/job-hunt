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

describe('a phone reads Greenhouse boards without descriptions', () => {
  const read = async () => {
    const asked: string[] = [];
    const fetchJson = vi.fn(async (url: string) => {
      asked.push(url);
      return url.includes('greenhouse') ? { jobs: [] } : { hits: [], jobs: [] };
    });
    await fetchFeed(
      { terms: ['Design Systems Engineer'], boardUrls: ['https://boards.greenhouse.io/acme'] },
      fetchJson,
      { kv: { get: () => null, set: () => {} } },
    );
    return asked.filter((u) => u.includes('greenhouse'));
  };

  it('light: the plain list', async () => {
    setLightBoards(true);
    expect(await read()).toEqual(['https://boards-api.greenhouse.io/v1/boards/acme/jobs']);
  });

  it('desk: the list with content, as before', async () => {
    setLightBoards(false);
    expect(await read()).toEqual([
      'https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true',
    ]);
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
