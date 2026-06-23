import { afterEach, describe, expect, it } from 'vitest';
import {
  prettyTitle,
  cleanUrl,
  normStatus,
  daysSince,
  hostOf,
  addJob,
  isSaved,
  removeJob,
  getAllJobs,
} from './store';

afterEach(() => {
  // reset the shared store between tests
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

describe('url helpers', () => {
  it('derives a readable title from a URL', () => {
    expect(prettyTitle('https://jobs.lever.co/acme/senior-product-designer')).toContain(
      'Senior Product Designer',
    );
    expect(prettyTitle('https://example.com/')).toBe('Example');
  });

  it('cleans wrapping junk and collapsed double protocols', () => {
    expect(cleanUrl('  <https://x.com/a>  ')).toBe('https://x.com/a');
    expect(cleanUrl('https://https://x.com/a')).toBe('https://x.com/a');
  });

  it('extracts the bare hostname', () => {
    expect(hostOf('https://www.example.com/careers/123')).toBe('example.com');
    expect(hostOf('not a url')).toBe('');
  });

  it('normalizes unknown statuses to Saved', () => {
    expect(normStatus('Applied')).toBe('Applied');
    expect(normStatus('bogus')).toBe('Saved');
    expect(normStatus(undefined)).toBe('Saved');
  });

  it('computes whole-day diffs and null for invalid input', () => {
    expect(daysSince(undefined)).toBeNull();
    expect(daysSince('not-a-date')).toBeNull();
    expect(daysSince(new Date(Date.now() - 3 * 86400000).toISOString())).toBe(3);
  });
});

describe('add / dedupe', () => {
  it('adds a job and dedupes by normalized URL (ignoring tracking params)', () => {
    const url = 'https://boards.greenhouse.io/acme/jobs/42';
    expect(addJob(url)).toBe(true);
    expect(isSaved(url)).toBe(true);
    // utm_* is stripped from the dedupe key → treated as the same job
    expect(addJob(url + '?utm_source=newsletter')).toBe(false);
  });
});
