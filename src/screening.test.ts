import { describe, expect, it } from 'vitest';
import { suggestVerdict, normalizeScreening, blockerLabel } from './screening';
import type { Job } from './types';

const base = (o: Partial<Job> = {}): Job => ({
  url: 'https://x.co/1',
  label: 'X',
  status: 'Saved',
  ...o,
});

describe('suggestVerdict', () => {
  it('no blockers → match', () => expect(suggestVerdict([])).toBe('match'));
  it('only soft blockers → stretch', () => {
    expect(suggestVerdict(['titled_years'])).toBe('stretch');
    expect(suggestVerdict(['titled_years', 'cert'])).toBe('stretch');
  });
  it('any hard blocker → reach', () => {
    expect(suggestVerdict(['sql'])).toBe('reach');
    expect(suggestVerdict(['titled_years', 'sql'])).toBe('reach');
  });
  it('an unknown/custom blocker is treated as hard → reach', () =>
    expect(suggestVerdict(['night_shift'])).toBe('reach'));
});

describe('blockerLabel', () => {
  it('maps a known default id to its label', () => expect(blockerLabel('sql')).toBe('SQL required'));
  it('returns the raw tag for a custom id', () =>
    expect(blockerLabel('night_shift')).toBe('night_shift'));
});

describe('normalizeScreening', () => {
  it('keeps valid fields (and trims the angle)', () => {
    const j = normalizeScreening(
      base({
        verdict: 'match',
        mode: 'hybrid',
        applicants: 42,
        travelPct: 25,
        blockers: ['sql'],
        angle: '  positioning  ',
      }),
    );
    expect(j.verdict).toBe('match');
    expect(j.mode).toBe('hybrid');
    expect(j.applicants).toBe(42);
    expect(j.travelPct).toBe(25);
    expect(j.blockers).toEqual(['sql']);
    expect(j.angle).toBe('positioning');
  });

  it('drops invalid enums, bad numbers, and empty strings', () => {
    const bad = {
      verdict: 'nope',
      mode: 'somewhere',
      applicants: -3,
      travelPct: NaN,
      blockers: ['', '   '],
      angle: '   ',
    } as unknown as Partial<Job>;
    const j = normalizeScreening(base(bad));
    expect(j.verdict).toBeUndefined();
    expect(j.mode).toBeUndefined();
    expect(j.applicants).toBeUndefined();
    expect(j.travelPct).toBeUndefined();
    expect(j.blockers).toBeUndefined();
    expect(j.angle).toBeUndefined();
  });

  it('dedupes and trims blocker tags', () => {
    const j = normalizeScreening(base({ blockers: ['sql', 'sql', ' cert '] }));
    expect(j.blockers).toEqual(['sql', 'cert']);
  });

  it('leaves non-screening fields untouched', () => {
    const j = normalizeScreening(base({ company: 'Acme', priority: true }));
    expect(j.company).toBe('Acme');
    expect(j.priority).toBe(true);
  });
});
