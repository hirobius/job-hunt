import { describe, expect, it } from 'vitest';
import { filterOptions } from './trackerCounts';
import type { Job } from './types';

const job = (url: string, status: Job['status'], extra: Partial<Job> = {}): Job =>
  ({ url, label: url, status, addedAt: Date.now(), ...extra }) as Job;

describe('filterOptions', () => {
  it('always shows Active and All, even with no jobs', () => {
    expect(filterOptions([], 'active').map((o) => o.value)).toEqual(['active', 'all']);
  });
  it('shows a status only when a job is under it, with its count', () => {
    const jobs = [job('a', 'Saved'), job('b', 'Applied'), job('c', 'Applied')];
    const opts = filterOptions(jobs, 'active');
    expect(opts.map((o) => `${o.value}:${o.count}`)).toEqual(['active:1', 'all:3', 'Saved:1', 'Applied:2']);
  });
  it('keeps the current filter visible even when it is empty', () => {
    const opts = filterOptions([job('a', 'Saved')], 'Rejected');
    expect(opts.some((o) => o.value === 'Rejected' && o.count === 0)).toBe(true);
  });
});
