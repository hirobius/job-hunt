import { describe, expect, it } from 'vitest';
import { normStatus, daysSince, deriveJobState, applyStatus, logFollowUp } from './jobState';
import type { Job } from './types';

const NOW = new Date('2026-06-26T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();
const pad = (n: number) => (n < 10 ? '0' : '') + n;
const TODAY = `${NOW.getFullYear()}-${pad(NOW.getMonth() + 1)}-${pad(NOW.getDate())}`;

const job = (over: Partial<Job> = {}): Job => ({
  url: 'https://x.com/j',
  label: 'A job',
  status: 'Saved',
  ...over,
});

describe('normStatus', () => {
  it('passes known statuses through and defaults the rest to Saved', () => {
    expect(normStatus('Applied')).toBe('Applied');
    expect(normStatus('bogus')).toBe('Saved');
    expect(normStatus(undefined)).toBe('Saved');
  });
});

describe('daysSince', () => {
  it('computes whole-day diffs against now, null for missing/invalid input', () => {
    expect(daysSince(undefined, NOW)).toBeNull();
    expect(daysSince('not-a-date', NOW)).toBeNull();
    expect(daysSince(daysAgo(3), NOW)).toBe(3);
  });
});

describe('deriveJobState', () => {
  it('a Saved job is active, applyable, not tracked for follow-up', () => {
    const s = deriveJobState(job(), NOW);
    expect(s).toMatchObject({ status: 'Saved', isActive: true, isApplyable: true });
    expect(s.followUp).toMatchObject({ tracked: false, due: false, daysUntil: null });
  });

  it('an Applied job past the window is due (no countdown)', () => {
    const s = deriveJobState(job({ status: 'Applied', applied: daysAgo(8) }), NOW);
    expect(s.followUp).toMatchObject({ tracked: true, due: true, daysUntil: null });
    expect(s.appliedDaysAgo).toBe(8);
    expect(s.isApplyable).toBe(false);
  });

  it('an Applied job inside the window counts down, not due', () => {
    const s = deriveJobState(job({ status: 'Applied', applied: daysAgo(3) }), NOW);
    expect(s.followUp).toMatchObject({ due: false, daysUntil: 4 });
  });

  it('the window boundary (7d) is due', () => {
    expect(deriveJobState(job({ status: 'Applied', applied: daysAgo(7) }), NOW).followUp.due).toBe(
      true,
    );
  });

  it('a logged follow-up restarts the clock (overrides applied age)', () => {
    const s = deriveJobState(
      job({ status: 'Applied', applied: daysAgo(20), followUp: daysAgo(2) }),
      NOW,
    );
    expect(s.followUp).toMatchObject({ due: false, daysUntil: 5, loggedDaysAgo: 2 });
  });

  it('a retired (archived) job is never active or due', () => {
    const s = deriveJobState(job({ status: 'Applied', applied: daysAgo(30), archived: true }), NOW);
    expect(s.isActive).toBe(false);
    expect(s.followUp.due).toBe(false);
  });

  it('a pinned non-Saved job stays in the active queue', () => {
    expect(deriveJobState(job({ status: 'Applied', priority: true }), NOW).isActive).toBe(true);
  });

  it('Interviewing is tracked; Offer/Rejected are not', () => {
    expect(deriveJobState(job({ status: 'Interviewing' }), NOW).followUp.tracked).toBe(true);
    expect(deriveJobState(job({ status: 'Rejected' }), NOW).followUp.tracked).toBe(false);
  });
});

describe('applyStatus', () => {
  it('stamps `applied` on first entry to Applied', () => {
    expect(applyStatus(job(), 'Applied', NOW).applied).toBe(TODAY);
  });

  it('never overwrites an existing `applied` date', () => {
    const j = job({ status: 'Applied', applied: '2026-01-01' });
    expect(applyStatus(j, 'Applied', NOW).applied).toBe('2026-01-01');
  });

  it('does not stamp `applied` for other transitions', () => {
    expect(applyStatus(job(), 'Interviewing', NOW).applied).toBeUndefined();
  });

  it('returns a new object, leaving the input untouched', () => {
    const j = job();
    const next = applyStatus(j, 'Applied', NOW);
    expect(next).not.toBe(j);
    expect(j.status).toBe('Saved');
  });
});

describe('logFollowUp', () => {
  it('sets followUp to today and returns a new object', () => {
    const j = job({ status: 'Applied', applied: daysAgo(10) });
    const next = logFollowUp(j, NOW);
    expect(next.followUp).toBe(TODAY);
    expect(next).not.toBe(j);
  });
});
