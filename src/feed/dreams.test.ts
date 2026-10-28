import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DREAMS_KEY,
  MAX_SEEN,
  getAllDreams,
  markDreamChecked,
  mergeDreams,
  readDreams,
  replaceDreams,
  restoreDream,
  sanitizeDreams,
  starDream,
  unstarDream,
  useDreams,
  type Dream,
} from './dreams';

const dream = (company: string, o: Partial<Dream> = {}): Dream => ({
  key: company.toLowerCase(),
  company,
  seen: [],
  starredAt: '2026-10-01T00:00:00.000Z',
  ...o,
});

beforeEach(() => localStorage.clear());

describe('sanitizeDreams', () => {
  it.each<[string, unknown, Record<string, string[]>]>([
    ['not an object', 'x', {}],
    ['an array', [dream('A')], {}],
    [
      'drops entries without a company',
      { t: [{}, { company: ' ' }, dream('Acme')] },
      { t: ['acme'] },
    ],
    [
      'one entry per company, ignoring case',
      { t: [dream('Acme'), dream('ACME ')] },
      { t: ['acme'] },
    ],
    ['drops empty tracks', { t: [{}] }, {}],
  ])('%s', (_n, raw, want) => {
    const out = sanitizeDreams(raw);
    expect(
      Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.map((d) => d.key)])),
    ).toEqual(want);
  });
  it('keeps only a readable board, an http website and string ids, capped', () => {
    const [d] = sanitizeDreams({
      t: [
        {
          company: 'Acme',
          board: { kind: 'nope', slug: 'acme' },
          website: 'javascript:alert(1)',
          seen: [1, 'a', ...Array.from({ length: MAX_SEEN + 5 }, (_, i) => `p${i}`)],
        },
      ],
    }).t;
    expect(d.board).toBeUndefined();
    expect(d.website).toBeUndefined();
    expect(d.seen).toHaveLength(MAX_SEEN);
    // Ids arrive best first, so the first MAX_SEEN are the ones kept.
    expect(d.seen[0]).toBe('a');
    expect(d.seen).not.toContain(`p${MAX_SEEN + 4}`);
  });
});

describe('star, check, unstar', () => {
  it('stars once per company and fills in a board found later', () => {
    starDream('t', { company: 'Acme' });
    starDream('t', { company: 'acme', board: { kind: 'lever', slug: 'acme' } });
    expect(readDreams('t')).toHaveLength(1);
    expect(readDreams('t')[0]).toMatchObject({ company: 'Acme', board: { slug: 'acme' } });
  });
  it('records the ids of a check and keeps them over a re-star', () => {
    starDream('t', { company: 'Acme' });
    markDreamChecked('t', 'acme', ['a', 'b'], '2026-10-17T00:00:00Z');
    starDream('t', { company: 'Acme' });
    expect(readDreams('t')[0]).toMatchObject({
      seen: ['a', 'b'],
      checkedAt: '2026-10-17T00:00:00Z',
    });
  });
  it('unstarring the last company drops the track', () => {
    starDream('t', { company: 'Acme' });
    unstarDream('t', 'acme');
    expect(getAllDreams()).toEqual({});
  });
  it('restoreDream puts an unstarred company back in its place, history intact (#324)', () => {
    starDream('t', { company: 'Acme', board: { kind: 'lever', slug: 'acme' } });
    starDream('t', { company: 'Beta' });
    markDreamChecked('t', 'acme', ['a', 'b'], '2026-10-17T00:00:00Z');
    const before = readDreams('t');
    unstarDream('t', 'acme');
    expect(readDreams('t').map((d) => d.key)).toEqual(['beta']);
    restoreDream('t', before[0], 0);
    expect(readDreams('t')).toEqual(before);
    // Restoring over a re-star does not duplicate the company.
    restoreDream('t', before[0], 0);
    expect(readDreams('t')).toEqual(before);
  });
  it('a live hook follows changes and replace', () => {
    const { result } = renderHook(() => useDreams('t'));
    act(() => starDream('t', { company: 'Acme' }));
    expect(result.current.map((d) => d.company)).toEqual(['Acme']);
    act(() => replaceDreams({ t: [dream('Beta')] }));
    expect(result.current.map((d) => d.company)).toEqual(['Beta']);
    expect(localStorage.getItem(DREAMS_KEY)).toContain('Beta');
  });
});

describe('mergeDreams', () => {
  it('unions per track; cloud wins on a shared company', () => {
    const out = mergeDreams(
      { t: [dream('Acme', { seen: ['cloud'] })], u: [dream('Cloud only')] },
      { t: [dream('Acme', { seen: ['local'] }), dream('Local only')] },
    );
    expect(out.t.map((d) => [d.company, d.seen])).toEqual([
      ['Acme', ['cloud']],
      ['Local only', []],
    ]);
    expect(out.u.map((d) => d.company)).toEqual(['Cloud only']);
  });
});
