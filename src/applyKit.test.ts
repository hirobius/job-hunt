import { describe, expect, it } from 'vitest';
import { emptyKit, mergeKit, sanitizeKit } from './applyKit';
import { followUpDate, followUpJobs, toApplyQueue } from './applyQueue';
import { mergeBlob, readBlob, writeBlob, emptyBlob, BLOB_VERSION } from './syncBlob';
import type { Job } from './types';

const job = (url: string, extra: Partial<Job> = {}): Job => ({
  url,
  label: url,
  status: 'Saved',
  ...extra,
});

describe('apply queue', () => {
  it('lists Saved, not set aside, pinned first then newest', () => {
    const jobs = [
      job('https://a.com/1'),
      job('https://a.com/2', { priority: true }),
      job('https://a.com/3'),
      job('https://a.com/4', { status: 'Applied', applied: '2026-10-01' }),
      job('https://a.com/5', { archived: true }),
    ];
    expect(toApplyQueue(jobs).map((j) => j.url)).toEqual([
      'https://a.com/2',
      'https://a.com/3',
      'https://a.com/1',
    ]);
  });

  it('follow-ups are applied or interviewing, soonest first, due 7 days after contact', () => {
    const jobs = [
      job('https://a.com/1', { status: 'Applied', applied: '2026-10-10' }),
      job('https://a.com/2', { status: 'Interviewing', applied: '2026-10-01' }),
      job('https://a.com/3', { status: 'Rejected', applied: '2026-10-01' }),
      job('https://a.com/4'),
    ];
    expect(followUpJobs(jobs).map((j) => j.url)).toEqual(['https://a.com/2', 'https://a.com/1']);
    expect(followUpDate(jobs[0])).toBe('2026-10-17');
    expect(followUpDate(job('x', { applied: '2026-10-01', followUp: '2026-10-28' }))).toBe(
      '2026-11-04',
    );
  });
});

describe('application kit', () => {
  it('sanitizes junk and keeps known fields', () => {
    expect(sanitizeKit(null)).toEqual(emptyKit());
    expect(
      sanitizeKit({
        fields: { name: 'Sam', bogus: 'x', email: 3 },
        answers: [{ id: 'a', q: 'Why?', a: 'Because' }, { q: 'no id' }, null],
        whyTemplate: 'tpl-1',
      }),
    ).toEqual({
      fields: { name: 'Sam' },
      answers: [{ id: 'a', q: 'Why?', a: 'Because' }],
      whyTemplate: 'tpl-1',
    });
  });

  it('merges: cloud wins per field, local-only fields and answers are kept', () => {
    const cloud = { fields: { name: 'Cloud' }, answers: [{ id: 'a', q: 'Q', a: 'cloud' }] };
    const local = {
      fields: { name: 'Local', phone: '555-0100' },
      answers: [
        { id: 'a', q: 'Q', a: 'local' },
        { id: 'b', q: 'Q2', a: 'b' },
      ],
    };
    const m = mergeKit(cloud, local);
    expect(m.fields).toEqual({ name: 'Cloud', phone: '555-0100' });
    expect(m.answers.map((x) => x.a)).toEqual(['cloud', 'b']);
  });

  it('rides in the sync blob (since v6); an older cloud copy keeps this device kit on refresh', () => {
    expect(BLOB_VERSION).toBe(8);
    const local = { ...emptyBlob(), kit: { fields: { name: 'Sam' }, answers: [] } };
    const written = writeBlob(local);
    expect(written.v).toBe(8);
    expect(readBlob(written).kit.fields.name).toBe('Sam');
    const oldCloud = readBlob({ v: 5, jobs: [] });
    expect(mergeBlob(oldCloud, local, false).kit.fields.name).toBe('Sam');
    const newCloud = readBlob({ v: 6, kit: { fields: { name: 'Cloud' } } });
    expect(mergeBlob(newCloud, local, false).kit.fields.name).toBe('Cloud');
    expect(mergeBlob(newCloud, local, true).kit.fields.name).toBe('Cloud');
  });
});
