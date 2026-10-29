import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_PROBES_PER_SCAN,
  RUN_LEASE_MS,
  SCAN_EVERY_MS,
  followFound,
  getScanPostings,
  getScanState,
  ignoreFound,
  lastScannedLine,
  newCompanies,
  remoteOnly,
  resetScan,
  runScan,
  scanReader,
  shouldScan,
  type ScanDeps,
  type ScanInput,
} from './autoScan';
import { YC_HIRING_URL } from './companySource';
import { getAllDecided, muteCompany } from './decided';
import { createLimiter } from './probe';
import { FetchError, type FetchJson } from './sources/http';
import type { PostingReader } from './reader';
import type { FeedRequest } from './reader';
import type { Posting } from './types';
import { getSources } from '../sources';

const NOW = Date.parse('2026-10-28T12:00:00Z');

const posting = (over: Partial<Posting> & Pick<Posting, 'id' | 'title'>): Posting => ({
  source: 'greenhouse',
  company: 'Acme',
  url: `https://example.org/${over.id}`,
  location: 'Remote',
  mode: 'remote',
  text: '',
  ...over,
});

/** YC answers with the companies given; Greenhouse answers for the slugs given; all else 404. */
function network(yc: unknown[], greenhouse: string[] = [], extra: string[] = []): FetchJson {
  return vi.fn(async (url: string) => {
    if (url === YC_HIRING_URL) return yc;
    for (const slug of greenhouse)
      if (url.startsWith(`https://boards-api.greenhouse.io/v1/boards/${slug}/`))
        return { jobs: [{ id: 1 }] };
    for (const slug of extra)
      if (url.startsWith(`https://api.lever.co/v0/postings/${slug}`)) return [{ id: 'x' }];
    throw new FetchError(404, url);
  }) as unknown as FetchJson;
}

/** A reader that answers each board with the postings given for it, plus feed postings. */
function reader(byBoard: Record<string, Posting[]>, feeds: Posting[] = []) {
  const calls: FeedRequest[] = [];
  const r: PostingReader = {
    read: async (req) => {
      calls.push(req);
      const postings = [...feeds];
      for (const url of req.boardUrls) postings.push(...(byBoard[url] ?? []));
      return {
        postings,
        sources: [
          { key: 'hn|design systems', label: 'Hacker News', fetched: feeds.length },
          ...req.boardUrls.map((u) => ({ key: u, label: u, fetched: 1 })),
        ],
      };
    },
  };
  return { r, calls };
}

const ACME_BOARD = 'https://boards.greenhouse.io/acme';
const yc = (name: string, website: string) => ({
  name,
  website,
  one_liner: 'We build a design system for banks',
  status: 'Active',
  isHiring: true,
});

function deps(over: Partial<ScanDeps>): ScanDeps {
  return {
    fetchJson: network([]),
    reader: reader({}).r,
    limiter: createLimiter({ gapMs: 0 }),
    now: () => NOW,
    pause: () => Promise.resolve(),
    sources: { adele: false, github: false },
    ...over,
  };
}

const input: ScanInput = { terms: ['Design Systems Engineer'], boardUrls: [] };

beforeEach(() => {
  localStorage.clear();
  resetScan();
});

describe('shouldScan', () => {
  it('never scanned: scan', () => expect(shouldScan(getScanState(), NOW)).toBe(true));
  it('within 6 hours of the last run: wait; after: scan', () => {
    const s = { ...getScanState(), startedAt: NOW, finishedAt: NOW };
    expect(shouldScan(s, NOW + SCAN_EVERY_MS - 1)).toBe(false);
    expect(shouldScan(s, NOW + SCAN_EVERY_MS)).toBe(true);
  });
  it('a run cut short resumes on the next open; one another tab is making is left to it', () => {
    const s = { ...getScanState(), startedAt: NOW + 10, beatAt: NOW + 10, finishedAt: NOW };
    expect(shouldScan(s, NOW + 20)).toBe(false);
    expect(shouldScan(s, NOW + 10 + RUN_LEASE_MS)).toBe(true);
    // The first run ever, in another tab.
    expect(shouldScan({ ...getScanState(), startedAt: NOW, beatAt: NOW }, NOW + 5)).toBe(false);
  });
});

describe('remoteOnly (Adrian 2026-10-28)', () => {
  const p = (location: string, mode?: Posting['mode']) =>
    posting({ id: 'x', title: 't', location, mode });
  it.each([
    ['Remote', 'remote', 'keep'],
    ['Remote, US', undefined, 'keep'],
    ['New York', 'onsite', 'drop'],
    ['London (Hybrid)', undefined, 'drop'],
    ['San Francisco, CA', undefined, 'drop'],
    ['', undefined, 'unstated'],
    ['United States', undefined, 'unstated'],
    ['Worldwide', undefined, 'unstated'],
  ] as const)('%s (%s) → %s', (loc, mode, want) => expect(remoteOnly(p(loc, mode))).toBe(want));
});

