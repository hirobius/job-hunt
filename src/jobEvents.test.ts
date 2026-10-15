import { describe, expect, it } from 'vitest';
import {
  addEvent,
  dueFollowUps,
  followUpDate,
  hash,
  jobIcsEvents,
  removeEvent,
  upcomingEvents,
} from './jobEvents';
import type { Job, JobEvent } from './types';

// Wed 2026-10-14 (local). Week = Mon 10-12 … Sun 10-18.
const WED = new Date(2026, 9, 14, 10, 0);
const SUN = new Date(2026, 9, 18, 23, 30);
const MON = new Date(2026, 9, 19, 0, 5);

const job = (over: Partial<Job> = {}): Job => ({
  url: 'https://x.test/a',
  label: 'Welder',
  company: 'Acme',
  status: 'Applied',
  applied: '2026-10-14',
  ...over,
});
const ev = (id: string, date: string, time?: string, kind: JobEvent['kind'] = 'interview') => ({
  id,
  kind,
  date,
  time,
});
let n = 0;
const gen = () => `id${++n}`;

describe('addEvent', () => {
  it.each([
    ['empty date', ''],
    ['bad format', '10/14/2026'],
    ['impossible date', '2026-02-31'],
  ])('ignores %s', (_n, date) => {
    expect(addEvent([], { kind: 'call', date }, gen)).toEqual([]);
  });

  it('sorts by date then time and trims the note', () => {
    let l = addEvent(
      undefined,
      { kind: 'interview', date: '2026-10-20', time: '14:00' },
      () => 'b',
    );
    l = addEvent(l, { kind: 'call', date: '2026-10-20', time: '09:00', note: ' hi ' }, () => 'a');
    l = addEvent(l, { kind: 'other', date: '2026-10-01' }, () => 'c');
    expect(l.map((e) => e.id)).toEqual(['c', 'a', 'b']);
    expect(l[1].note).toBe('hi');
  });

  it('does not mutate the input and drops invalid times', () => {
    const src: JobEvent[] = [];
    const out = addEvent(src, { kind: 'call', date: '2026-10-20', time: '25:00' }, () => 'x');
    expect(src).toEqual([]);
    expect(out[0].time).toBeUndefined();
  });
});

describe('removeEvent', () => {
  it('removes by id', () => {
    const l = [ev('a', '2026-10-20'), ev('b', '2026-10-21')];
    expect(removeEvent(l, 'a').map((e) => e.id)).toEqual(['b']);
    expect(removeEvent(undefined, 'a')).toEqual([]);
  });
});

describe('followUpDate', () => {
  it.each([
    ['applied + 7d', job(), '2026-10-21'],
    ['followUp wins over applied', job({ followUp: '2026-10-16' }), '2026-10-23'],
    ['month rollover', job({ applied: '2026-10-28' }), '2026-11-04'],
    ['Saved is not tracked', job({ status: 'Saved' }), null],
    ['archived', job({ archived: true }), null],
    ['no reference date', job({ applied: undefined }), null],
  ])('%s', (_n, j, want) => {
    expect(followUpDate(j, WED)).toBe(want);
  });
});

describe('jobIcsEvents', () => {
  const j = job({
    events: [
      ev('past', '2026-10-01', '09:00'),
      ev('today', '2026-10-14', '15:00'),
      ev('later', '2026-10-30'),
    ],
  });

  it('keeps only upcoming events and adds the follow-up all-day', () => {
    const out = jobIcsEvents(j, WED);
    expect(out.map((e) => e.uid)).toEqual([
      `${hash(j.url)}-today`,
      `${hash(j.url)}-later`,
      `${hash(j.url)}-followup`,
    ]);
    expect(out[0].summary).toBe('Interview: Welder (Acme)');
    expect(out[2]).toMatchObject({ summary: 'Follow up: Welder (Acme)', date: '2026-10-21' });
    expect(out[2].time).toBeUndefined();
    expect(out[0].description).toContain(j.url);
  });

  it('UIDs are stable across calls and distinct across jobs', () => {
    expect(jobIcsEvents(j, WED).map((e) => e.uid)).toEqual(jobIcsEvents(j, WED).map((e) => e.uid));
    expect(hash('a')).not.toBe(hash('b'));
    expect(jobIcsEvents({ ...j, url: 'https://x.test/b' }, WED)[0].uid).not.toBe(
      jobIcsEvents(j, WED)[0].uid,
    );
  });

  it('is empty with nothing upcoming', () => {
    const j2 = job({ status: 'Saved', events: [ev('p', '2026-01-01')] });
    expect(jobIcsEvents(j2, WED)).toEqual([]);
  });
});

