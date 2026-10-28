import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_DECIDED,
  decide,
  getDecided,
  resetDecided,
  sanitizeDecided,
  skippedSet,
  undecide,
} from './decided';

beforeEach(() => resetDecided());

describe('Decided (by posting, never by company)', () => {
  it('records a verdict by fingerprint, a later one replacing the earlier, and persists it', () => {
    decide('acme::designer', 'skip', new Date('2026-10-28T00:00:00Z'));
    decide('acme::designer', 'save', new Date('2026-10-28T01:00:00Z'));
    decide('acme::engineer', 'skip');
    expect(getDecided().map((d) => [d.fingerprint, d.verdict])).toEqual([
      ['acme::designer', 'save'],
      ['acme::engineer', 'skip'],
    ]);
    expect([...skippedSet(getDecided())]).toEqual(['acme::engineer']);
    expect(JSON.parse(localStorage.getItem('rjb_decided')!)).toHaveLength(2);
    undecide('acme::engineer');
    expect(skippedSet(getDecided()).size).toBe(0);
  });

  it(`keeps the newest ${MAX_DECIDED}`, () => {
    for (let i = 0; i < MAX_DECIDED + 5; i++) decide(`c::${i}`, 'skip');
    expect(getDecided()).toHaveLength(MAX_DECIDED);
    expect(getDecided()[0].fingerprint).toBe('c::5');
  });

  it('drops junk and duplicates from storage', () => {
    expect(
      sanitizeDecided([
        { fingerprint: 'a::b', verdict: 'skip', at: 'x' },
        { fingerprint: 'a::b', verdict: 'save' },
        { fingerprint: '', verdict: 'skip' },
        { fingerprint: 'c::d', verdict: 'mute' },
        null,
      ]),
    ).toEqual([{ fingerprint: 'a::b', verdict: 'skip', at: 'x' }]);
    expect(sanitizeDecided('nope')).toEqual([]);
  });
});
