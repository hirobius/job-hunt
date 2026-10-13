import { afterEach, describe, expect, it } from 'vitest';
import {
  prettyTitle,
  cleanUrl,
  hostOf,
  addJob,
  addJobDetailed,
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

describe('addJobDetailed', () => {
  it('stores label, salary and note, and normalizes the URL', () => {
    const stored = addJobDetailed('greenhouse.io/acme/jobs/7', {
      label: 'Staff Engineer — Acme',
      salary: '$200k',
      note: 'Requirements:\n• Go',
    });
    expect(stored).toBe('https://greenhouse.io/acme/jobs/7');
    const j = getAllJobs().find((x) => x.url === stored)!;
    expect(j.label).toBe('Staff Engineer — Acme');
    expect(j.salary).toBe('$200k');
    expect(j.note).toContain('• Go');
  });

  it('returns null and leaves the existing entry untouched when already saved', () => {
    const url = 'https://jobs.lever.co/acme/abc';
    expect(addJob(url, 'Original')).toBe(true);
    expect(addJobDetailed(url, { label: 'Clobbered', note: 'x' })).toBeNull();
    const j = getAllJobs().find((x) => x.url === url)!;
    expect(j.label).toBe('Original'); // not overwritten
    expect(j.note).toBeUndefined();
  });
});

describe('ATS links get a real title', () => {
  it('names an ATS link by company, not its posting id', () => {
    expect(prettyTitle('https://jobs.ashbyhq.com/ramp/baa94095-c976-46d0-8d18-25a951950714')).toBe(
      'Ramp job',
    );
    expect(prettyTitle('https://job-boards.greenhouse.io/vercel/jobs/6129441004')).toBe(
      'Vercel job',
    );
  });

  it('fills title, company, location and mode from the posting, unless the user named it', async () => {
    const url = 'https://jobs.ashbyhq.com/ramp/baa9';
    const fetchJson = async () => ({
      jobs: [
        {
          id: 'baa9',
          title: 'Design Systems Lead',
          jobUrl: url,
          location: 'New York, NY',
          isRemote: true,
        },
      ],
    });
    addJob(url, undefined, undefined, fetchJson);
    await new Promise((r) => setTimeout(r, 0));
    expect(getAllJobs().find((j) => j.url === url)).toMatchObject({
      label: 'Design Systems Lead',
      company: 'Ramp',
      location: 'New York, NY',
      mode: 'remote',
    });

    const named = 'https://jobs.ashbyhq.com/ramp/baa9?x=1';
    removeJob(url);
    addJob(named, 'My own name', undefined, fetchJson);
    await new Promise((r) => setTimeout(r, 0));
    expect(getAllJobs()[0].label).toBe('My own name');
  });
});
