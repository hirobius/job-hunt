import { describe, expect, it } from 'vitest';
import { findCaption } from './findCaption';
import { agoPhrase } from './feed/serverUpdated';

// #544: Find's one caption, "4 new · scanned 2 h ago". A part not known yet is left out.
describe('findCaption', () => {
  it('says the new count, then when the sources were scanned', () => {
    expect(findCaption(4, '2 h ago')).toEqual(['4 new', 'scanned 2 h ago']);
    expect(findCaption(0, 'just now')).toEqual(['Nothing new', 'scanned just now']);
  });

  it('leaves out what is not known, and starts with a capital', () => {
    expect(findCaption(null, null)).toEqual([]);
    expect(findCaption(3, null)).toEqual(['3 new']);
    expect(findCaption(null, '4 min ago')).toEqual(['Scanned 4 min ago']);
  });

  it('says a scan runs instead of when the last one was', () => {
    expect(findCaption(2, '2 h ago', true)).toEqual(['2 new', 'scanning…']);
  });
});

describe('agoPhrase', () => {
  const now = Date.parse('2026-11-12T12:00:00Z');
  it('words a time as minutes, hours, then a day', () => {
    expect(agoPhrase(now - 20_000, now)).toBe('just now');
    expect(agoPhrase(new Date(now - 4 * 60_000).toISOString(), now)).toBe('4 min ago');
    expect(agoPhrase(now - 2 * 3600_000, now)).toBe('2 h ago');
    expect(agoPhrase(now - 3 * 864e5, now)).toMatch(/Nov 9|9 Nov/);
  });

  it('says nothing for no time or a bad one', () => {
    expect(agoPhrase(null, now)).toBeNull();
    expect(agoPhrase(undefined, now)).toBeNull();
    expect(agoPhrase('soon', now)).toBeNull();
  });
});
