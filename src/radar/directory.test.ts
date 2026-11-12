import { describe, expect, it } from 'vitest';
import { DESIGN_SYSTEMS_CURATED, DIRECTORY_BY_PACK } from './directory';
import { MAX_SEED_JOBS } from '../feed/seed/run';
import { boardsFromUrls, parseBoardUrl } from '../feed/sources/ats';
import DS_SEED_BOARDS from '../feed/data/ds-seed-boards.json';

describe('starter directory, by starter pack', () => {
  it.each(Object.entries(DIRECTORY_BY_PACK))(
    '%s: every entry is a distinct company board',
    (_id, urls) => {
      expect(urls.length).toBeGreaterThan(0);
      urls.forEach((u) => expect(parseBoardUrl(u), u).not.toBeNull());
      expect(boardsFromUrls([...urls], Infinity)).toHaveLength(urls.length);
      expect(new Set(urls).size).toBe(urls.length);
    },
  );

  it('design systems starts with the original 23, then grows past 100 with the wider list', () => {
    const ds = DIRECTORY_BY_PACK.designsystems;
    expect(ds.slice(0, 3)).toEqual([
      'https://jobs.ashbyhq.com/langchain',
      'https://jobs.ashbyhq.com/frontcareers',
      'https://jobs.ashbyhq.com/perplexity',
    ]);
    expect(ds[22]).toBe('https://jobs.lever.co/virtualitics');
    expect(ds.length).toBeGreaterThanOrEqual(23 + 90);
    // The additions put design-forward companies ahead of the rest.
    const rank = (slug: string) => ds.findIndex((u) => u.endsWith(`/${slug}`));
    expect(rank('figma')).toBeGreaterThan(22);
    expect(rank('figma')).toBeLessThan(rank('zscaler'));
  });

  it('design systems then watches every confirmed board of the company seed, once', () => {
    const ds = DIRECTORY_BY_PACK.designsystems;
    const key = (u: string) => {
      const b = parseBoardUrl(u)!;
      return `${b.kind}:${b.slug.toLowerCase()}`;
    };
    const have = new Set(ds.map(key));
    DS_SEED_BOARDS.forEach((u) => expect(have.has(key(u)), u).toBe(true));
    // The curated lists keep their place ahead of the seed: whatever comes first is not seed-only.
    const seed = new Set(DS_SEED_BOARDS.map(key));
    const CURATED = new Set(DESIGN_SYSTEMS_CURATED.map(key));
    const firstSeedOnly = ds.findIndex((u) => seed.has(key(u)) && !CURATED.has(key(u)));
    expect(firstSeedOnly).toBeGreaterThan(0);
    ds.slice(firstSeedOnly).forEach((u) => expect(seed.has(key(u)), u).toBe(true));
  });

  it('the seed adds no board above the job cap (a phone reads every watched board)', async () => {
    const snap = (await import('../feed/data/ds-companies.json')).default;
    const jobs = new Map(
      snap.companies.filter((c) => c.board).map((c) => [c.board!.url, c.board!.jobs]),
    );
    DS_SEED_BOARDS.forEach((u) => expect(jobs.get(u) ?? 0, u).toBeLessThanOrEqual(MAX_SEED_JOBS));
  });

  it('only advertised starter packs have a list', () => {
    expect(Object.keys(DIRECTORY_BY_PACK).sort()).toEqual(['designsystems']);
  });
});

// Prod audit 2026-11-12: these Greenhouse boards answer 404 on every load, so no new account
// follows them and the server's rotation set does not read them.
describe('dead boards stay out of the seed', () => {
  const DEAD = ['doctolib', 'gr8tech', 'iterable', 'kayak', 'parloa'];
  it.each(DEAD)(
    'greenhouse %s is not followed on a first run or in the board set',
    async (slug) => {
      const url = `https://boards.greenhouse.io/${slug}`;
      expect(DS_SEED_BOARDS).not.toContain(url);
      expect(DIRECTORY_BY_PACK.designsystems).not.toContain(url);
      const { default: boards } = await import('../feed/data/boards.json');
      expect(
        (boards as unknown as { boards: { kind: string; slug: string }[] }).boards.some(
          (b) => b.kind === 'greenhouse' && b.slug === slug,
        ),
      ).toBe(false);
    },
  );
});
