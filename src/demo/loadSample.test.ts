import { afterEach, describe, expect, it } from 'vitest';
import type { Job } from '../types';
import { addJob, getAllJobs, removeJob, replaceAll, updateJob } from '../store';
import { clearSample, hasSample, loadSample, seedIfEmpty, withoutSample } from './loadSample';
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
    expect(hasSample(getAllJobs())).toBe(true);
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
