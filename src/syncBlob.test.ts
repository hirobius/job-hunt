import { describe, expect, it } from 'vitest';
import { readBlob, mergeBlob, emptyBlob, writeBlob, BLOB_VERSION, type SyncData } from './syncBlob';
import { EVIDENCE_MAX } from './radar/evidenceStore';
import type { Target } from './feed/targets';
import type { SavedFilter } from './feed/savedFilters';
import type { Job } from './types';

const job = (url: string, label = url): Job => ({ url, label, status: 'Saved' });

const target = (login: string): Target => ({
  login,
  company: login,
  repo: `${login}/ds`,
  repoUrl: `https://github.com/${login}/ds`,
  stars: 5,
  savedAt: '2026-10-01T00:00:00.000Z',
});
const search = (name: string): SavedFilter => ({
  name,
  term: 'design systems',
  where: '',
  mode: 'any',
  exclude: [],
  seniority: 'any',
  salaryOnly: false,
  contractOnly: false,
});

const removed = (url: string, label = url) => ({
  job: job(`https://${url}.example/1`, label),
  removedAt: new Date().toISOString(),
});

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
    expect(BLOB_VERSION).toBe(7);
    expect(out).toEqual({
      v: 7,
      jobs: [job('a')],
      copydeck: [],
      triage: { dismissed: ['d'] },
      targets: {},
      filters: {},
      evidence: '',
      modes: {},
      kit: { fields: {}, answers: [] },
      trash: [],
    });
  });

  it('round-trips through readBlob', () => {
    const data = blob({
      jobs: [job('a')],
      triage: { pinned: [], dismissed: ['d'] },
      targets: { t1: [target('acme')] },
      filters: { t1: [search('Austin')] },
      evidence: 'Led a design system',
      modes: { t1: 'hybrid' },
      trash: [removed('b')],
    });
    expect(readBlob(writeBlob(data))).toEqual({ ...data, sourceV: 7 });
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

describe('blob v5 — targets, saved searches, evidence, work mode', () => {
  it.each([
    ['a bare v1 array', [job('a')]],
    ['a v3 blob', { v: 3, jobs: [], copydeck: [], triage: { dismissed: [] } }],
    ['a v4 blob', { v: 4, jobs: [], copydeck: [], triage: { dismissed: [] } }],
  ])('%s reads with the new fields empty', (_n, data) => {
    const r = readBlob(data);
    expect(r.targets).toEqual({});
    expect(r.filters).toEqual({});
    expect(r.evidence).toBe('');
    expect(r.modes).toEqual({});
  });

  it('reads the v5 fields and drops malformed entries', () => {
    const r = readBlob({
      v: 5,
      targets: { t1: [target('acme'), { nope: 1 }], t2: 'junk' },
      filters: { t1: [search('A'), { name: '' }] },
      evidence: 42,
      modes: { t1: 'remote', t2: 'sideways', __proto__: 'remote' },
    });
    expect(r.targets.t1.map((t) => t.login)).toEqual(['acme']);
    expect(r.targets.t2).toBeUndefined();
    expect(r.filters.t1.map((f) => f.name)).toEqual(['A']);
    expect(r.evidence).toBe('');
    expect(r.modes).toEqual({ t1: 'remote' });
  });

  it('seed: unions targets by login and searches by name per track; cloud wins on a shared key', () => {
    const local = blob({
      targets: { t1: [target('acme'), target('local-only')], t2: [target('other')] },
      filters: { t1: [search('Austin'), search('Mine')] },
      modes: { t1: 'remote', t3: 'onsite' },
    });
    const cloud = blob({
      targets: { t1: [{ ...target('ACME'), stars: 99 }, target('cloud-only')] },
      filters: { t1: [{ ...search('austin'), term: 'cloud term' }] },
      modes: { t1: 'hybrid', t2: 'any' },
    });
    const out = mergeBlob(cloud, local, true);
    expect(out.targets.t1.map((t) => t.login)).toEqual(['ACME', 'local-only', 'cloud-only']);
    expect(out.targets.t1[0].stars).toBe(99);
    expect(out.targets.t2.map((t) => t.login)).toEqual(['other']);
    expect(out.filters.t1.map((f) => f.name)).toEqual(['austin', 'Mine']);
    expect(out.filters.t1[0].term).toBe('cloud term');
    expect(out.modes).toEqual({ t1: 'hybrid', t2: 'any', t3: 'onsite' });
  });

  it.each([
    ['cloud only', 'cloud text', '', 'cloud text'],
    ['same text', 'same', 'same', 'same'],
    ['local already contains cloud', 'short', 'short and more', 'short and more'],
    [
      'both differ: keep both',
      'cloud text',
      'local text',
      'cloud text\n\n--- From this device ---\n\nlocal text',
    ],
    ['cloud is empty', '', 'local text', 'local text'],
    ['both empty', '', '', ''],
  ])('seed evidence: %s', (_n, c, l, want) => {
    expect(mergeBlob(blob({ evidence: c }), blob({ evidence: l }), true).evidence).toBe(want);
  });

  it('reads evidence capped at EVIDENCE_MAX', () => {
    expect(readBlob({ v: 5, evidence: 'y'.repeat(EVIDENCE_MAX + 5) }).evidence).toHaveLength(
      EVIDENCE_MAX,
    );
  });

  it('seed with a null cloud keeps every local v5 field', () => {
    const local = blob({ targets: { t1: [target('a')] }, evidence: 'e', modes: { t1: 'remote' } });
    const out = mergeBlob(null, local, true);
    expect(out).toMatchObject({ targets: local.targets, evidence: 'e', modes: local.modes });
  });

  it('refresh: a v5 cloud copy wins, including an emptied evidence box', () => {
    const local = blob({
      targets: { t1: [target('a')] },
      evidence: 'old',
      modes: { t1: 'remote' },
    });
    const cloud = blob({ sourceV: 5, targets: { t1: [target('b')] }, evidence: '', modes: {} });
    const out = mergeBlob(cloud, local, false);
    expect(out.targets.t1.map((t) => t.login)).toEqual(['b']);
    expect(out.evidence).toBe('');
    expect(out.modes).toEqual({});
  });

  it('refresh: a pre-v5 cloud copy never wipes this device’s v5 fields', () => {
    const local = blob({
      targets: { t1: [target('a')] },
      evidence: 'keep',
      modes: { t1: 'remote' },
    });
    const out = mergeBlob(blob({ sourceV: 4 }), local, false);
    expect(out.targets).toEqual(local.targets);
    expect(out.evidence).toBe('keep');
    expect(out.modes).toEqual(local.modes);
  });
});

describe('blob v7 — Recently removed', () => {
  it('a v6 blob reads with an empty trash; v7 drops malformed entries', () => {
    expect(readBlob({ v: 6, jobs: [] }).trash).toEqual([]);
    const r = readBlob({ v: 7, trash: [removed('a'), { job: {} }, 'junk'] });
    expect(r.trash.map((x) => x.job.label)).toEqual(['a']);
  });

  it('seed: unions both sides, cloud wins a shared job', () => {
    const out = mergeBlob(
      blob({ sourceV: 7, trash: [removed('a', 'cloud')] }),
      blob({ trash: [removed('a', 'local'), removed('b')] }),
      true,
    );
    expect(out.trash.map((x) => x.job.label).sort()).toEqual(['b', 'cloud']);
  });

  it('seed: a job saved on either side is not also listed under Recently removed', () => {
    const job = removed('a').job;
    const out = mergeBlob(
      blob({ sourceV: 7, jobs: [job] }),
      blob({ trash: [removed('a'), removed('b')] }),
      true,
    );
    expect(out.jobs.map((j) => j.label)).toEqual(['a']);
    expect(out.trash.map((x) => x.job.label)).toEqual(['b']);
  });

  it('refresh: a v7 cloud copy wins; a v6 one (production, kit only) never wipes this device’s trash', () => {
    const local = blob({ trash: [removed('a')] });
    expect(mergeBlob(blob({ sourceV: 7 }), local, false).trash).toEqual([]);
    expect(mergeBlob(blob({ sourceV: 6 }), local, false).trash).toEqual(local.trash);
    expect(mergeBlob(blob({ sourceV: 5 }), local, false).trash).toEqual(local.trash);
  });

  it('never pushes a removed sample job', () => {
    const sample = { ...removed('s'), job: { ...removed('s').job, demo: true } as Job };
    expect(writeBlob(blob({ trash: [sample, removed('a')] })).trash).toHaveLength(1);
  });
});
