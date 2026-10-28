import { describe, expect, it } from 'vitest';
import { DIRECTORY_BY_PACK } from './directory';
import { boardsFromUrls, parseBoardUrl } from '../feed/sources/ats';
import DS_SEED_BOARDS from '../feed/data/ds-seed-boards.json';

const SOFTWARE_ONLY = ['stripe', 'vercel', 'figma', 'linear', 'ramp', 'notion', 'databricks'];

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
    // The curated lists keep their place ahead of the seed.
    expect(ds[22]).toBe('https://jobs.lever.co/virtualitics');
  });

  it('a trades track gets no software boards', () => {
    const trades = DIRECTORY_BY_PACK.trades.join(' ');
    SOFTWARE_ONLY.forEach((s) => expect(trades).not.toContain(`/${s}`));
    const ds = new Set(DIRECTORY_BY_PACK.designsystems);
    DIRECTORY_BY_PACK.trades.forEach((u) => expect(ds.has(u)).toBe(false));
  });

  it('only advertised starter packs have a list', () => {
    expect(Object.keys(DIRECTORY_BY_PACK).sort()).toEqual(
      ['consulting', 'designsystems', 'servicenow', 'trades'].sort(),
    );
  });
});
