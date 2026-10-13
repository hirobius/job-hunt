import { describe, expect, it } from 'vitest';
import { readBlob, mergeBlob, emptyBlob, writeBlob, BLOB_VERSION, type SyncData } from './syncBlob';
import type { Job } from './types';

const job = (url: string, label = url): Job => ({ url, label, status: 'Saved' });

const blob = (over: Partial<SyncData> = {}): SyncData => ({ ...emptyBlob(), ...over });

describe('readBlob — tolerant of every historical shape', () => {
  it('v1: a bare array is the legacy jobs-only blob', () => {
    const r = readBlob([job('a')]);
    expect(r.jobs).toHaveLength(1);
    expect(r.triage).toEqual({ pinned: [], dismissed: [] });
    expect(r.legacyUserTiles).toEqual([]);
  });

  it('v3: ignores pillars + cloud pins, surfaces userTiles as legacyUserTiles', () => {
    const r = readBlob({
      v: 3,
      jobs: [job('a')],
      pillars: [{ id: 'p', label: 'P' }],
      copydeck: [{ id: 's', label: 'S', body: '' }],
      triage: { pinned: ['x'], dismissed: ['y'] },
      userTiles: [{ name: 'Mine', meta: 'Added by you', url: 'https://mine.example' }, { bad: 1 }],
    });
    expect(r).not.toHaveProperty('pillars');
    expect(r.copydeck).toHaveLength(1);
    expect(r.triage).toEqual({ pinned: [], dismissed: ['y'] });
    expect(r.legacyUserTiles).toEqual([
      { name: 'Mine', meta: 'Added by you', url: 'https://mine.example' },
    ]);
  });

  it('v4: reads jobs, copydeck, set-aside', () => {
    const r = readBlob({ v: 4, jobs: [job('a')], copydeck: [], triage: { dismissed: ['y'] } });
    expect(r.jobs).toHaveLength(1);
    expect(r.triage.dismissed).toEqual(['y']);
    expect(r.legacyUserTiles).toEqual([]);
  });

  it.each([null, undefined, 'junk', 42, { jobs: 'nope', triage: 'x' }])(
    'junk input %j → empty blob',
    (input) => {
      expect(readBlob(input)).toEqual(emptyBlob());
    },
  );
});

describe('writeBlob — v4 shape', () => {
  it('writes only jobs, copydeck and set-aside (no pillars, userTiles or pins)', () => {
    const out = writeBlob(blob({ jobs: [job('a')], triage: { pinned: ['p'], dismissed: ['d'] } }));
    expect(BLOB_VERSION).toBe(4);
    expect(out).toEqual({ v: 4, jobs: [job('a')], copydeck: [], triage: { dismissed: ['d'] } });
  });

  it('round-trips through readBlob', () => {
    const data = blob({ jobs: [job('a')], triage: { pinned: [], dismissed: ['d'] } });
    expect(readBlob(writeBlob(data))).toEqual(data);
  });
});

describe('mergeBlob — seed (first sign-in)', () => {
  it('merges each field; cloud wins on shared keys, local order kept', () => {
    const local = blob({ jobs: [job('a', 'local-a'), job('b')] });
    const cloud = blob({ jobs: [job('a', 'cloud-a'), job('c')] });
    const out = mergeBlob(cloud, local, true);
    expect(out.jobs.map((j) => j.url)).toEqual(['a', 'b', 'c']);
    expect(out.jobs.find((j) => j.url === 'a')!.label).toBe('cloud-a'); // cloud wins
  });

  it('set-aside from either side wins over a device-local pin', () => {
    const local = blob({ triage: { pinned: ['x', 'keep'], dismissed: [] } });
    const cloud = blob({ triage: { pinned: [], dismissed: ['x'] } });
    const out = mergeBlob(cloud, local, true);
    expect(out.triage.dismissed).toContain('x');
    expect(out.triage.pinned).toEqual(['keep']);
  });

  it('handles a null cloud (nothing in the cloud yet)', () => {
    const local = blob({ jobs: [job('a')] });
    expect(mergeBlob(null, local, true).jobs.map((j) => j.url)).toEqual(['a']);
  });

  it('passes the cloud legacy tiles through for the one-time fold', () => {
    const tile = { name: 'n', meta: '', url: 'https://t.example' };
    expect(mergeBlob(blob({ legacyUserTiles: [tile] }), blob(), true).legacyUserTiles).toEqual([
      tile,
    ]);
  });
});

describe('mergeBlob — refresh (focus re-pull)', () => {
  it('takes cloud as the source of truth when present', () => {
    const local = blob({ jobs: [job('a')] });
    const cloud = blob({ jobs: [job('z')] });
    expect(mergeBlob(cloud, local, false).jobs.map((j) => j.url)).toEqual(['z']);
  });

  it('keeps device-local pins (pins are no longer synced)', () => {
    const local = blob({ triage: { pinned: ['p'], dismissed: [] } });
    const cloud = blob({ triage: { pinned: [], dismissed: ['d'] } });
    expect(mergeBlob(cloud, local, false).triage).toEqual({ pinned: ['p'], dismissed: ['d'] });
  });

  it('keeps local when the cloud is empty', () => {
    const local = blob({ jobs: [job('a')] });
    expect(mergeBlob(null, local, false)).toBe(local);
  });
});

describe('sample data (#110) never reaches the cloud', () => {
  const sample = { ...job('https://larkspur.example.com/a'), demo: true } as Job;
  const real = job('https://boards.greenhouse.io/acme/jobs/1');

  it('writeBlob drops demo-tagged jobs', () => {
    expect(writeBlob(blob({ jobs: [sample, real] })).jobs).toEqual([real]);
  });

  it('a first-sign-in merge keeps the sample on this device, but the push omits it', () => {
    const merged = mergeBlob(
      blob({ jobs: [job('https://c.example.org/x')] }),
      blob({ jobs: [sample, real] }),
      true,
    );
    expect(merged.jobs).toContainEqual(sample);
    expect(writeBlob(merged).jobs).not.toContainEqual(sample);
  });

  it('a refresh keeps this device’s sample instead of wiping it with the cloud copy', () => {
    const merged = mergeBlob(blob({ jobs: [real] }), blob({ jobs: [sample] }), false);
    expect(merged.jobs).toEqual([real, sample]);
  });
});
