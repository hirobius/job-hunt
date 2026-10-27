import { beforeEach, describe, expect, it } from 'vitest';
import {
  activeTitles,
  addTitle,
  getAllSweeps,
  MAX_SWEEP_ON,
  mergeSweeps,
  removeTitle,
  replaceSweeps,
  restoreTitle,
  sanitizeSweeps,
  setTitleOn,
  SWEEP_KEY,
  sweepFor,
} from './sweepTitles';

beforeEach(() => localStorage.clear());
const SEED = ['Design Engineer', 'Design Technologist'];

describe('sweep titles store', () => {
  it('a track with no entry sweeps its own titles, all on', () => {
    expect(sweepFor({}, 't1', SEED)).toEqual({ titles: SEED, off: [] });
  });

  it('turning a title off keeps it listed but out of the sweep; on brings it back', () => {
    setTitleOn('t1', SEED, 'Design Technologist', false);
    const s = sweepFor(getAllSweeps(), 't1', SEED);
    expect(s.titles).toEqual(SEED);
    expect(activeTitles(s)).toEqual(['Design Engineer']);
    setTitleOn('t1', SEED, 'design technologist', true);
    expect(activeTitles(sweepFor(getAllSweeps(), 't1', SEED))).toEqual(SEED);
  });

  it('adds (ignoring case duplicates) and removes titles per track', () => {
    addTitle('t1', SEED, 'UX Engineer');
    addTitle('t1', SEED, 'ux engineer');
    removeTitle('t1', SEED, 'Design Engineer');
    expect(sweepFor(getAllSweeps(), 't1', SEED).titles).toEqual([
      'Design Technologist',
      'UX Engineer',
    ]);
    expect(getAllSweeps().t2).toBeUndefined();
  });

  it(`caps the titles on at ${MAX_SWEEP_ON}; a title added past it starts off`, () => {
    const many = Array.from({ length: MAX_SWEEP_ON }, (_, i) => `Title ${i}`);
    addTitle('t1', many, 'One more');
    const s = sweepFor(getAllSweeps(), 't1', many);
    expect(activeTitles(s)).toHaveLength(MAX_SWEEP_ON);
    expect(s.off).toEqual(['One more']);
    expect(setTitleOn('t1', many, 'One more', true)).toBe(false);
  });

  // #354: an add says what it did, and Remove's Undo restores the title, its place and its tick.
  it('an add reports added / duplicate / added-off, and a duplicate changes nothing', () => {
    expect(addTitle('t1', SEED, 'UX Engineer')).toBe('added');
    expect(addTitle('t1', SEED, 'ux engineer')).toBe('duplicate');
    expect(sweepFor(getAllSweeps(), 't1', SEED).titles).toEqual([...SEED, 'UX Engineer']);
    const many = Array.from({ length: MAX_SWEEP_ON }, (_, i) => `Title ${i}`);
    expect(addTitle('t2', many, 'One more')).toBe('added-off');
    expect(sweepFor(getAllSweeps(), 't2', many).off).toEqual(['One more']);
  });

  it('restoring a removed title puts it back in its place, off if it was off', () => {
    setTitleOn('t1', SEED, 'Design Engineer', false);
    removeTitle('t1', SEED, 'Design Engineer');
    expect(sweepFor(getAllSweeps(), 't1', SEED).titles).toEqual(['Design Technologist']);
    restoreTitle('t1', SEED, 'Design Engineer', 0, true);
    const s = sweepFor(getAllSweeps(), 't1', SEED);
    expect(s.titles).toEqual(SEED);
    expect(s.off).toEqual(['Design Engineer']);
    removeTitle('t1', SEED, 'Design Technologist');
    restoreTitle('t1', SEED, 'Design Technologist', 1, false);
    expect(activeTitles(sweepFor(getAllSweeps(), 't1', SEED))).toEqual(['Design Technologist']);
  });

  it('reads malformed storage as nothing saved', () => {
    localStorage.setItem(SWEEP_KEY, '{"t1":{"titles":"x"},"__proto__":{"titles":["a"]}}');
    expect(getAllSweeps()).toEqual({});
    expect(sanitizeSweeps({ t1: { titles: [' A ', 'a', 3, 'B'], off: ['b', 'Z'] } })).toEqual({
      t1: { titles: ['A', 'B'], off: ['b'] },
    });
  });

  it('merges cloud-wins per track and keeps local-only tracks', () => {
    const cloud = { t1: { titles: ['Cloud'], off: [] } };
    const local = { t1: { titles: ['Local'], off: [] }, t2: { titles: ['Only here'], off: [] } };
    expect(mergeSweeps(cloud, local)).toEqual({ t1: cloud.t1, t2: local.t2 });
    replaceSweeps(mergeSweeps(cloud, local));
    expect(Object.keys(getAllSweeps())).toEqual(['t1', 't2']);
  });
});

describe('sweep titles in the sync blob (v7)', () => {
  it('round-trips, and an older cloud copy keeps this device on refresh', async () => {
    const { emptyBlob, mergeBlob, readBlob, writeBlob } = await import('../syncBlob');
    const local = { ...emptyBlob(), sweeps: { t1: { titles: ['Mine'], off: [] } } };
    expect(readBlob(writeBlob(local)).sweeps).toEqual(local.sweeps);
    expect(mergeBlob(readBlob({ v: 6 }), local, false).sweeps).toEqual(local.sweeps);
    const cloud = readBlob({ v: 7, sweeps: { t1: { titles: ['Cloud'], off: ['Cloud'] } } });
    expect(mergeBlob(cloud, local, false).sweeps.t1.titles).toEqual(['Cloud']);
    expect(mergeBlob(cloud, local, true).sweeps.t1.off).toEqual(['Cloud']);
  });

  it('is dropped with its track', async () => {
    const { dropTrackData } = await import('../trackData');
    addTitle('t1', SEED, 'X');
    addTitle('t2', SEED, 'Y');
    dropTrackData('t1');
    expect(Object.keys(getAllSweeps())).toEqual(['t2']);
  });
});

// #223 review: titles past the cap read as unticked, so they must be stored as off too, or
// unticking one ticks the 13th and they never hide postings.
describe('titles past the cap', () => {
  const many = Array.from({ length: MAX_SWEEP_ON + 2 }, (_, i) => `title ${i + 1}`);

  it('a seed past the cap starts with the overflow off', () => {
    const s = sweepFor({}, 'c1', many);
    expect(activeTitles(s)).toHaveLength(MAX_SWEEP_ON);
    expect(s.off).toEqual(many.slice(MAX_SWEEP_ON));
  });

  it('unticking one does not tick a title past the cap', () => {
    setTitleOn('c1', many, 'title 1', false);
    const s = sweepFor(getAllSweeps(), 'c1', many);
    expect(activeTitles(s)).toEqual(many.slice(1, MAX_SWEEP_ON));
    expect(s.off).toEqual(expect.arrayContaining([...many.slice(MAX_SWEEP_ON), 'title 1']));
  });

  it('a stored list past the cap reads with the overflow off', () => {
    replaceSweeps({ c1: { titles: many, off: [] } });
    expect(getAllSweeps().c1.off).toEqual(many.slice(MAX_SWEEP_ON));
  });
});
