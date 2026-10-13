import { describe, expect, it } from 'vitest';
import { addEvent, followUpDate, hash, jobIcsEvents, removeEvent, weekAgenda } from './jobEvents';
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

describe('weekAgenda', () => {
  it('includes Mon–Sun events and excludes the neighbours', () => {
    const j = job({
      events: [
        ev('sun-before', '2026-10-11'),
        ev('mon', '2026-10-12', '09:00'),
        ev('sun', '2026-10-18', '17:00', 'call'),
        ev('mon-after', '2026-10-19'),
      ],
    });
    const dates = weekAgenda([j], WED)
      .filter((i) => i.kind !== 'followup')
      .map((i) => i.date);
    expect(dates).toEqual(['2026-10-12', '2026-10-18']);
  });

  it('week edges: Sunday night is still the old week, Monday starts the next', () => {
    const j = job({ events: [ev('a', '2026-10-18'), ev('b', '2026-10-19')] });
    const pick = (now: Date) =>
      weekAgenda([j], now)
        .filter((i) => i.kind !== 'followup')
        .map((i) => i.date);
    expect(pick(SUN)).toEqual(['2026-10-18']);
    expect(pick(MON)).toEqual(['2026-10-19']);
  });

  it('puts overdue follow-ups on today with overdue: true', () => {
    expect(weekAgenda([job({ applied: '2026-09-20' })], WED)).toEqual([
      expect.objectContaining({ kind: 'followup', date: '2026-10-14', overdue: true }),
    ]);
  });

  it('shows a follow-up falling due later this week on its date, not overdue', () => {
    const [it] = weekAgenda([job({ applied: '2026-10-11' })], new Date(2026, 9, 13));
    expect(it).toMatchObject({ kind: 'followup', date: '2026-10-18' });
    expect(it.overdue).toBeUndefined();
  });

  it('omits follow-ups due next week', () => {
    expect(weekAgenda([job({ applied: '2026-10-14' })], WED)).toEqual([]);
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
    const out = weekAgenda([a, b], WED);
    expect(out.every((i) => i.jobUrl === 'u2')).toBe(true);
    expect(out.map((i) => i.time)).toEqual([undefined, '09:00', '13:00']);
  });
});
