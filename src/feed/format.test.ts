import { describe, expect, it } from 'vitest';
import { cardPostedLabel, postedAgo } from './format';

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

describe('cardPostedLabel (a Review card, Adrian 2026-11-16)', () => {
  it.each([
    ['2026-10-12T09:00:00Z', 'Posted today'],
    ['2026-09-30T12:00:00Z', 'Posted 12d ago'],
    ['2026-09-12T12:00:00Z', 'Posted 30d ago'], // 30 days: still its age
    ['2026-09-11T12:00:00Z', 'Posted 30d+'], // 31 days
    ['2026-08-01T12:00:00Z', 'Posted 30d+'],
    ['2025-01-01T00:00:00Z', 'Posted 30d+'],
    [undefined, ''],
    ['not a date', ''],
  ])('%s → %s', (iso, out) => expect(cardPostedLabel(iso, NOW)).toBe(out));
});
