// Daily picks (2026-11-05): the scheduled run's hand-picked roles, read from the user's own
// `daily_picks` rows. This pins the read model: what a row may hold, which picks show, and what a
// Save writes on the Job.
import { describe, expect, it } from 'vitest';
import {
  openPicks,
  pickFacts,
  pickFingerprint,
  pickFromRow,
  pickJobFields,
  pickNotes,
} from './picks';

const row = (o: Record<string, unknown> = {}) => ({
  id: 1,
  picked_on: '2026-11-04',
  company: 'Onward Search',
  title: 'Design Systems Designer',
  employment: 'contract',
  pay: '$75–$90/hr',
  posted_on: null,
  url: 'https://onwardsearch.com/jobs/1',
  why: 'Best pay found, remote US-only contract.',
  note: 'Hi, I would like to be considered for the remote contract.',
  ...o,
});

describe('pickFromRow', () => {
  it('reads a stored row', () => {
    expect(pickFromRow(row())).toEqual({
      id: 1,
      pickedOn: '2026-11-04',
      company: 'Onward Search',
      title: 'Design Systems Designer',
      employment: 'contract',
      pay: '$75–$90/hr',
      url: 'https://onwardsearch.com/jobs/1',
      why: 'Best pay found, remote US-only contract.',
      note: 'Hi, I would like to be considered for the remote contract.',
    });
  });

  it('keeps a posted day', () => {
    expect(pickFromRow(row({ posted_on: '2026-11-03' }))?.postedOn).toBe('2026-11-03');
  });

  it('drops a row whose link is not http(s), or with no title', () => {
    expect(pickFromRow(row({ url: 'javascript:alert(1)' }))).toBeNull();
    expect(pickFromRow(row({ url: 'data:text/html,x' }))).toBeNull();
    expect(pickFromRow(row({ title: '  ' }))).toBeNull();
    expect(pickFromRow(null)).toBeNull();
  });

  it('reads an unknown employment as unknown', () => {
    expect(pickFromRow(row({ employment: 'freelance' }))?.employment).toBe('unknown');
  });
});

describe('openPicks', () => {
  const a = pickFromRow(row({ id: 1, picked_on: '2026-11-03', url: 'https://a.com/1' }))!;
  const b = pickFromRow(
    row({
      id: 2,
      picked_on: '2026-11-04',
      url: 'https://b.com/2',
      title: 'UX Engineer',
      company: 'Demandbase',
    }),
  )!;
  const c = pickFromRow(
    row({
      id: 3,
      picked_on: '2026-11-04',
      url: 'https://c.com/3',
      title: 'DS Engineer',
      company: 'ClickHouse',
    }),
  )!;

  it('lists the newest day first, the run’s own order within a day', () => {
    expect(openPicks([a, b, c], [], new Set()).map((p) => p.id)).toEqual([2, 3, 1]);
  });

  it('leaves out a pick already saved (by link, ignoring tracking bits)', () => {
    expect(openPicks([a, b], ['https://b.com/2?utm_source=x'], new Set()).map((p) => p.id)).toEqual(
      [1],
    );
  });

  it('leaves out a skipped pick (by posting fingerprint)', () => {
    const skipped = new Set([pickFingerprint(c)]);
    expect(openPicks([b, c], [], skipped).map((p) => p.id)).toEqual([2]);
  });
});

describe('pickFacts', () => {
  it('says contract or employee, the pay, and the posted day', () => {
    const p = pickFromRow(row({ posted_on: '2026-11-03' }))!;
    expect(pickFacts(p)).toEqual(['Contract', '$75–$90/hr', 'Posted Nov 3']);
  });

  it('says when pay or the posted day was not found', () => {
    const p = pickFromRow(row({ employment: 'employee', pay: '' }))!;
    expect(pickFacts(p)).toEqual(['Employee', 'Pay not found', 'Posted date not found']);
  });
});

describe('Save', () => {
  const p = pickFromRow(row({ posted_on: '2026-11-03' }))!;

  it('puts the draft note and the fit line in the Job’s notes', () => {
    expect(pickNotes(p)).toBe(
      'Draft note to the hiring manager:\nHi, I would like to be considered for the remote contract.\n\nWhy it fits: Best pay found, remote US-only contract.',
    );
  });

  it('saves the title, company, pay and posted day', () => {
    expect(pickJobFields(p)).toEqual({
      label: 'Design Systems Designer',
      company: 'Onward Search',
      salary: '$75–$90/hr',
      postedAt: '2026-11-03',
      notes: pickNotes(p),
    });
  });
});