describe('runScan', () => {
  it('finds a YC company, confirms its board, reads it and keeps remote design-system roles', async () => {
    const { r, calls } = reader({
      [ACME_BOARD]: [
        posting({ id: 'greenhouse:acme:1', title: 'Design Systems Engineer' }),
        posting({
          id: 'greenhouse:acme:2',
          title: 'Design Systems Lead',
          location: 'Paris',
          mode: 'onsite',
        }),
        posting({ id: 'greenhouse:acme:3', title: 'Backend Engineer' }),
        posting({
          id: 'greenhouse:acme:4',
          title: 'Design System Designer',
          location: '',
          mode: undefined,
        }),
      ],
    });
    const s = await runScan(
      input,
      deps({ fetchJson: network([yc('Acme', 'https://acme.com')], ['acme']), reader: r }),
    );
    expect(newCompanies(s)).toEqual([
      expect.objectContaining({ name: 'Acme', boardUrl: ACME_BOARD, confirmed: true, jobs: 2 }),
    ]);
    expect(calls[0]).toEqual({ terms: input.terms, boardUrls: [ACME_BOARD] });
    expect(getScanPostings().map((p) => [p.id, p.remoteUnstated ?? false])).toEqual([
      ['greenhouse:acme:1', false],
      ['greenhouse:acme:4', true],
    ]);
    expect(s).toMatchObject({ newCount: 2, notDesignSystem: 1, notRemote: 1, sourceCount: 2 });
    expect(s.finishedAt).toBe(NOW);
    expect(lastScannedLine(s, 'en-GB')).toMatch(/^Last scanned \d\d:\d\d · 2 new from 2 sources$/);
    // Where Review new has read, its counts are the one number shown (feed.ts countSources).
    expect(lastScannedLine(s, 'en-GB', { newToday: 5, sources: 1 })).toMatch(
      /^Last scanned \d\d:\d\d · 5 new from 1 source$/,
    );
    // With the scanned count (feed/scanningCount.ts), it leads and the answered count goes.
    expect(lastScannedLine(s, 'en-GB', { newToday: 5, sources: 1 }, 5214)).toMatch(
      /^Scanning 5,214 sources · Last scanned \d\d:\d\d, 5 new$/,
    );
    expect(lastScannedLine(s, 'en-GB', undefined, 1)).toMatch(
      /^Scanning 1 source · Last scanned \d\d:\d\d, 2 new$/,
    );
  });

  it('follows the profile: Remote only off keeps on-site roles; a leave-out word drops one', async () => {
    const feeds = [
      posting({ id: 'hn:1', source: 'hn', title: 'Design Systems Lead', mode: 'onsite' }),
      posting({ id: 'hn:2', source: 'hn', title: 'Design Systems Engineer (contract)' }),
      posting({ id: 'hn:3', source: 'hn', title: 'Design Systems Designer' }),
    ];
    const { r } = reader({}, feeds);
    await runScan(
      { ...input, remoteOnly: false, exclude: ['contract'] },
      deps({ reader: r, sources: { yc: false, adele: false, github: false } }),
    );
    expect(getScanPostings().map((p) => p.id)).toEqual(['hn:1', 'hn:3']);
  });

  it('a board the identity check does not trust is shown but never read', async () => {
    const { r, calls } = reader({});
    // Forward's website is goforward.com: a "forward" board on Greenhouse and Lever is a stranger's.
    const s = await runScan(
      input,
      deps({
        fetchJson: network([yc('Forward', 'https://goforward.com')], ['forward'], ['forward']),
        reader: r,
      }),
    );
    expect(newCompanies(s)).toEqual([
      expect.objectContaining({ name: 'Forward', confirmed: false }),
    ]);
    expect(calls[0].boardUrls).toEqual([]);
  });

  it('reads every followed board and every feed with no lead at all', async () => {
    const feed = posting({
      id: 'hn:1',
      source: 'hn',
      title: 'Design Systems Engineer',
      company: 'Kite',
    });
    const { r, calls } = reader({}, [feed]);
    const s = await runScan({ ...input, boardUrls: [ACME_BOARD] }, deps({ reader: r }));
    expect(calls[0].boardUrls).toEqual([ACME_BOARD]);
    expect(getScanPostings().map((p) => p.id)).toEqual(['hn:1']);
    expect(s.newCount).toBe(1);
    // The same posting next run is not new.
    expect((await runScan(input, deps({ reader: r }))).newCount).toBe(0);
  });

  it('probes at most MAX_PROBES_PER_SCAN leads a run; the rest wait in the queue', async () => {
    const many = Array.from({ length: MAX_PROBES_PER_SCAN + 5 }, (_, i) =>
      yc(`Company ${i}`, `https://c${i}.com`),
    );
    const s = await runScan(
      input,
      deps({ fetchJson: network(many), sources: { adele: false, github: false } }),
    );
    // ycMatches caps at MAX_YC_LEADS (30) anyway, so all of them fit; Adele fills the queue.
    expect(s.queue.length).toBe(0);
    const big = await runScan(input, deps({ sources: { yc: false, github: false } }));
    expect(big.queue.length).toBeGreaterThan(0);
    expect(Object.keys(big.probed).length).toBeGreaterThanOrEqual(MAX_PROBES_PER_SCAN);
  });

  it('a lead probed once is not probed again on the next run', async () => {
    const fetchJson = network([yc('Acme', 'https://acme.com')], ['acme']);
    await runScan(input, deps({ fetchJson }));
    const calls = (fetchJson as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    await runScan(input, deps({ fetchJson }));
    // Only YC's list is read again.
    expect((fetchJson as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls + 1);
  });

  it('cancelled while probing: unanswered leads stay queued and the next open resumes', async () => {
    const ctl = new AbortController();
    const fetchJson = vi.fn(async (url: string) => {
      if (url === YC_HIRING_URL)
        return [yc('Acme', 'https://acme.com'), yc('Bolt', 'https://bolt.com')];
      ctl.abort();
      throw new FetchError(404, url);
    }) as unknown as FetchJson;
    const { r, calls } = reader({});
    const s = await runScan(input, deps({ fetchJson, reader: r }), { signal: ctl.signal });
    expect(calls).toHaveLength(0);
    expect(s.finishedAt).toBeUndefined();
    expect(getScanState().queue.map((l) => l.name)).toEqual(expect.arrayContaining(['Bolt']));
    expect(shouldScan(getScanState(), NOW + RUN_LEASE_MS)).toBe(true);
  });

  it('uses the profile’s must include when it has one', async () => {
    const feed = [
      posting({ id: 'hn:1', source: 'hn', title: 'Webflow Developer' }),
      posting({ id: 'hn:2', source: 'hn', title: 'Design Systems Engineer' }),
    ];
    await runScan({ ...input, include: ['webflow'] }, deps({ reader: reader({}, feed).r }));
    expect(getScanPostings().map((p) => p.id)).toEqual(['hn:1']);
  });
});

describe('New companies: Follow and Ignore', () => {
  async function scanAcme() {
    const { r } = reader({
      [ACME_BOARD]: [posting({ id: 'greenhouse:acme:1', title: 'Design Systems Engineer' })],
    });
    await runScan(
      input,
      deps({ fetchJson: network([yc('Acme', 'https://acme.com')], ['acme']), reader: r }),
    );
  }

  it('Follow adds the board to the Sources; Undo takes it back', async () => {
    await scanAcme();
    const undo = followFound('acme');
    expect(getSources().map((s) => [s.kind, s.ref, s.label])).toEqual([
      ['greenhouse', 'acme', 'Acme'],
    ]);
    expect(newCompanies(getScanState())).toEqual([]);
    undo();
    expect(getSources()).toEqual([]);
    expect(newCompanies(getScanState())).toHaveLength(1);
  });

  it('Follow of a board already followed adds nothing, and its Undo keeps it', async () => {
    await scanAcme();
    followFound('acme');
    const undo = followFound('acme');
    undo();
    expect(getSources()).toHaveLength(1);
  });

  it('Ignore mutes the company and keeps its postings out of Review; Undo brings them back', async () => {
    await scanAcme();
    const empty: PostingReader = { read: async () => ({ postings: [], sources: [] }) };
    const read = () => scanReader(empty).read({ terms: [], boardUrls: [] });
    expect((await read()).postings.map((p) => p.id)).toEqual(['greenhouse:acme:1']);
    const undo = ignoreFound('acme');
    expect(getAllDecided().muted).toEqual(['Acme']);
    expect((await read()).postings).toEqual([]);
    undo();
    expect(getAllDecided().muted).toEqual([]);
    expect((await read()).postings).toHaveLength(1);
  });
});

describe('scanReader', () => {
  const live = (postings: Posting[]): PostingReader => ({
    read: async () => ({ postings, sources: [] }),
  });

  it('adds the scan’s postings to the live read, once each; the live read is left as it is', async () => {
    const { r } = reader({}, [
      posting({ id: 'hn:1', source: 'hn', title: 'Design Systems Engineer' }),
      posting({
        id: 'hn:2',
        source: 'hn',
        title: 'Design Systems Lead',
        location: '',
        mode: undefined,
      }),
    ]);
    await runScan(input, deps({ reader: r }));
    const onsite = posting({
      id: 'lever:x:1',
      source: 'lever',
      title: 'Welder',
      mode: 'onsite',
      location: 'Spokane',
    });
    const out = await scanReader(
      live([posting({ id: 'hn:1', source: 'hn', title: 'Design Systems Engineer' }), onsite]),
    ).read({ terms: [], boardUrls: [] });
    expect(out.postings.map((p) => [p.id, p.remoteUnstated ?? false])).toEqual([
      ['hn:1', false],
      ['lever:x:1', false],
      ['hn:2', true],
    ]);
  });
});

describe('Undo leaves what was there before', () => {
  async function scanAcme() {
    const { r } = reader({});
    await runScan(
      input,
      deps({ fetchJson: network([yc('Acme', 'https://acme.com')], ['acme']), reader: r }),
    );
  }

  it('Ignore then Undo keeps a mute the user set earlier', async () => {
    await scanAcme();
    muteCompany('Acme');
    ignoreFound('acme')();
    expect(getAllDecided().muted).toEqual(['Acme']);
  });
});
