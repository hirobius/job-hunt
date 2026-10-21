import { describe, expect, it } from 'vitest';
import { dayLabel } from './dayLabel';

describe('dayLabel', () => {
  const now = new Date(2026, 9, 21);
  it('names today and tomorrow, else a short weekday and date (never ISO)', () => {
    expect(dayLabel('2026-10-21', now)).toBe('Today');
    expect(dayLabel('2026-10-22', now)).toBe('Tomorrow');
    expect(dayLabel('2026-10-28', now)).toBe('Wed, Oct 28');
  });
});
