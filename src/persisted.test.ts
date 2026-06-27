import { describe, expect, it } from 'vitest';
import { loadPersisted, savePersisted } from './persisted';

describe('persisted', () => {
  it('round-trips a value', () => {
    savePersisted('rjb_test_k', { a: 1, b: ['x'] });
    expect(loadPersisted('rjb_test_k', null)).toEqual({ a: 1, b: ['x'] });
  });

  it('returns the fallback for a missing key', () => {
    expect(loadPersisted('rjb_missing_k', 42)).toBe(42);
  });

  it('returns the fallback on malformed JSON', () => {
    localStorage.setItem('rjb_bad_k', '{not json');
    expect(loadPersisted('rjb_bad_k', 'fallback')).toBe('fallback');
  });
});
