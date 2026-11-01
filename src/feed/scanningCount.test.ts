// "Scanning N sources" (#src-bulk): each board once under the sync's key, each feed once, the
// board set only when it is loaded (signed in). No network.
import { beforeEach, describe, expect, it } from 'vitest';
import raw from './data/boards.json';
import { boardSetKeys, parseBoardSet } from './boardSet';
import { fetchFeed, memoryKv, SOURCE_ENABLED } from './fetchFeed';
import { feedKeys, loadBoardSetKeys, resetBoardSetKeys, scanningCount } from './scanningCount';
import { FetchError, type FetchJson } from './sources/http';

beforeEach(resetBoardSetKeys);

describe('feedKeys', () => {
  it('is every feed fetchFeed reads for a search', async () => {
    const none = (async (url: string) => {
      throw new FetchError(404, url);
    }) as FetchJson;
    const read = await fetchFeed({ term: 'design systems', boardUrls: [] }, none, {
      kv: memoryKv(),
    });
    expect(feedKeys().sort()).toEqual(read.sources.map((s) => s.key).sort());
  });

  it('follows the switches', () => {
    const off = Object.fromEntries(Object.keys(SOURCE_ENABLED).map((k) => [k, false]));
    expect(feedKeys(off)).toEqual(['hn', 'remotive']);
    expect(feedKeys({ ...off, dsjobs: true, jobicy: true })).toEqual([
      'hn',
      'remotive',
      'jobicy',
      'dsjobs',
    ]);
  });
});

describe('scanningCount', () => {
  const feeds = ['hn', 'remotive'];
  it('counts each board once by the sync’s key, and only links that are boards', () => {
    expect(
      scanningCount({
        boardUrls: [
          'https://boards.greenhouse.io/Acme',
          'https://job-boards.greenhouse.io/acme',
          'https://jobs.lever.co/beta',
          'https://jobs.eu.lever.co/beta',
          'https://example.com/careers',
        ],
        feeds,
      }),
    ).toBe(2 + 3);
  });

  it('adds the board set, without counting a followed board in it twice', () => {
    const setKeys = new Set(['greenhouse:acme', 'ashby:ramp', 'lever.eu:beta']);
    expect(
      scanningCount({
        boardUrls: ['https://boards.greenhouse.io/ACME', 'https://jobs.lever.co/beta'],
        setKeys,
        feeds,
      }),
    ).toBe(3 + 1 + 2);
  });

  it('with nothing followed and signed out, is the feeds', () => {
    expect(scanningCount({ boardUrls: [] })).toBe(feedKeys().length);
  });
});

describe('loadBoardSetKeys', () => {
  it('loads the committed snapshot’s keys once', async () => {
    const keys = await loadBoardSetKeys();
    expect([...keys]).toEqual(boardSetKeys(parseBoardSet(raw)));
    expect(await loadBoardSetKeys()).toBe(keys);
  });
});
