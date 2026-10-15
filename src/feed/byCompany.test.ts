import { describe, expect, it } from 'vitest';
import type { RankedPosting } from './types';
import { groupByCompany, normalizeCompany } from './byCompany';

let n = 0;
const rp = (o: Partial<RankedPosting> = {}): RankedPosting => ({
  id: `x:${++n}`,
  source: 'ashby',
  title: 'Design Systems Engineer',
  company: 'Acme',
  url: `https://example.com/jobs/${n}`,
  location: '',
  text: '',
  score: 10,
  hit: 'title',
  signals: [],
  snippet: '',
  ...o,
});
const sig = (id: 'contract' | 'founding') => ({ id, label: id, evidence: id });

describe('normalizeCompany', () => {
  it.each([
    ['Acme', 'acme'],
    ['ACME, Inc.', 'acme'],
    ['Acme Inc', 'acme'],
    ['Acme LLC', 'acme'],
    ['Acme, L.L.C.', 'acme'],
    ['Acme Labs Ltd.', 'acme labs'],
    ['Acme Corp', 'acme'],
    ['Acme Corporation', 'acme'],
    ['Acme GmbH', 'acme'],
    ['  Acme   Labs  ', 'acme labs'],
    ['Acme & Sons, Inc.', 'acme sons'],
    ['Inc', 'inc'], // a name that is only a suffix stays
    ['', ''],
    ['   ', ''],
  ])('%j -> %j', (raw, norm) => {
    expect(normalizeCompany(raw)).toBe(norm);
  });
});

describe('groupByCompany', () => {
  it('groups one company across casing, suffixes and sources; skips blank names', () => {
    const out = groupByCompany([
      rp({ company: 'Acme', source: 'ashby' }),
      rp({ company: 'ACME, Inc.', source: 'hn' }),
      rp({ company: 'Acme LLC', source: 'remotive' }),
      rp({ company: 'Zed' }),
      rp({ company: '' }),
      rp({ company: '   ' }),
    ]);
    expect(out.map((g) => [g.company, g.count])).toEqual([
      ['Acme', 3],
      ['Zed', 1],
    ]);
  });

  it('shows the best-ranked posting company spelling', () => {
    const out = groupByCompany([rp({ company: 'Acme Labs, Inc.' }), rp({ company: 'acme labs' })]);
    expect(out[0].company).toBe('Acme Labs, Inc.');
  });

  it('orders by best score, then count, then name', () => {
    const out = groupByCompany([
      rp({ company: 'Low', score: 5 }),
      rp({ company: 'High', score: 20 }),
      rp({ company: 'Many', score: 10 }),
      rp({ company: 'Many', score: 4 }),
      rp({ company: 'One', score: 10 }),
    ]);
    expect(out.map((g) => g.company)).toEqual(['High', 'Many', 'One', 'Low']);
    expect(out.find((g) => g.company === 'Many')!.bestScore).toBe(10);
  });

  it('unions signals by id and finds the newest posted date', () => {
    const [g] = groupByCompany([
      rp({ signals: [sig('contract')], postedAt: '2026-10-01T00:00:00Z' }),
      rp({ signals: [sig('contract'), sig('founding')], postedAt: '2026-10-09T00:00:00Z' }),
      rp({ postedAt: undefined }),
    ]);
    expect(g.signals.map((s) => s.id).sort()).toEqual(['contract', 'founding']);
    expect(g.newestPostedAt).toBe('2026-10-09T00:00:00Z');
  });

  it('keeps the top 3 postings in rank order, and the full count', () => {
    const list = [10, 9, 8, 7, 6].map((score) => rp({ company: 'Acme', score }));
    const [g] = groupByCompany(list);
    expect(g.count).toBe(5);
    expect(g.top.map((p) => p.score)).toEqual([10, 9, 8]);
  });

  it('derives the boards from posting urls, once each', () => {
    const [g] = groupByCompany([
      rp({ company: 'Ramp', url: 'https://jobs.ashbyhq.com/ramp/aaa' }),
      rp({ company: 'Ramp', url: 'https://jobs.ashbyhq.com/Ramp/bbb' }),
      rp({ company: 'Ramp', url: 'https://news.ycombinator.com/item?id=1' }),
    ]);
    expect(g.boards).toEqual([{ kind: 'ashby', slug: 'ramp' }]);
  });

  it('an empty list groups to nothing', () => {
    expect(groupByCompany([])).toEqual([]);
  });
});
