import { describe, expect, it } from 'vitest';
import { appliedThisWeek, followUpsDue, nextStep, weekLine } from './applyDone';
import type { Job } from './types';

const NOW = new Date(2026, 10, 12, 10); // Thu 12 Nov 2026, local
const job = (url: string, extra: Partial<Job> = {}): Job =>
  ({ url, label: url, status: 'Applied', ...extra }) as Job;

describe('applyDone (#554)', () => {
  it('counts applications from today and the 6 days before it', () => {
    const jobs = [
      job('a', { applied: '2026-11-12' }),
      job('b', { applied: '2026-11-06' }),
      job('c', { applied: '2026-11-05' }), // 7 days ago: last week
      job('d', { status: 'Saved' }),
    ];
    expect(appliedThisWeek(jobs, NOW)).toBe(2);
  });

  it.each([
    [[], 'No applications this week yet.'],
    [[job('a', { applied: '2026-11-11' })], 'You applied to 1 job this week.'],
    [
      [job('a', { applied: '2026-11-11' }), job('b', { applied: '2026-11-10' })],
      'You applied to 2 jobs this week.',
    ],
    [
      [job('a', { applied: '2026-11-11' }), job('b', { applied: '2026-10-20' })],
      'You applied to 1 job this week. 1 follow-up is due.',
    ],
  ] as const)('one line for the week (%#)', (jobs, line) => {
    expect(weekLine([...jobs], NOW)).toBe(line);
  });

  it('the filled key is Follow up while one is due, else Find more jobs', () => {
    const due = [job('a', { applied: '2026-10-20' }), job('b', { applied: '2026-10-21' })];
    expect(followUpsDue(due, NOW)).toBe(2);
    expect(nextStep(due, NOW)).toEqual({ kind: 'followUp', label: 'Follow up (2)' });
    expect(nextStep([job('a', { applied: '2026-11-11' })], NOW)).toEqual({
      kind: 'find',
      label: 'Find more jobs',
    });
  });

  it('a set-aside job is never a follow-up', () => {
    expect(followUpsDue([job('a', { applied: '2026-10-20', archived: true })], NOW)).toBe(0);
  });
});
