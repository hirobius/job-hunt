import { describe, expect, it } from 'vitest';
import {
  emptyKit,
  filledTemplates,
  getApplyKit,
  mergeKit,
  pruneKitTemplates,
  removeAnswer,
  replaceApplyKit,
  restoreAnswer,
  sanitizeKit,
} from './applyKit';
import { followUpJobs, toApplyQueue } from './applyQueue';
import * as applyQueue from './applyQueue';
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
    // One follow-up date rule: jobEvents.followUpDate (it counts a snooze), not a second copy here.
    expect('followUpDate' in applyQueue).toBe(false);
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

  it('prunes template picks whose message no longer exists (#314)', () => {
    const kit = {
      fields: { name: 'Sam' },
      answers: [],
      whyTemplate: 'gone',
      coverTemplate: 'still-here',
    };
    expect(pruneKitTemplates(kit, ['still-here'])).toEqual({
      fields: { name: 'Sam' },
      answers: [],
      whyTemplate: undefined,
      coverTemplate: 'still-here',
    });
    // Both picks live (or absent): the kit is returned untouched.
    expect(pruneKitTemplates(kit, new Set(['gone', 'still-here']))).toBe(kit);
    expect(pruneKitTemplates(emptyKit(), [])).toEqual(emptyKit());
  });

  it('rides in the sync blob (since v6); an older cloud copy keeps this device kit on refresh', () => {
    expect(BLOB_VERSION).toBe(12);
    const local = { ...emptyBlob(), kit: { fields: { name: 'Sam' }, answers: [] } };
    const written = writeBlob(local);
    expect(written.v).toBe(12);
    expect(readBlob(written).kit.fields.name).toBe('Sam');
    const oldCloud = readBlob({ v: 5, jobs: [] });
    expect(mergeBlob(oldCloud, local, false).kit.fields.name).toBe('Sam');
    const newCloud = readBlob({ v: 6, kit: { fields: { name: 'Cloud' } } });
    expect(mergeBlob(newCloud, local, false).kit.fields.name).toBe('Cloud');
    expect(mergeBlob(newCloud, local, true).kit.fields.name).toBe('Cloud');
  });
});

describe('Apply sheet templates (#239)', () => {
  const snip = (id: string, body: string, extra = {}) => ({ id, label: id, body, ...extra });
  it('fills every template for the job, pinned first, kit name for [Your name]', () => {
    const rows = filledTemplates(
      [
        snip('intro', 'Hi [Contact] at [Company], [Your name]'),
        snip('cover', 'Applying for [Role] · [Missing]', { pinned: true }),
        snip('blank', '   '),
      ],
      job('https://a.com/1', { label: 'Designer', company: 'Acme' }),
      'Sam',
    );
    expect(rows).toEqual([
      { id: 'cover', label: 'cover', text: 'Applying for Designer · [Missing]' },
      { id: 'intro', label: 'intro', text: 'Hi [Contact] at Acme, Sam' },
    ]);
  });
  it('names an unlabelled template', () => {
    expect(filledTemplates([{ id: 'x', label: ' ', body: 'b' }], job('u'))[0].label).toBe(
      'Untitled',
    );
  });
});

describe('restoreAnswer (Undo of a Remove)', () => {
  const qa = (id: string) => ({ id, q: id, a: '' });
  it('puts the answer back at its place, once, and clamps a place past the end', () => {
    replaceApplyKit({ ...emptyKit(), answers: [qa('a'), qa('b'), qa('c')] });
    removeAnswer('b');
    restoreAnswer(qa('b'), 1);
    restoreAnswer(qa('b'), 1);
    expect(getApplyKit().answers.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    removeAnswer('c');
    removeAnswer('b');
    restoreAnswer(qa('c'), 2);
    expect(getApplyKit().answers.map((x) => x.id)).toEqual(['a', 'c']);
  });
});
