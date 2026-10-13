import { describe, expect, it } from 'vitest';
import { postedAgo } from './format';

const NOW = Date.parse('2026-10-12T12:00:00Z');

describe('postedAgo', () => {
  it.each([
    ['2026-10-12T09:00:00Z', 'today'],
    ['2026-10-11T09:00:00Z', '1d ago'],
    ['2026-09-30T12:00:00Z', '12d ago'],
    ['2026-08-01T12:00:00Z', '2mo ago'],
    ['2025-01-01T00:00:00Z', 'over a year ago'],
    ['2026-10-13T12:00:00Z', 'today'], // clock skew: never "in the future"
    [undefined, ''],
    ['not a date', ''],
  ])('%s → %s', (iso, out) => expect(postedAgo(iso, NOW)).toBe(out));
});
