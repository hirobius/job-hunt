import { afterEach, describe, expect, it } from 'vitest';
import type { Job } from '../types';
import { addJob, getAllJobs, removeJob, replaceAll, updateJob } from '../store';
import { addCategory, getCurationState, replaceCurationState } from '../curation/curationStore';
import { clearSample, hasCloudSession, loadSample, seedIfEmpty, withoutSample } from './loadSample';
import { isSample } from './sampleData';
import { rememberSampleTrack } from './sampleTrack';
import { seedPack } from '../curation/starterPacks';
import { sampleJobs } from './sampleData';

const NOW = new Date(2026, 9, 12, 10);
const sample = sampleJobs(NOW);
const real = (url: string, extra: Partial<Job> = {}): Job => ({
  url,
  label: url,
  status: 'Saved',
  ...extra,
});

describe('seedIfEmpty (never overwrites)', () => {
  it.each<[string, Job[]]>([
    ['one real job', [real('https://a.co/1')]],
    ['only archived jobs', [real('https://a.co/1', { archived: true })]],
    ['the sample already', sample],
  ])('refuses when the tracker has %s', (_, existing) => {
    expect(seedIfEmpty(existing, sample)).toBeNull();
  });

  it('seeds an empty tracker with the whole sample', () => {
    expect(seedIfEmpty([], sample)).toEqual(sample);
  });
});

describe('withoutSample (clear leaves real records)', () => {
  it.each<[string, Job[], Job[]]>([
    ['sample only → empty', sample, []],
    [
      'real only → unchanged',
      [real('https://a.co/1'), real('https://b.co/2')],
      [real('https://a.co/1'), real('https://b.co/2')],
    ],
    [
      'mixed → real kept, in order',
      [sample[0], real('https://a.co/1'), sample[1], real('https://b.co/2', { status: 'Applied' })],
      [real('https://a.co/1'), real('https://b.co/2', { status: 'Applied' })],
    ],
    ['empty → empty', [], []],
  ])('%s', (_, input, expected) => {
    expect(withoutSample(input)).toEqual(expected);
  });

  it('treats a record as sample only when demo === true', () => {
    const lookalike = real('https://a.example.com/x', { demo: 'yes' } as Partial<Job>);
    expect(withoutSample([lookalike])).toEqual([lookalike]);
  });
});

describe('loadSample / clearSample (store adapters)', () => {
  afterEach(() => {
    getAllJobs()
      .slice()
      .forEach((j) => removeJob(j.url));
  });

  it('loads into an empty store, then clears back to empty', () => {
    expect(loadSample(NOW)).toBe(true);
    expect(getAllJobs()).toHaveLength(sample.length);
    expect(getAllJobs().every(isSample)).toBe(true);
    expect(clearSample()).toBe(sample.length);
    expect(getAllJobs()).toEqual([]);
  });

  it('refuses to load over existing data and leaves it untouched', () => {
    addJob('https://boards.greenhouse.io/acme/jobs/1');
    const before = getAllJobs();
    expect(loadSample(NOW)).toBe(false);
    expect(getAllJobs()).toEqual(before);
  });

  it('clear keeps jobs the user added or edited alongside the sample', () => {
    loadSample(NOW);
    addJob('https://boards.greenhouse.io/acme/jobs/2');
    const mine = getAllJobs().find((j) => j.url.includes('greenhouse'))!;
    updateJob(mine.url, { note: 'my own note' });
    clearSample();
    expect(getAllJobs()).toEqual([{ ...mine, note: 'my own note' }]);
  });

  it('clear is a no-op on a tracker with no sample', () => {
    replaceAll([real('https://a.co/1')]);
    const before = getAllJobs();
    expect(clearSample()).toBe(0);
    expect(getAllJobs()).toEqual(before);
  });
});

describe('the Sample track an older build added', () => {
  /** The sample as an older build loaded it: its jobs plus a remembered Sample track. */
  const loadOldSample = (now: Date) => {
    loadSample(now);
    rememberSampleTrack(seedPack('designsystems', undefined, { label: 'Sample' }));
  };
  const labels = () => getCurationState().categories.map((c) => c.label);
  afterEach(() => {
    getAllJobs()
      .slice()
      .forEach((j) => removeJob(j.url));
    replaceCurationState({ categories: [], groups: [], tiles: [] });
    localStorage.clear();
  });

  it('loading adds no track: the sample is jobs only (2026-10-29)', () => {
    loadSample(NOW);
    expect(getCurationState()).toEqual({ categories: [], groups: [], tiles: [] });
  });

  it('leaves an existing board alone', () => {
    addCategory({ label: 'Mine' });
    loadSample(NOW);
    expect(labels()).toEqual(['Mine']);
  });

  it('clear removes the Sample track, and only that one', () => {
    loadOldSample(NOW);
    addCategory({ label: 'Mine' });
    addCategory({ label: 'Sample' }); // the user's own, same name: kept
    clearSample();
    expect(labels()).toEqual(['Mine', 'Sample']);
    expect(getCurationState().categories).toHaveLength(2);
  });

  it('clear takes its sections and links with it (no orphans left in storage or a backup)', () => {
    loadOldSample(NOW);
    clearSample();
    expect(getCurationState()).toEqual({ categories: [], groups: [], tiles: [] });
  });

  it('clear after the user deleted the Sample track changes nothing else', () => {
    loadOldSample(NOW);
    replaceCurationState({ categories: [], groups: [], tiles: [] });
    addCategory({ label: 'Mine' });
    clearSample();
    expect(labels()).toEqual(['Mine']);
  });
});

describe('hasCloudSession', () => {
  const fake = (keys: string[]) => ({ length: keys.length, key: (i: number) => keys[i] ?? null });
  it.each<[string[], boolean]>([
    [[], false],
    [['rjb_shortlist', 'hds-theme'], false],
    [['sb-nelrcmbkimjjmfmgnixj-auth-token'], true],
    [['rjb_shortlist', 'sb-abc-auth-token'], true],
    [['sb-abc-auth-token-code-verifier'], false],
  ])('%j → %s', (keys, expected) => {
    expect(hasCloudSession(fake(keys))).toBe(expected);
  });
});
