import { describe, expect, it } from 'vitest';
import {
  appliedAgo,
  COLUMN_SORT,
  followUpOf,
  nextSort,
  primaryAction,
  sortDirectionOf,
} from './jobRow';
import type { Job } from './types';

const NOW = new Date(2026, 9, 14, 12);
const job = (o: Partial<Job> = {}): Job => ({
  url: 'https://acme.example/jobs/1',
  label: 'Design Engineer',
  status: 'Saved',
  ...o,
});

describe('primaryAction: one obvious next step per row (#129)', () => {
  it.each([
    ['a saved job → apply', job(), 'apply'],
    [
      'applied, follow-up due → log it',
      job({ status: 'Applied', applied: '2026-10-01' }),
      'followup',
    ],
    ['applied, not due yet → nothing', job({ status: 'Applied', applied: '2026-10-12' }), null],
    [
      'interviewing, follow-up due → log it',
      job({ status: 'Interviewing', applied: '2026-09-01', followUp: '2026-10-01' }),
      'followup',
    ],
    ['an offer → nothing', job({ status: 'Offer', applied: '2026-09-01' }), null],
    ['retired → nothing, even when saved', job({ archived: true }), null],
  ] as const)('%s', (_name, j, expected) => {
    expect(primaryAction(j, NOW)).toBe(expected);
  });
});

describe('sortable columns map onto the jobSort keys (#129)', () => {
  it('each sortable column has a sort key', () => {
    expect(COLUMN_SORT).toEqual({
      job: 'az',
      status: 'status',
      fit: 'fit',
      applied: 'applied',
      followup: 'followup',
    });
  });

  it('a column reads as sorted only under its own key, in that key’s direction', () => {
    expect(sortDirectionOf('job', 'az')).toBe('ascending');
    expect(sortDirectionOf('applied', 'applied')).toBe('descending'); // most recent first
    expect(sortDirectionOf('followup', 'followup')).toBe('ascending'); // soonest first
    expect(sortDirectionOf('job', 'recent')).toBe('none');
    expect(sortDirectionOf('status', 'az')).toBe('none');
  });

  it('clicking a column sorts by it; clicking it again goes back to recently added', () => {
    expect(nextSort('job', 'recent')).toBe('az');
    expect(nextSort('job', 'az')).toBe('recent');
    expect(nextSort('fit', 'az')).toBe('fit');
  });
});

describe('row timing labels (#129)', () => {
  it('applied: today, N days ago, or nothing', () => {
    expect(appliedAgo(job({ status: 'Applied', applied: '2026-10-14' }), NOW)).toBe('Today');
    expect(appliedAgo(job({ status: 'Applied', applied: '2026-10-04' }), NOW)).toBe('10d ago');
    expect(appliedAgo(job(), NOW)).toBeNull();
  });

  it('follow-up: due, due in N days, or nothing (retired jobs have no clock)', () => {
    expect(followUpOf(job({ status: 'Applied', applied: '2026-10-01' }), NOW)).toEqual({
      due: true,
    });
    expect(followUpOf(job({ status: 'Applied', applied: '2026-10-12' }), NOW)).toEqual({
      due: false,
      inDays: 5,
    });
    expect(followUpOf(job(), NOW)).toBeNull();
    expect(
      followUpOf(job({ status: 'Applied', applied: '2026-10-12', archived: true }), NOW),
    ).toBeNull();
  });
});
