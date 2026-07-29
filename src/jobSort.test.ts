import { describe, expect, it } from 'vitest';
import { sortJobs, parseSalary, type SortKey } from './jobSort';
import type { Job } from './types';

const NOW = new Date('2026-06-29T12:00:00Z');
const daysAgo = (n: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const job = (p: Partial<Job> & { url: string }): Job => ({
  label: p.url,
  status: 'Saved',
  ...p,
});

const urls = (jobs: Job[]) => jobs.map((j) => j.url);

describe('parseSalary', () => {
  it('expands k and takes the largest figure', () => {
    expect(parseSalary('$180k–$210k')).toBe(210000);
    expect(parseSalary('120,000')).toBe(120000);
    expect(parseSalary('$95/hr')).toBe(95);
  });
  it('returns NaN when there is no number', () => {
    expect(parseSalary('competitive')).toBeNaN();
    expect(parseSalary(undefined)).toBeNaN();
  });
});

describe('sortJobs invariants', () => {
  const a = job({ url: 'a' }); // added first
  const b = job({ url: 'b' });
  const c = job({ url: 'c' }); // added last
  const base = [a, b, c];

  it('recent = newest first by default', () => {
    expect(urls(sortJobs(base, 'recent', NOW))).toEqual(['c', 'b', 'a']);
  });

  it('keeps retired jobs last in every sort', () => {
    const list = [job({ url: 'a', archived: true }), job({ url: 'b' }), job({ url: 'c' })];
    (['recent', 'followup', 'applied', 'status', 'salary', 'fit', 'az'] as SortKey[]).forEach((k) => {
      const out = urls(sortJobs(list, k, NOW));
      expect(out[out.length - 1]).toBe('a');
    });
  });

  it('floats priority within its group', () => {
    const list = [job({ url: 'a' }), job({ url: 'b', priority: true }), job({ url: 'c' })];
    expect(urls(sortJobs(list, 'recent', NOW))[0]).toBe('b');
  });

  it('floats DUE follow-ups to the top in the default sort only', () => {
    const due = job({ url: 'due', status: 'Applied', applied: daysAgo(30) });
    const fresh = job({ url: 'fresh' });
    const list = [due, fresh];
    // default: due first
    expect(urls(sortJobs(list, 'recent', NOW))[0]).toBe('due');
    // A–Z sort does not float due; 'due' < 'fresh' alphabetically anyway, so use labels to prove
    const due2 = job({ url: 'z-due', label: 'zzz', status: 'Applied', applied: daysAgo(30) });
    const fresh2 = job({ url: 'a-fresh', label: 'aaa' });
    expect(urls(sortJobs([due2, fresh2], 'az', NOW))).toEqual(['a-fresh', 'z-due']);
  });
});

describe('sortJobs metrics', () => {
  it('follow-up due first, then soonest', () => {
    const dueNow = job({ url: 'dueNow', status: 'Applied', applied: daysAgo(20) });
    const soon = job({ url: 'soon', status: 'Applied', applied: daysAgo(5) }); // due in 2d
    const none = job({ url: 'none' });
    expect(urls(sortJobs([none, soon, dueNow], 'followup', NOW)).slice(0, 2)).toEqual([
      'dueNow',
      'soon',
    ]);
  });

  it('salary high to low, blanks last', () => {
    const hi = job({ url: 'hi', salary: '$200k' });
    const lo = job({ url: 'lo', salary: '$90k' });
    const none = job({ url: 'none' });
    expect(urls(sortJobs([lo, none, hi], 'salary', NOW))).toEqual(['hi', 'lo', 'none']);
  });

  it('best fit: match < stretch < reach, unscreened last', () => {
    const reach = job({ url: 'reach', verdict: 'reach' });
    const match = job({ url: 'match', verdict: 'match' });
    const none = job({ url: 'none' });
    const stretch = job({ url: 'stretch', verdict: 'stretch' });
    expect(urls(sortJobs([reach, none, match, stretch], 'fit', NOW))).toEqual([
      'match',
      'stretch',
      'reach',
      'none',
    ]);
  });

  it('status follows the lifecycle order', () => {
    const offer = job({ url: 'offer', status: 'Offer', applied: daysAgo(3) });
    const saved = job({ url: 'saved' });
    const applied = job({ url: 'applied', status: 'Applied', applied: daysAgo(1) });
    expect(urls(sortJobs([offer, applied, saved], 'status', NOW))).toEqual([
      'saved',
      'applied',
      'offer',
    ]);
  });
});
