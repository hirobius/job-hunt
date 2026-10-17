import { describe, expect, it } from 'vitest';
import { sweepRank, titleCounts, withoutHidden } from './sweep';
import type { Posting } from './types';

const NOW = Date.parse('2026-10-12T00:00:00Z');
const O = { where: '', mode: 'any' as const, now: NOW };

const post = (over: Partial<Posting>): Posting => ({
  id: 'hn:1',
  source: 'hn',
  title: 'Engineer',
  company: 'Acme',
  url: 'https://example.com/1',
  location: '',
  text: '',
  ...over,
});

describe('sweepRank: merge, dedupe and tag across titles', () => {
  it.each([
    {
      name: 'one posting matched by two titles shows once, tagged with both',
      postings: [post({ title: 'Design Engineer', text: 'Own our design system.' })],
      titles: ['design engineer', 'design system'],
      want: [['Design Engineer', ['design engineer', 'design system']]],
    },
    {
      name: 'the same opening on two boards (same company + title) shows once',
      postings: [
        post({ id: 'greenhouse:a:1', source: 'greenhouse', title: 'Design Engineer', url: 'https://a/1' }),
        post({ id: 'lever:a:2', source: 'lever', title: 'Design Engineer', url: 'https://b/2' }),
      ],
      titles: ['design engineer'],
      want: [['Design Engineer', ['design engineer']]],
    },
    {
      name: 'same URL found through different titles is one row',
      postings: [
        post({ id: 'hn:1', title: 'Design Technologist', company: '' }),
        post({ id: 'remotive:9', source: 'remotive', title: 'Design Engineer', company: '' }),
      ],
      titles: ['design technologist', 'design engineer'],
      want: [['Design Technologist', ['design technologist', 'design engineer']]],
    },
    {
      name: 'a title with no hits tags nothing; unrelated postings are dropped',
      postings: [
        post({ id: 'a', title: 'Design Engineer', url: 'https://a' }),
        post({ id: 'b', title: 'Sales Lead', url: 'https://b' }),
      ],
      titles: ['design engineer', 'welder'],
      want: [['Design Engineer', ['design engineer']]],
    },
    {
      name: 'distinct openings each keep their own title',
      postings: [
        post({ id: 'a', title: 'Design Engineer', url: 'https://a' }),
        post({ id: 'b', title: 'Design Technologist', url: 'https://b' }),
      ],
      titles: ['design engineer', 'design technologist'],
      want: [
        ['Design Engineer', ['design engineer']],
        ['Design Technologist', ['design technologist']],
      ],
    },
  ])('$name', ({ postings, titles, want }) => {
    const got = sweepRank(postings, titles, O).map((p) => [p.title, p.titles]);
    expect(got).toEqual(want);
  });

  it('keeps the best score: a title hit beats a description hit', () => {
    const p = post({ title: 'Design Engineer', text: 'You will build our design system.' });
    const [row] = sweepRank([p], ['design system', 'design engineer'], O);
    expect(row.hit).toBe('title');
    expect(row.titles).toEqual(['design system', 'design engineer']);
  });

  it('honours the work-mode filter like a single search', () => {
    const p = post({ title: 'Design Engineer', mode: 'onsite' });
    expect(sweepRank([p], ['design engineer'], { ...O, mode: 'remote' })).toEqual([]);
  });
});

describe('titleCounts / withoutHidden', () => {
  const rows = sweepRank(
    [
      post({ id: 'a', title: 'Design Engineer', text: 'design system', url: 'https://a' }),
      post({ id: 'b', title: 'Design Technologist', url: 'https://b' }),
    ],
    ['design engineer', 'design system', 'design technologist'],
    O,
  );

  it('counts every title a row matched', () => {
    expect(titleCounts(rows, ['design engineer', 'design system', 'design technologist'])).toEqual({
      'design engineer': 1,
      'design system': 1,
      'design technologist': 1,
    });
  });

  it.each([
    [[], 2],
    [['design technologist'], 1],
    // Row a still shows: it also matched a title that is showing.
    [['design engineer'], 2],
    [['design engineer', 'design system'], 1],
    [['design engineer', 'design system', 'design technologist'], 0],
  ])('hiding %j leaves %i rows', (hidden, n) => {
    expect(withoutHidden(rows, new Set(hidden))).toHaveLength(n);
  });
});
