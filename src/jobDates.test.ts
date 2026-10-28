import { describe, expect, it } from 'vitest';
import {
  closingOf,
  dateLabel,
  isClosed,
  isClosingSoon,
  normDate,
  recordLiveness,
  savedAtOf,
} from './jobDates';
import type { Job } from './types';
import { closingDayOf } from './feed/sources/http';

const NOW = new Date(2026, 9, 28, 12); // Wed, Oct 28 2026, local noon
const job = (patch: Partial<Job> = {}): Job => ({
  url: 'https://acme.example/jobs/1',
  label: 'Designer',
  status: 'Saved',
  ...patch,
});

describe('normDate', () => {
  it.each([
    ['2026-10-27', '2026-10-27'],
    ['2026-10-27T09:00:00Z', '2026-10-27T09:00:00Z'],
    [' 2026-10-27T09:00:00-05:00 ', '2026-10-27T09:00:00-05:00'],
  ])('keeps %s', (raw, out) => expect(normDate(raw)).toBe(out));

  it.each([undefined, null, 42, '', 'soon', 'x'.repeat(60), {}])('drops %s', (raw) =>
    expect(normDate(raw)).toBeUndefined(),
  );
});

describe('savedAtOf (backfill)', () => {
  it('keeps a stored savedAt', () => {
    expect(savedAtOf(job({ savedAt: '2026-10-20T10:00:00Z' }))).toBe('2026-10-20T10:00:00Z');
  });
  it('reads the first Saved entry of the history', () => {
    const history = [
      { status: 'Saved' as const, at: '2026-10-01' },
      { status: 'Applied' as const, at: '2026-10-03' },
    ];
    expect(savedAtOf(job({ history }))).toBe('2026-10-01');
  });
  it('is blank when nothing says when it was saved (an applied date is not a save date)', () => {
    expect(savedAtOf(job({ applied: '2026-10-03', status: 'Applied' }))).toBeUndefined();
    expect(savedAtOf(job({ history: [{ status: 'Applied', at: '2026-10-03' }] }))).toBeUndefined();
  });
});

describe('closingDayOf (a source closing date → the employer’s calendar day)', () => {
  it.each([
    ['2026-11-01T23:45:00-05:00', '2026-11-01'], // Greenhouse application_deadline
    ['2026-11-01', '2026-11-01'],
    ['2026-11-01T00:00:00.000Z', '2026-11-01'],
  ])('%s → %s', (raw, day) => expect(closingDayOf(raw)).toBe(day));

  it.each([null, undefined, '', 'next week', '2026-02-30', 7])('%s → undefined', (raw) =>
    expect(closingDayOf(raw)).toBeUndefined(),
  );
});

describe('dateLabel (one date per job: posted, else found)', () => {
  it.each<[string, Partial<Job>, string | null]>([
    [
      'posted wins over found and saved',
      {
        postedAt: '2026-10-25',
        discoveredAt: '2026-10-27T15:00:00',
        savedAt: '2026-10-27T15:00:00',
      },
      'Posted 3d ago',
    ],
    ['posted today', { postedAt: '2026-10-28' }, 'Posted today'],
    ['a future posted date reads as today', { postedAt: '2026-10-30' }, 'Posted today'],
    [
      'no posted date: when the feed found it',
      { discoveredAt: '2026-10-27T15:00:00' },
      'Found 1d ago',
    ],
    ['saved by hand: found when saved', { savedAt: '2026-10-21T15:00:00' }, 'Found 7d ago'],
    ['nothing known', {}, null],
  ])('%s', (_name, patch, label) => expect(dateLabel(job(patch), NOW)).toBe(label));
});

describe('closingOf', () => {
  it.each<[string, Partial<Job>, ReturnType<typeof closingOf>]>([
    ['nothing known', {}, null],
    [
      'gone from its board',
      { closedAt: '2026-10-26T10:00:00Z' },
      { kind: 'closed', label: 'Closed' },
    ],
    ['closes today', { deadline: '2026-10-28' }, { kind: 'soon', label: 'Closes Oct 28' }],
    ['closes in 6 days', { deadline: '2026-11-03' }, { kind: 'soon', label: 'Closes Nov 3' }],
    [
      'closes in 7 days: past the Next 7 days window',
      { deadline: '2026-11-04' },
      { kind: 'later', label: 'Closes Nov 4' },
    ],
    ['applied: a closing day no longer shows', { deadline: '2026-11-03', status: 'Applied' }, null],
    [
      'interviewing: a gone posting no longer shows',
      { closedAt: '2026-10-26T10:00:00Z', status: 'Interviewing' },
      null,
    ],
    ['closed yesterday', { deadline: '2026-10-27' }, { kind: 'closed', label: 'Closed' }],
  ])('%s', (_name, patch, out) => expect(closingOf(job(patch), NOW)).toEqual(out));
});

describe('the Closing soon and Closed filters', () => {
  it.each<[string, Partial<Job>, boolean, boolean]>([
    // name, job, closing soon, closed
    ['no dates', {}, false, false],
    ['closes in 3 days', { deadline: '2026-10-31' }, true, false],
    ['closes in 6 days', { deadline: '2026-11-03' }, true, false],
    ['closes in 7 days', { deadline: '2026-11-04' }, false, false],
    [
      'already applied: closing no longer matters',
      { deadline: '2026-10-31', status: 'Applied' },
      false,
      false,
    ],
    ['set aside', { deadline: '2026-10-31', archived: true }, false, false],
    ['deadline passed', { deadline: '2026-10-20' }, false, true],
    [
      'gone from its board',
      { closedAt: '2026-10-26T10:00:00Z', deadline: '2026-10-31' },
      false,
      true,
    ],
    [
      'gone from its board after applying',
      { closedAt: '2026-10-26T10:00:00Z', status: 'Applied' },
      false,
      true,
    ],
    ['set aside and gone', { closedAt: '2026-10-26T10:00:00Z', archived: true }, false, false],
  ])('%s', (_name, patch, soon, closed) => {
    expect(isClosingSoon(job(patch), NOW)).toBe(soon);
    expect(isClosed(job(patch), NOW)).toBe(closed);
  });
});

describe('recordLiveness (closedAt from a board check)', () => {
  const A = job({ url: 'https://jobs.ashbyhq.com/ramp/a' });
  const B = job({ url: 'https://jobs.ashbyhq.com/ramp/b', closedAt: '2026-10-20T00:00:00Z' });
  const C = job({ url: 'https://jobs.ashbyhq.com/ramp/c' });
  const at = '2026-10-28T12:00:00.000Z';

  it('stamps closedAt on a job gone from its board, keeps the first stamp, clears it when it is back', () => {
    const out = recordLiveness(
      [A, B, C],
      new Map([
        [A.url, { state: 'closed' as const, checkedAt: at }],
        [B.url, { state: 'closed' as const, checkedAt: at }],
        [C.url, { state: 'open' as const, checkedAt: at }],
      ]),
    );
    expect(out[0].closedAt).toBe(at);
    expect(out[1].closedAt).toBe('2026-10-20T00:00:00Z');
    expect('closedAt' in out[2]).toBe(false);

    const back = recordLiveness(out, new Map([[B.url, { state: 'open' as const, checkedAt: at }]]));
    expect('closedAt' in back[1]).toBe(false);
  });

  it('an unknown answer changes nothing, and nothing changed returns the same list', () => {
    const list = [A, B];
    expect(
      recordLiveness(list, new Map([[B.url, { state: 'unknown' as const, checkedAt: at }]])),
    ).toBe(list);
  });
});
