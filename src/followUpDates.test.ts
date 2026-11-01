// Follow-up dates across day boundaries (audit 2026-10-27). The follow-up loop counts calendar
// days in local time, so the day `followUpDate` names and the moment `deriveJobState` calls it due
// must agree in every time zone, across a daylight-saving change too. Each case runs in a real
// DST zone with the clock faked; the zone is put back after.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { daysSince, deriveJobState, localDay, snoozeFollowUp } from './jobState';
import {
  dueFollowUps,
  followUpDate,
  jobIcsEvents,
  nextEventEnd,
  respondByJobs,
  upcomingEvents,
  ymd,
} from './jobEvents';
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

  it('reads "Apply by" in the calendar, not "Follow up" (#419: any closing day, not only a bid)', () => {
    const [ev] = jobIcsEvents(saved('2026-10-30', { label: 'Fab shop bid' }), NOW);
    expect(ev.summary).toBe('Apply by: Fab shop bid');
    expect(ev.date).toBe('2026-10-30');
  });
});

describe('a timestamped applied / followUp reads its local day (#310)', () => {
  const inZone = (zone: string, fn: () => void) => {
    const was = process.env.TZ;
    process.env.TZ = zone;
    try {
      fn();
    } finally {
      process.env.TZ = was;
    }
  };
  // [zone, stored applied, local day, the eve of the follow-up day, the follow-up day's midnight]
  const cases: [string, string, string, [number, number, number, number, number], string][] = [
    // UTC−7: 03:00Z on Oct 20 is 8 pm on Oct 19, so the follow-up falls on Oct 26, not Oct 27.
    [
      'America/Los_Angeles',
      '2026-10-20T03:00:00Z',
      '2026-10-19',
      [2026, 9, 25, 21, 0],
      '2026-10-26',
    ],
    // UTC+9: 20:00Z on Oct 20 is 5 am on Oct 21, so the follow-up falls on Oct 28.
    ['Asia/Tokyo', '2026-10-20T20:00:00Z', '2026-10-21', [2026, 9, 27, 21, 0], '2026-10-28'],
  ];
  it.each(cases)('%s: applied %s', (zone, applied, day, [y, mo, d, h, mi], fu) =>
    inZone(zone, () => {
      expect(localDay(applied)).toBe(day);
      const j = job({ applied });
      const eve = new Date(y, mo, d, h, mi);
      const midnight = new Date(y, mo, d + 1, 0, 0);
      expect(followUpDate(j, eve)).toBe(fu);
      expect(deriveJobState(j, eve).followUp.due).toBe(false);
      expect(followUpDate(j, midnight)).toBe(fu);
      expect(deriveJobState(j, midnight).followUp.due).toBe(true);
      // A logged follow-up reads the same way.
      const f = job({ applied: '2026-10-01', followUp: applied });
      expect(followUpDate(f, midnight)).toBe(fu);
      expect(deriveJobState(f, eve).followUp.due).toBe(false);
      expect(deriveJobState(f, midnight).followUp.due).toBe(true);
    }),
  );

  it('keeps a bare day and drops what is not a date', () => {
    expect(localDay('2026-10-20')).toBe('2026-10-20');
    // A day with trailing words keeps its day, as the old 10-character read did.
    expect(localDay('2026-10-20 (approx)')).toBe('2026-10-20');
    // A bare day exported as UTC midnight is that day, not the evening before west of UTC.
    inZone('America/Los_Angeles', () => {
      expect(localDay('2026-10-20T00:00:00.000Z')).toBe('2026-10-20');
    });
    expect(localDay('soon')).toBeUndefined();
    expect(localDay(undefined)).toBeUndefined();
  });
});

describe('Next 7 days drops a timed event once it has ended (#311)', () => {
  const withEvents = job({
    status: 'Interviewing',
    events: [
      { id: 'a', kind: 'interview', date: '2026-10-27', time: '09:00' },
      { id: 'b', kind: 'call', date: '2026-10-27', time: '13:00', durationMin: 30 },
      { id: 'c', kind: 'other', date: '2026-10-27' },
    ],
  });
  // [now (local), ids still listed]
  const cases: [[number, number], string[]][] = [
    [
      [8, 0],
      ['c', 'a', 'b'],
    ], // before both
    [
      [9, 30],
      ['c', 'a', 'b'],
    ], // during the interview (60 min by default)
    [
      [10, 0],
      ['c', 'b'],
    ], // the interview just ended
    [
      [13, 29],
      ['c', 'b'],
    ], // during the call
    [[13, 30], ['c']], // the call ended; the all-day event stays through the day
    [[23, 59], ['c']],
  ];
  it.each(cases)('at %j → %j', ([h, mi], ids) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 27, h, mi));
    expect(upcomingEvents([withEvents], new Date()).map((e) => e.id)).toEqual(ids);
  });

  it('names the next moment the list changes: the soonest end still to come today', () => {
    expect(nextEventEnd([withEvents], new Date(2026, 9, 27, 8, 0))).toEqual(
      new Date(2026, 9, 27, 10, 0),
    );
    expect(nextEventEnd([withEvents], new Date(2026, 9, 27, 10, 0))).toEqual(
      new Date(2026, 9, 27, 13, 30),
    );
    expect(nextEventEnd([withEvents], new Date(2026, 9, 27, 13, 30))).toBeNull();
  });

  it('keeps tomorrow’s timed events whatever the time today', () => {
    const j = job({ events: [{ id: 't', kind: 'call', date: '2026-10-28', time: '08:00' }] });
    expect(upcomingEvents([j], new Date(2026, 9, 27, 23, 0)).map((e) => e.id)).toEqual(['t']);
  });
});
