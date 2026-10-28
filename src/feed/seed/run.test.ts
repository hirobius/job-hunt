import { describe, expect, it } from 'vitest';
import seedBoardsFile from '../data/ds-seed-boards.json';
import { createLimiter } from '../probe';
import { parseBoardUrl } from '../sources/ats';
import { FetchError, type FetchJson } from '../sources/http';
import { SEED_SOURCES } from './parse';
import {
  AWESOME_README,
  DSJ_FEED,
  DSJ_SITEMAP,
  buildSnapshot,
  MAX_SEED_JOBS,
  seedBoards,
  type Snapshot,
} from './run';
import { distinctName } from './resolve';

/** Ordinary words a description pattern once confirmed (PR #421 review). */
const WEAK_NAMES = [
  'Close',
  'Arrive',
  'Promise',
  'Super',
  'Imprint',
  'Instrument',
  'Kindred',
  'Ledger',
  'Persona',
];

const TEXT: Record<string, string> = {
  [AWESOME_README]: '| [Polaris (Shopify)](https://polaris.shopify.com) | 👍 |',
  [DSJ_FEED]: '<rss></rss>',
  [DSJ_SITEMAP]:
    '<loc>https://designsystems.jobs/companies/pennylane</loc><loc>https://designsystems.jobs/companies/pennylane/design-system-designer</loc>',
};
const JSON_ANSWERS: Record<string, unknown> = {
  // Shopify's board names its site; Pennylane's lists the job designsystems.jobs saw.
  'https://boards-api.greenhouse.io/v1/boards/shopify/jobs': {
    jobs: [{ title: 'Staff Engineer', absolute_url: 'https://www.shopify.com/careers/1' }],
  },
  'https://api.ashbyhq.com/posting-api/job-board/pennylane': {
    jobs: [{ title: 'Design System Designer' }],
  },
  // Dropbox: a board under the slug that nothing ties to the company.
  'https://api.lever.co/v0/postings/dropbox?mode=json': [{ text: 'Baker' }],
};

const fetchJson: FetchJson = async (url) => {
  if (url in JSON_ANSWERS) return JSON_ANSWERS[url];
  if (url.includes('api.github.com')) throw new FetchError(403, url);
  if (url.includes('hn.algolia.com')) return { hits: [] };
  throw new FetchError(404, url);
};

const run = () =>
  buildSnapshot({
    adele: { companies: [{ name: 'Dropbox', site: 'http://dropbox.github.io/scooter' }] },
    fetchText: async (u) => {
      if (u in TEXT) return TEXT[u];
      throw new FetchError(404, u);
    },
    fetchJson,
    now: () => new Date('2026-10-28T10:00:00Z'),
    limiter: createLimiter({ gapMs: 0 }),
    githubPages: 1,
  });

describe('buildSnapshot', () => {
  it('reads every source, resolves each company, and watches only confirmed boards', async () => {
    const s = await run();
    expect(s.generated).toBe('2026-10-28');
    expect(s.sources.map((r) => [r.id, r.companies, r.error])).toEqual([
      ['adele', 1, ''],
      ['awesome', 1, ''],
      ['dsjobs', 1, ''],
      ['hn', 0, ''],
      ['github', 0, 'HTTP 403'],
    ]);
    expect(s.counts).toEqual({ companies: 3, boards: 3, confirmed: 2, watched: 2 });
    expect(s.companies.map((c) => [c.name, c.board?.slug, c.board?.confirmed])).toEqual([
      ['Shopify', 'shopify', 'domain'],
      ['Pennylane', 'pennylane', 'title'],
      ['Dropbox', 'dropbox', null],
    ]);
    expect(s.companies[0].licence).toEqual([SEED_SOURCES.awesome.licence]);
    expect(seedBoards(s)).toEqual([
      'https://boards.greenhouse.io/shopify',
      'https://jobs.ashbyhq.com/pennylane',
    ]);
  });
});

describe('the committed seed', () => {
  // Read lazily: the full snapshot is ~300 KB and only this test needs it.
  const snapshot = async () =>
    (await import('../data/ds-companies.json')).default as unknown as Snapshot;

  it('the watched list is exactly the snapshot’s confirmed boards', async () => {
    const s = await snapshot();
    expect(seedBoardsFile).toEqual(seedBoards(s));
    expect(s.counts.watched).toBe(seedBoardsFile.length);
    seedBoardsFile.forEach((u) => expect(parseBoardUrl(u), u).not.toBeNull());
  });

  it('watches no board above MAX_SEED_JOBS roles, and no ordinary-word name confirmed by a description', async () => {
    const s = await snapshot();
    const watched = new Set(seedBoardsFile);
    const big = s.companies.filter((c) => c.board?.confirmed && c.board.jobs > MAX_SEED_JOBS);
    expect(big.length).toBeGreaterThan(0);
    big.forEach((c) => expect(watched.has(c.board!.url), c.name).toBe(false));
    for (const name of WEAK_NAMES) {
      const c = s.companies.find((x) => x.name === name);
      expect(c?.board?.confirmed ?? null, name).toBeNull();
    }
    // Lever and Ashby boards have no name of their own: a `name` there is the description rule.
    s.companies
      .filter((c) => c.board?.confirmed === 'name' && ['lever', 'ashby'].includes(c.board.kind))
      .forEach((c) => expect(distinctName(c.name), c.name).toBe(true));
  });

  it('every company carries its evidence and the licence of each source it came from', async () => {
    const s = await snapshot();
    const licences = new Set(Object.values(SEED_SOURCES).map((x) => x.licence));
    for (const c of s.companies) {
      expect(c.evidence.length, c.name).toBeGreaterThan(0);
      expect(c.licence.length, c.name).toBeGreaterThan(0);
      c.licence.forEach((l) => expect(licences.has(l), l).toBe(true));
    }
  });
});
