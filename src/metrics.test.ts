import { describe, expect, it } from 'vitest';
import { pipelineMetrics, weeklyApplied } from './metrics';
import type { Job, Status, StatusChange } from './types';

// Local-time dates throughout; Wednesday 2026-10-14.
const NOW = new Date(2026, 9, 14, 12, 0, 0);
const pad = (n: number) => (n < 10 ? '0' : '') + n;
const ago = (n: number) => {
  const d = new Date(2026, 9, 14 - n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

let n = 0;
const job = (o: Partial<Job> = {}): Job => ({
  url: `https://x.co/${n++}`,
  label: 'x',
  status: 'Saved',
  ...o,
});
const h = (...e: [Status, string][]): StatusChange[] => e.map(([status, at]) => ({ status, at }));

describe('pipelineMetrics', () => {
  it('empty input gives zeros and nulls, never NaN', () => {
    expect(pipelineMetrics([], NOW)).toEqual({
      appliedLast7: 0,
      appliedLast30: 0,
      appliedTotal: 0,
      responseRate: null,
      interviewRate: null,
      medianDaysToResponse: null,
      followUpsDue: 0,
    });
  });

  it('jobs that were never applied to count for nothing', () => {
    const m = pipelineMetrics([job(), job({ status: 'Saved' })], NOW);
    expect(m.appliedTotal).toBe(0);
    expect(m.responseRate).toBeNull();
  });

  it.each([
    ['today', 0, 1, 1],
    ['6 days ago (inside 7d)', 6, 1, 1],
    ['7 days ago (outside 7d)', 7, 0, 1],
    ['29 days ago (inside 30d)', 29, 0, 1],
    ['30 days ago (outside 30d)', 30, 0, 0],
    ['tomorrow (future, ignored)', -1, 0, 0],
  ])('window: applied %s', (_l, days, in7, in30) => {
    const m = pipelineMetrics([job({ status: 'Applied', applied: ago(days) })], NOW);
    expect(m.appliedLast7).toBe(in7);
    expect(m.appliedLast30).toBe(in30);
    expect(m.appliedTotal).toBe(1);
  });

  it('response and interview rates come from history', () => {
    const jobs = [
      job({ status: 'Applied', applied: ago(3) }),
      job({
        status: 'Interviewing',
        applied: ago(10),
        history: h(['Applied', ago(10)], ['Interviewing', ago(5)]),
      }),
      job({
        status: 'Rejected',
        applied: ago(12),
        history: h(['Applied', ago(12)], ['Rejected', ago(8)]),
      }),
      job({
        status: 'Rejected',
        applied: ago(20),
        history: h(['Applied', ago(20)], ['Interviewing', ago(15)], ['Rejected', ago(2)]),
      }),
    ];
    const m = pipelineMetrics(jobs, NOW);
    expect(m.appliedTotal).toBe(4);
    expect(m.responseRate).toBe(0.75);
    expect(m.interviewRate).toBe(0.5);
    // first replies: 5, 4, 5 days -> median 5
    expect(m.medianDaysToResponse).toBe(5);
  });

  it('median averages the middle pair for an even count', () => {
    const jobs = [
      job({ status: 'Offer', applied: ago(9), history: h(['Applied', ago(9)], ['Offer', ago(7)]) }),
      job({ status: 'Offer', applied: ago(9), history: h(['Applied', ago(9)], ['Offer', ago(3)]) }),
    ];
    expect(pipelineMetrics(jobs, NOW).medianDaysToResponse).toBe(4);
  });

  it('legacy jobs without history are backfilled (reply counts as 0 days)', () => {
    const m = pipelineMetrics(
      [job({ status: 'Applied', applied: ago(2) }), job({ status: 'Offer', applied: ago(4) })],
      NOW,
    );
    expect(m.appliedTotal).toBe(2);
    expect(m.responseRate).toBe(0.5);
    expect(m.interviewRate).toBe(0.5);
    expect(m.medianDaysToResponse).toBe(0);
  });

  it('applied date prefers the history entry over the legacy field', () => {
    const j = job({ status: 'Applied', applied: ago(40), history: h(['Applied', ago(1)]) });
    expect(pipelineMetrics([j], NOW).appliedLast7).toBe(1);
  });

  it('accepts ISO datetimes in history', () => {
    const j = job({ status: 'Applied', history: h(['Applied', new Date(2026, 9, 13, 9).toISOString()]) });
    expect(pipelineMetrics([j], NOW).appliedLast7).toBe(1);
  });

  it('counts follow-ups due (applied 7+ days, archived excluded)', () => {
    const jobs = [
      job({ status: 'Applied', applied: ago(8) }),
      job({ status: 'Applied', applied: ago(2) }),
      job({ status: 'Applied', applied: ago(9), archived: true }),
    ];
    expect(pipelineMetrics(jobs, NOW).followUpsDue).toBe(1);
  });
});

describe('weeklyApplied', () => {
  const at = (d: string) => job({ status: 'Applied', applied: d });

  it('returns 8 zero buckets oldest to newest, ending at the current Monday', () => {
    const w = weeklyApplied([], NOW);
    expect(w).toHaveLength(8);
    expect(w.every((b) => b.count === 0)).toBe(true);
    expect(w[7].weekStart).toBe('2026-10-12');
    expect(w[0].weekStart).toBe('2026-08-24');
  });

  it('Sunday belongs to the week ending, Monday starts the next', () => {
    const w = weeklyApplied([at('2026-10-11'), at('2026-10-12'), at('2026-10-18')], NOW);
    expect(w[6]).toEqual({ weekStart: '2026-10-05', count: 1 });
    expect(w[7]).toEqual({ weekStart: '2026-10-12', count: 2 });
  });

  it('when now is a Sunday the current week still starts the prior Monday', () => {
    const w = weeklyApplied([], new Date(2026, 9, 18, 23, 0));
    expect(w[7].weekStart).toBe('2026-10-12');
  });

  it('when now is a Monday the current week starts today', () => {
    expect(weeklyApplied([], new Date(2026, 9, 12, 0, 1))[7].weekStart).toBe('2026-10-12');
  });

  it('drops applications older than the window and honors a custom length', () => {
    const w = weeklyApplied([at('2026-01-01'), at('2026-10-14')], NOW, 3);
    expect(w.map((b) => b.count)).toEqual([0, 0, 1]);
  });

  it('uses the legacy applied date for jobs without history', () => {
    const w = weeklyApplied([job({ status: 'Interviewing', applied: '2026-10-07' })], NOW);
    expect(w[6].count).toBe(1);
  });
});
