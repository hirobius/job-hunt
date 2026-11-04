import { describe, expect, it } from 'vitest';
import { cleanPlace } from './cleanPlace';
import { sanitizeJobs } from './store';

describe('cleanPlace', () => {
  it.each(['N/A', 'n/a', 'NA', ' none ', 'TBD', 'Unknown', '-', '—', 'Not specified'])(
    'drops the placeholder %s',
    (s) => expect(cleanPlace(s)).toBe(''),
  );
  it('keeps a real place', () => {
    expect(cleanPlace(' United States ')).toBe('United States');
    expect(cleanPlace('Napa, CA')).toBe('Napa, CA');
    expect(cleanPlace(undefined)).toBe('');
  });
  it('a stored job with N/A loses it on read', () => {
    const [j] = sanitizeJobs([
      { url: 'https://boards.greenhouse.io/stripe/jobs/1', label: 'FE', location: 'N/A' },
    ]);
    expect(j.location).toBeUndefined();
  });
});
