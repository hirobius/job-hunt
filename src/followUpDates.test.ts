// Follow-up dates across day boundaries (audit 2026-10-27). The follow-up loop counts calendar
// days in local time, so the day `followUpDate` names and the moment `deriveJobState` calls it due
// must agree in every time zone, across a daylight-saving change too. Each case runs in a real
// DST zone with the clock faked; the zone is put back after.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { daysSince, deriveJobState, snoozeFollowUp } from './jobState';
import { dueFollowUps, followUpDate, jobIcsEvents, respondByJobs, ymd } from './jobEvents';
import type { Job } from './types';

const job = (over: Partial<Job>): Job => ({
  url: 'https://x.com/j',
  label: 'A job',
  status: 'Applied',
  ...over,
});

let tz: string | undefined;
beforeAll(() => {
  tz = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
});
afterAll(() => {
  if (tz === undefined) delete process.env.TZ;
  else process.env.TZ = tz;
});
afterEach(() => vi.useRealTimers());

describe('the follow-up day and its due flag agree (America/Los_Angeles)', () => {
  // [applied, now (local wall time), expected follow-up day, due]
  const cases: [string, [number, number, number, number, number], string, boolean][] = [
    // Ordinary week: due from local midnight on day 7.
    ['2026-10-13', [2026, 9, 20, 0, 0], '2026-10-20', true],
    ['2026-10-13', [2026, 9, 19, 23, 59], '2026-10-20', false],
    // Spring forward (Mar 8, 2026): the week is an hour short. Due at local midnight anyway.
    ['2026-03-02', [2026, 2, 9, 0, 30], '2026-03-09', true],
    ['2026-03-02', [2026, 2, 8, 23, 30], '2026-03-09', false],
    // Fall back (Nov 1, 2026): the week is an hour long.
    ['2026-10-26', [2026, 10, 2, 0, 0], '2026-11-02', true],
    ['2026-10-26', [2026, 10, 1, 23, 59], '2026-11-02', false],
  ];
  it.each(cases)('applied %s, now %j → %s, due %s', (applied, [y, mo, d, h, mi], day, due) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(y, mo, d, h, mi));
    const now = new Date();
    const j = job({ applied });
    expect(followUpDate(j, now)).toBe(day);
    expect(deriveJobState(j, now).followUp.due).toBe(due);
    expect(dueFollowUps([j], now).length).toBe(due ? 1 : 0);
    // Due exactly when the follow-up day has come.
    expect(day <= ymd(now)).toBe(due);
  });

  it('counts calendar days for a bare date across spring forward', () => {
    const now = new Date(2026, 2, 9, 0, 30);
    expect(daysSince('2026-03-02', now)).toBe(7);
    expect(daysSince('2026-03-09', now)).toBe(0);
    expect(daysSince('2026-03-10', now)).toBe(-1);
  });

  it('holds a snoozed follow-up until its day, across spring forward', () => {
    const due = new Date(2026, 2, 6, 9, 0);
    const snoozed = snoozeFollowUp(job({ applied: '2026-02-20' }), due);
    expect(snoozed.snoozeUntil).toBe('2026-03-09');
    expect(deriveJobState(snoozed, new Date(2026, 2, 8, 23, 59)).followUp.due).toBe(false);
    expect(deriveJobState(snoozed, new Date(2026, 2, 9, 0, 30)).followUp.due).toBe(true);
    expect(followUpDate(snoozed, new Date(2026, 2, 9, 0, 30))).toBe('2026-03-09');
  });
});

describe('a solicitation’s deadline as its follow-up date', () => {
  const saved = (deadline: string) =>
    job({ url: 'https://sam.gov/opp/a/view', status: 'Saved', deadline });
  const NOW = new Date(2026, 9, 27, 15, 0);

  it('is the follow-up day through the deadline itself', () => {
    expect(followUpDate(saved('2026-10-27'), NOW)).toBe('2026-10-27');
    expect(followUpDate(saved('2026-11-05'), NOW)).toBe('2026-11-05');
  });

  it('is gone once the deadline has passed: nothing to respond to', () => {
    expect(followUpDate(saved('2026-10-26'), NOW)).toBeNull();
    // No "Follow up" event moved up to today for an expired solicitation.
    expect(jobIcsEvents(saved('2026-10-26'), NOW)).toEqual([]);
  });
});

describe('a solicitation’s deadline on the Pipeline (#308)', () => {
  const saved = (deadline: string, over: Partial<Job> = {}) =>
    job({ url: `https://sam.gov/opp/${deadline}/view`, status: 'Saved', deadline, ...over });
  const NOW = new Date(2026, 9, 27, 15, 0);

  // [deadline, listed]: today and the next 6 days are in; day 8 (a week out) is not.
  const cases: [string, boolean][] = [
    ['2026-10-26', false], // yesterday: passed
    ['2026-10-27', true], // today
    ['2026-10-28', true], // tomorrow
    ['2026-11-02', true], // day 7
    ['2026-11-03', false], // day 8
  ];
  it.each(cases)('deadline %s → listed %s', (deadline, listed) => {
    expect(respondByJobs([saved(deadline)], NOW).map((d) => d.dueDate)).toEqual(
      listed ? [deadline] : [],
    );
  });

  it('only Saved jobs that are not set aside, soonest first', () => {
    const jobs = [
      saved('2026-10-30'),
      saved('2026-10-28'),
      saved('2026-10-29', { status: 'Applied', applied: '2026-10-27' }),
      saved('2026-10-31', { archived: true }),
    ];
    expect(respondByJobs(jobs, NOW).map((d) => d.dueDate)).toEqual(['2026-10-28', '2026-10-30']);
  });

  it('reads "Respond by" in the calendar, not "Follow up"', () => {
    const [ev] = jobIcsEvents(saved('2026-10-30', { label: 'Fab shop bid' }), NOW);
    expect(ev.summary).toBe('Respond by: Fab shop bid');
    expect(ev.date).toBe('2026-10-30');
  });
});
