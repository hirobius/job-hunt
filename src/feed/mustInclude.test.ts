import { beforeEach, describe, expect, it } from 'vitest';
import {
  keepIncluded,
  mentionsAny,
  mergeMustInclude,
  readMustInclude,
  sanitizeMustInclude,
  setMustInclude,
} from './mustInclude';
import { emptyBlob, mergeBlob, readBlob, writeBlob } from '../syncBlob';

beforeEach(() => localStorage.clear());

describe('mentionsAny', () => {
  it.each([
    ['Design System Lead', true],
    ['design systems', true],
    ['Systems Designer', true],
    ['UI Systems', true],
    ['SYSTEMS', true],
    ['ecosystem', false],
    ['Ecosystems partner', false],
    ['subsystem', false],
    ['Design Engineer', false],
  ])('%s → %s', (text, want) => expect(mentionsAny(['systems'], text)).toBe(want));

  it('looks at every text given (title, description)', () => {
    expect(mentionsAny(['systems'], 'Product Designer', 'Grow our design system.')).toBe(true);
    expect(mentionsAny(['systems'], 'Product Designer', 'Grow our ecosystem.')).toBe(false);
  });

  it('no terms is no rule', () => expect(mentionsAny([], 'anything')).toBe(true));
});

describe('keepIncluded', () => {
  it('keeps roles whose title or text says a term', () => {
    const roles = [
      { id: 'a', title: 'Design Systems Engineer', text: '' },
      { id: 'b', title: 'Product Designer', text: 'Our design system team.' },
      { id: 'c', title: 'Product Designer', text: 'A great ecosystem.' },
    ];
    expect(keepIncluded(roles, ['systems']).map((r) => r.id)).toEqual(['a', 'b']);
    expect(keepIncluded(roles, [])).toBe(roles);
  });
});

describe('store', () => {
  it('sanitizes junk, keeps an empty entry (the user cleared it)', () => {
    expect(sanitizeMustInclude('x')).toEqual({});
    expect(
      sanitizeMustInclude({ __proto__: 1, a: { terms: [' systems ', 'Systems', 3] }, b: [] }),
    ).toEqual({ a: { terms: ['systems'], atsOff: [] } });
    expect(sanitizeMustInclude({ a: { terms: [] } })).toEqual({ a: { terms: [], atsOff: [] } });
  });

  it('set merges over the entry', () => {
    setMustInclude('t', { terms: ['systems'] });
    setMustInclude('t', { atsOff: ['design tokens'] });
    expect(readMustInclude('t')).toEqual({ terms: ['systems'], atsOff: ['design tokens'] });
  });

  it('cloud wins per track; local-only tracks are kept', () => {
    const cloud = { a: { terms: ['systems'], atsOff: [] } };
    const local = { a: { terms: [], atsOff: [] }, b: { terms: ['x'], atsOff: [] } };
    expect(mergeMustInclude(cloud, local)).toEqual({ ...local, ...cloud });
  });
});

describe('in the sync blob (v11)', () => {
  const local = { ...emptyBlob(), mustInclude: { t: { terms: ['systems'], atsOff: [] } } };
  it('round-trips', () => {
    expect(readBlob(writeBlob(local)).mustInclude).toEqual(local.mustInclude);
  });
  it('an older (v10) cloud copy keeps this device’s on refresh', () => {
    const old = readBlob({ v: 10, jobs: [] });
    expect(mergeBlob(old, local, false).mustInclude).toEqual(local.mustInclude);
  });
  it('a v11 cloud copy wins on refresh', () => {
    const cloud = readBlob({ v: 11, jobs: [], mustInclude: { t: { terms: [] } } });
    expect(mergeBlob(cloud, local, false).mustInclude).toEqual({ t: { terms: [], atsOff: [] } });
  });
});
