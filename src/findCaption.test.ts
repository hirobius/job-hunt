import { describe, expect, it } from 'vitest';
import { findCaption } from './findCaption';
import { agoPhrase } from './feed/serverUpdated';

// #544, then the duplicate count left (the New chip has it): "Scanned 2 h ago". A part not known is left out.
describe('findCaption', () => {
  it('says when the sources were scanned, with a capital, and never a count', () => {
    expect(findCaption('2 h ago')).toEqual(['Scanned 2 h ago']);
    expect(findCaption('just now').join(' ')).not.toMatch(/new/i);
  });

  it('is empty when nothing is known', () => {
    expect(findCaption(null)).toEqual([]);
  });

  it('says a scan runs instead of when the last one was', () => {
    expect(findCaption('2 h ago', true)).toEqual(['Scanning…']);
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
