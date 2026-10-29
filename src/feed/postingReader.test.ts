import { describe, expect, it } from 'vitest';
import type { StoredPosting } from '../tracks/postings';
import { mergePostings, postingFromRow, readPostings, serverReader } from './postingReader';
import type { Posting } from './types';

const posting = (id: string, url: string, over: Partial<Posting> = {}): Posting => ({
  id,
  source: 'greenhouse',
  title: `Role ${id}`,
  company: 'Acme',
  url,
  location: '',
  text: 'body',
  ...over,
});

const row = (sourceId: string, url: string, over: Partial<StoredPosting> = {}): StoredPosting => ({
  id: 1,
  trackSlug: 'design-systems',
  source: 'greenhouse',
  sourceId,
  company: 'Acme',
  title: `Role ${sourceId}`,
  location: 'Remote',
  url,
  score: 90,
  verdict: 'queue',
  reasons: ['title match: /design systems?/'],
  fingerprint: `acme::role ${sourceId}`,
  ...over,
});

const reader = (list: Posting[]) => ({ read: async () => list });

describe('mergePostings: the server adapter adds, never takes away', () => {
  it('keeps every browser posting as it is and adds the server ones it did not find', () => {
    const browser = [
      posting('greenhouse:acme:1', 'https://boards.greenhouse.io/acme/jobs/1'),
      posting('hn:42', 'https://news.ycombinator.com/item?id=42', { source: 'hn' }),
    ];
    const server = [
      // Same id as the browser's.
      posting('greenhouse:acme:1', 'https://boards.greenhouse.io/acme/jobs/1', { text: '' }),
      // Same link under another id (utm noise and a trailing slash).
      posting('rss:ds-9', 'https://news.ycombinator.com/item?id=42&utm_source=x', {
        source: 'rss',
      }),
      // New.
      posting('workable:acme:w1', 'https://apply.workable.com/acme/j/w1', { source: 'workable' }),
    ];
    const out = mergePostings(browser, server);
    // The browser's own objects, in order.
    browser.forEach((p, i) => expect(out[i]).toBe(p));
    expect(out.map((p) => p.id)).toEqual(['greenhouse:acme:1', 'hn:42', 'workable:acme:w1']);
  });

  it('breadth guard: signed in is never fewer postings than the browser alone', async () => {
    // Recorded-style inputs: a browser read, and server reads that overlap, duplicate, are empty,
    // or fail outright.
    const browser = Array.from({ length: 40 }, (_, i) =>
      posting(`greenhouse:acme:${i}`, `https://boards.greenhouse.io/acme/jobs/${i}`),
    );
    const servers: { read: () => Promise<Posting[]> }[] = [
      reader([]),
      reader(browser.slice(0, 10)),
      reader([...browser, ...browser]),
      reader([
        ...browser.slice(5, 15).map((p) => ({ ...p, id: `other:${p.id}` })),
        posting('lever:x:1', 'https://jobs.lever.co/x/1', { source: 'lever' }),
      ]),
      { read: () => Promise.reject(new Error('relation "postings" does not exist')) },
    ];
    for (const server of servers) {
      const { postings, fromServer } = await readPostings({ browser: reader(browser), server });
      expect(postings.length).toBeGreaterThanOrEqual(browser.length);
      expect(postings.slice(0, browser.length)).toEqual(browser);
      expect(new Set(postings.map((p) => p.id)).size).toBe(postings.length);
      expect(fromServer).toBe(postings.length - browser.length);
    }
    const alone = await readPostings({ browser: reader(browser) });
    expect(alone.postings).toEqual(browser);
  });

  it('a server that fails reads as nothing extra and says why', async () => {
    const r = await readPostings({
      browser: reader([posting('a', 'https://a.example/1')]),
      server: { read: () => Promise.reject(new Error('offline')) },
    });
    expect(r.postings).toHaveLength(1);
    expect(r.serverError).toContain('offline');
  });
});

describe('the server adapter', () => {
  it("reads rows as Postings carrying the server's score; RSS ids get their prefix", async () => {
    const list = await serverReader(async () => [
      row('greenhouse:acme:1', 'https://boards.greenhouse.io/acme/jobs/1', { remote: true }),
      row('ds-1', 'https://designsystems.jobs/1', { source: 'rss', verdict: 'review', score: 50 }),
      row('adzuna:x', 'https://x.example', { source: 'adzuna' }),
      row('j', 'https://j.example', { source: 'jsearch' }),
    ]).read();
    // jsearch is never read: no name for it.
    expect(list).toHaveLength(3);
    expect(list[2]).toMatchObject({ id: 'adzuna:x', source: 'adzuna' });
    expect(list[0]).toMatchObject({
      id: 'greenhouse:acme:1',
      source: 'greenhouse',
      mode: 'remote',
      trackScore: { score: 90, verdict: 'queue', reasons: ['title match: /design systems?/'] },
    });
    expect(list[1]).toMatchObject({ id: 'rss:ds-1', source: 'rss' });
    expect(postingFromRow(row('y', 'https://y.example', { source: 'manual' }))).toBeNull();
  });
});