describe('upcomingEvents', () => {
  it('lists interviews and calls from today through the next 6 days', () => {
    const j = job({
      events: [
        ev('yesterday', '2026-10-13'),
        ev('today', '2026-10-14', '09:00'),
        ev('in-6', '2026-10-20', '17:00', 'call'),
        ev('in-7', '2026-10-21'),
      ],
    });
    expect(upcomingEvents([j], WED).map((i) => i.date)).toEqual(['2026-10-14', '2026-10-20']);
  });

  it('rolls with the day, not the calendar week', () => {
    const j = job({ events: [ev('a', '2026-10-18'), ev('b', '2026-10-19')] });
    expect(upcomingEvents([j], SUN).map((i) => i.date)).toEqual(['2026-10-18', '2026-10-19']);
    expect(upcomingEvents([j], MON).map((i) => i.date)).toEqual(['2026-10-19']);
  });

  it('carries what the row shows: kind, time, note, job and company', () => {
    const j = job({
      events: [{ id: 'e', kind: 'call', date: '2026-10-15', time: '11:00', note: 'Recruiter' }],
    });
    expect(upcomingEvents([j], WED)).toEqual([
      {
        id: 'e',
        kind: 'call',
        date: '2026-10-15',
        time: '11:00',
        note: 'Recruiter',
        jobUrl: 'https://x.test/a',
        label: 'Welder',
        company: 'Acme',
      },
    ]);
  });

  it('excludes archived jobs and sorts all-day first, then by time', () => {
    const a = job({ url: 'u1', archived: true, events: [ev('x', '2026-10-14', '08:00')] });
    const b = job({
      url: 'u2',
      status: 'Interviewing',
      events: [
        ev('t', '2026-10-15', '13:00'),
        ev('s', '2026-10-15', '09:00'),
        ev('d', '2026-10-15'),
      ],
    });
    const out = upcomingEvents([a, b], WED);
    expect(out.every((i) => i.jobUrl === 'u2')).toBe(true);
    expect(out.map((i) => i.time)).toEqual([undefined, '09:00', '13:00']);
  });

  it('holds no follow-ups (they are their own list)', () => {
    expect(upcomingEvents([job({ applied: '2026-09-20' })], WED)).toEqual([]);
  });
});

describe('dueFollowUps', () => {
  it('lists jobs whose follow-up is due, most overdue first, with the day it fell due', () => {
    const jobs = [
      job({ url: 'recent', applied: '2026-10-07' }),
      job({ url: 'old', applied: '2026-09-20' }),
      job({ url: 'not-yet', applied: '2026-10-10' }),
    ];
    expect(dueFollowUps(jobs, WED).map((d) => [d.job.url, d.dueDate])).toEqual([
      ['old', '2026-09-27'],
      ['recent', '2026-10-14'],
    ]);
  });

  it('a logged follow-up restarts the clock', () => {
    expect(dueFollowUps([job({ applied: '2026-09-20', followUp: '2026-10-10' })], WED)).toEqual([]);
  });

  it('skips archived jobs and stages without a follow-up loop', () => {
    const jobs = [
      job({ applied: '2026-09-20', archived: true }),
      job({ applied: '2026-09-20', status: 'Offer' }),
      job({ applied: '2026-09-20', status: 'Saved' }),
    ];
    expect(dueFollowUps(jobs, WED)).toEqual([]);
  });
});
