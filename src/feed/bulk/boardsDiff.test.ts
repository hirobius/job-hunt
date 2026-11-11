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

describe('diffMarkdown', () => {
  it('gives counts, a kind table and samples', () => {
    const md = diffMarkdown(
      diffBoardSets(
        { boards: [b('lever', 'old', { company: 'Old' })] },
        { boards: [b('ashby', 'new')] },
      ),
      '2026-11-15',
    );
    expect(md).toContain('Boards: 1 → 1 (+1, −1).');
    expect(md).toContain('| ashby | 1 | 0 |');
    expect(md).toContain('- lever: `old` (Old)');
    expect(md).toContain('Every source was read.');
  });
});
