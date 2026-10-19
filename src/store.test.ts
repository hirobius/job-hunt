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
  replaceAll,
  jobIdOf,
  findJobById,
  findJobByUrl,
  setJobUrl,
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

  // A board host names the ATS, not the employer: "Boards" told you nothing (#154 review).
  it.each([
    ['https://boards.greenhouse.io/acme', 'Acme · Greenhouse'],
    ['https://boards.greenhouse.io/acme/jobs/77', 'Acme · Greenhouse'],
    ['https://job-boards.greenhouse.io/acme-co/jobs/123', 'Acme Co · Greenhouse'],
    ['https://jobs.lever.co/acme/2f1c9b4e-1a2b-4c3d-9e8f-001122334455', 'Acme · Lever'],
    ['https://jobs.lever.co/acme/senior-product-designer', 'Acme — Senior Product Designer'],
    ['https://jobs.ashbyhq.com/acme', 'Acme · Ashby'],
  ])('names the employer on an ATS board link: %s', (url, title) => {
    expect(prettyTitle(url)).toBe(title);
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

// #127: stable, URL-safe job ids derived from the dedup key.
describe('jobIdOf / findJobById (#127)', () => {
  it('is URL-safe and short', () => {
    const id = jobIdOf('https://boards.greenhouse.io/acme/jobs/42?gh_jid=42&x=a/b');
    expect(id).toMatch(/^[a-z0-9]{6,16}$/);
  });

  it('is the same for URLs the store treats as the same job', () => {
    const a = jobIdOf('https://www.Acme.example/Jobs/7/?utm_source=li');
    const b = jobIdOf('https://acme.example/jobs/7');
    expect(a).toBe(b);
  });

  it('differs between different jobs', () => {
    expect(jobIdOf('https://acme.example/jobs/7')).not.toBe(jobIdOf('https://acme.example/jobs/8'));
  });

  it('finds the job a route points at', () => {
    replaceAll([]);
    addJob('https://acme.example/jobs/7', 'Design Engineer');
    expect(findJobById(jobIdOf('https://acme.example/jobs/7'))?.label).toBe('Design Engineer');
    expect(findJobById('nope')).toBeUndefined();
  });
});

describe('findJobByUrl (#128)', () => {
  it('finds a saved job from a pasted link, cleaned the way addJob cleans it', () => {
    addJob('https://www.acme.example/jobs/7/', 'Design Engineer');
    expect(findJobByUrl('acme.example/jobs/7')?.label).toBe('Design Engineer');
    expect(findJobByUrl(' "https://acme.example/jobs/7?utm_source=x" ')?.label).toBe(
      'Design Engineer',
    );
    expect(findJobByUrl('https://acme.example/jobs/8')).toBeUndefined();
  });
});

describe('setJobUrl', () => {
  it('moves the job to a cleaned link and keeps everything else', () => {
    addJob('https://a.example/1', 'Welder');
    expect(setJobUrl('https://a.example/1', ' b.example/2 ')).toBe('https://b.example/2');
    expect(getAllJobs().map((j) => [j.url, j.label])).toEqual([['https://b.example/2', 'Welder']]);
  });

  it('refuses a non-link or another saved job’s link', () => {
    addJob('https://a.example/1');
    addJob('https://b.example/2');
    expect(setJobUrl('https://a.example/1', 'nope')).toBeNull();
    expect(setJobUrl('https://a.example/1', 'https://www.b.example/2/')).toBeNull();
    expect(getAllJobs()[0].url).toBe('https://a.example/1');
  });
});
