import { describe, expect, it, vi } from 'vitest';
import {
  YC_BASE,
  batchLabel,
  batchUrl,
  fetchBatch,
  parseYcCompany,
  recentBatches,
  ycLines,
} from './yc';
import { FetchError } from './sources/http';

describe('recentBatches', () => {
  it.each([
    ['2026-10-15', ['fall-2026', 'summer-2026', 'spring-2026', 'winter-2026']],
    ['2026-07-01', ['summer-2026', 'spring-2026', 'winter-2026', 'fall-2025']],
    ['2026-01-20', ['winter-2026', 'fall-2025', 'summer-2025', 'spring-2025']],
    ['2026-02-01', ['winter-2026', 'fall-2025', 'summer-2025', 'spring-2025']],
  ])('on %s', (day, want) => {
    expect(recentBatches(new Date(day))).toEqual(want);
  });
  it('can ask for more', () => {
    expect(recentBatches(new Date('2026-10-15'), 6)).toHaveLength(6);
  });
});

describe('batchLabel and batchUrl', () => {
  it('labels and builds the mirror URL', () => {
    expect(batchLabel('winter-2026')).toBe('Winter 2026');
    expect(batchUrl('winter-2026')).toBe(`${YC_BASE}batches/winter-2026.json`);
    expect(YC_BASE).toBe('https://yc-oss.github.io/api/');
  });
});

describe('parseYcCompany', () => {
  it('reads the documented fields', () => {
    expect(
      parseYcCompany({
        name: 'Acme',
        slug: 'acme',
        website: 'https://acme.com',
        one_liner: 'Anvils',
        team_size: 12,
        industries: ['B2B'],
        tags: ['Hardware'],
        batch: 'Winter 2026',
        status: 'Active',
        isHiring: true,
      }),
    ).toEqual({
      name: 'Acme',
      slug: 'acme',
      website: 'https://acme.com',
      oneLiner: 'Anvils',
      teamSize: 12,
      industries: ['B2B'],
      tags: ['Hardware'],
      batch: 'Winter 2026',
      status: 'Active',
      isHiring: true,
    });
  });
  it('tolerates missing fields and keeps a company that has only a name', () => {
    expect(parseYcCompany({ name: 'Bare' })).toMatchObject({
      name: 'Bare',
      tags: [],
      industries: [],
    });
  });
  it.each([null, 'x', 4, {}, { name: '  ' }])('rejects %j', (raw) => {
    expect(parseYcCompany(raw)).toBeNull();
  });
});

describe('fetchBatch', () => {
  const body = [
    { name: 'A', status: 'Active', isHiring: true },
    { name: 'B', status: 'Acquired' },
    { name: 'C', status: 'Active', isHiring: false },
    { name: 'D', status: 'Inactive' },
    { junk: true },
  ];
  it('keeps active companies only', async () => {
    const f = vi.fn(async (_u: string) => body);
    const out = await fetchBatch('winter-2026', f);
    expect(out.map((c) => c.name)).toEqual(['A', 'C']);
    expect(f.mock.calls[0][0]).toBe(batchUrl('winter-2026'));
  });
  it('can keep only those hiring', async () => {
    const out = await fetchBatch('winter-2026', async () => body, { hiringOnly: true });
    expect(out.map((c) => c.name)).toEqual(['A']);
  });
  it('says plainly when the mirror is gone or not a list', async () => {
    await expect(
      fetchBatch('winter-2026', async (u) => {
        throw new FetchError(404, u);
      }),
    ).rejects.toThrow(/YC directory/);
    await expect(fetchBatch('winter-2026', async () => ({ not: 'a list' }))).rejects.toThrow(
      /YC directory/,
    );
  });
});

describe('ycLines', () => {
  it('turns companies into probe lines, deduped', () => {
    const cs = ['Acme', 'acme', 'Beta Co'].map((name) => parseYcCompany({ name })!);
    expect(ycLines(cs)).toEqual(['Acme', 'Beta Co']);
  });
});
