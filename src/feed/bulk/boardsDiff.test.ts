import { describe, expect, it } from 'vitest';
import { diffBoardSets, diffMarkdown } from './boardsDiff';

const b = (kind: string, slug: string, o = {}) => ({ kind, slug, ...o });
const many = (n: number) => Array.from({ length: n }, (_, i) => b('greenhouse', `co${i}`));

describe('diffBoardSets', () => {
  it('lists added and removed boards by kind (Lever EU kept apart, slug case ignored)', () => {
    const d = diffBoardSets(
      { boards: [...many(20), b('lever', 'Acme')] },
      {
        boards: [
          ...many(20),
          b('lever', 'acme'),
          b('lever', 'acme', { eu: true }),
          b('ashby', 'new'),
        ],
      },
    );
    expect(d.added.map((x) => x.slug)).toEqual(['acme', 'new']);
    expect(d.removed).toEqual([]);
    expect(d.byKind).toEqual({ lever: { added: 1, removed: 0 }, ashby: { added: 1, removed: 0 } });
    expect(d.blockers).toEqual([]);
  });

  it('blocks a run that drops over 10% of the boards, an empty set, or no change', () => {
    expect(diffBoardSets({ boards: many(100) }, { boards: many(80) }).blockers[0]).toMatch(
      /20 of 100 boards removed/,
    );
    expect(diffBoardSets({ boards: many(5) }, { boards: [] }).blockers).toContain(
      'the new set has no boards',
    );
    expect(diffBoardSets({ boards: many(5) }, { boards: many(5) }).blockers).toEqual(['no change']);
  });

  it('names the sources the run could not read', () => {
    const d = diffBoardSets(
      { boards: many(10) },
      {
        boards: [...many(10), b('ashby', 'x')],
        sources: [{ label: 'Hacker News', error: 'HTTP 503' }, { label: 'GitHub' }],
      },
    );
    expect(d.failedSources).toEqual(['Hacker News: HTTP 503']);
  });
});

describe('diffBoardSets blockers (PR #584 review)', () => {
  const src = (id: string, error = '') => ({ id, label: id, candidates: error ? 0 : 10, error });

  it('blocks when a source that read last time failed, as unsafe', () => {
    const d = diffBoardSets(
      { boards: many(10), sources: [src('hn'), src('github')] },
      { boards: [...many(10), b('ashby', 'x')], sources: [src('hn', 'HTTP 503'), src('github')] },
    );
    expect(d.blockers).toEqual(['source hn failed (HTTP 503)']);
    expect(d.unsafe).toBe(true);
  });

  it('only reports a source that failed last time too (Common Crawl from a blocked network)', () => {
    const d = diffBoardSets(
      { boards: many(10), sources: [src('commoncrawl', 'HTTP unreachable')] },
      { boards: [...many(10), b('ashby', 'x')], sources: [src('commoncrawl', 'HTTP unreachable')] },
    );
    expect(d.blockers).toEqual([]);
    expect(d.failedSources).toEqual(['commoncrawl: HTTP unreachable']);
  });

  it('blocks when one kind loses over 25% of its boards, even under the 10% overall cap', () => {
    const lever = Array.from({ length: 8 }, (_, i) => b('lever', `l${i}`));
    const d = diffBoardSets(
      { boards: [...many(100), ...lever] },
      { boards: [...many(100), ...lever.slice(0, 5)] },
    );
    expect(d.removed).toHaveLength(3);
    expect(d.blockers).toEqual(['lever lost 3 of 8 boards (over 25% of one kind)']);
    expect(d.unsafe).toBe(true);
    // 2 of 8 (25%) is not over the line.
    expect(
      diffBoardSets(
        { boards: [...many(100), ...lever] },
        { boards: [...many(100), ...lever.slice(0, 6)] },
      ).blockers,
    ).toEqual([]);
  });

  it('a changed line (a miss counted, roles moved a step) is a change; no change is not unsafe', () => {
    const d = diffBoardSets(
      { boards: [b('greenhouse', 'a', { jobs: 10 })] },
      { boards: [b('greenhouse', 'a', { jobs: 10, misses: 1 })] },
    );
    expect(d).toMatchObject({ changed: 1, blockers: [] });
    expect(d.missing.map((x) => x.slug)).toEqual(['a']);
    const same = diffBoardSets({ boards: many(3) }, { boards: many(3) });
    expect(same).toMatchObject({ blockers: ['no change'], unsafe: false });
  });
});

describe('diffMarkdown', () => {
  it('gives counts, a kind table and samples', () => {
    const md = diffMarkdown(
      diffBoardSets(
        { boards: [b('lever', 'old', { company: 'Old' })] },
        { boards: [b('ashby', 'new')] },
      ),
      '2026-11-15',
    );
    expect(md).toContain('Boards: 1 → 1 (+1, −1, 0 lines changed).');
    expect(md).toContain('| ashby | 1 | 0 |');
    expect(md).toContain('- lever: `old` (Old)');
    expect(md).toContain('Every source was read.');
  });
});
