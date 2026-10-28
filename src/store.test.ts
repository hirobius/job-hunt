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
  sanitizeJobs,
  snoozeFollowUp,
  logFollowUp,
  restoreFollowUp,
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

  // Generic host labels name a page kind, not the employer (#350).
  it.each([
    ['https://jobs.example.org/123', 'Example'],
    ['https://jobs.acme.com/123', 'Acme'],
    ['https://careers.acme.com/', 'Acme'],
    ['https://boards.example.com/123', 'Example'],
    ['https://www.jobs.example.com/123', 'Example'],
    ['https://apply.example.com/senior-welder', 'Example — Senior Welder'],
    ['https://jobs.com/123', 'Saved job'],
  ])('skips generic host labels in the derived title: %s', (url, title) => {
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

describe('company from a board link (QA)', () => {
  it('a Greenhouse posting gets its company from the board slug', () => {
    addJob('https://boards.greenhouse.io/acme/jobs/77');
    const j = findJobByUrl('https://boards.greenhouse.io/acme/jobs/77');
    expect(j?.company).toBe('Acme');
  });
  it('works for the other ATS hosts, title-cased', () => {
    addJob('https://jobs.lever.co/acme-labs/1234');
    expect(findJobByUrl('https://jobs.lever.co/acme-labs/1234')?.company).toBe('Acme Labs');
    addJob('https://acme.teamtailor.com/jobs/9-welder');
    expect(findJobByUrl('https://acme.teamtailor.com/jobs/9-welder')?.company).toBe('Acme');
  });
  it('an explicit company wins; a non-board link sets none', () => {
    addJobDetailed('https://jobs.ashbyhq.com/ramp/abc', { company: 'Ramp Inc' });
    expect(findJobByUrl('https://jobs.ashbyhq.com/ramp/abc')?.company).toBe('Ramp Inc');
    addJob('https://example.com/careers/welder');
    expect(findJobByUrl('https://example.com/careers/welder')?.company).toBeUndefined();
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

describe('follow-up snooze + undo', () => {
  const U = 'https://acme.example/jobs/1';

  it('normalizes snoozeUntil on read: a real day stays, junk is dropped', () => {
    const [ok, bad] = sanitizeJobs([
      { url: U, label: 'A', status: 'Applied', snoozeUntil: '2026-10-20' },
      { url: 'https://acme.example/jobs/2', label: 'B', status: 'Applied', snoozeUntil: 'later' },
    ]);
    expect(ok.snoozeUntil).toBe('2026-10-20');
    expect('snoozeUntil' in bad).toBe(false);
  });

  it('snooze sets a day; restore puts the old follow-up clock back exactly', () => {
    addJob(U, 'A');
    const before = findJobByUrl(U)!;
    snoozeFollowUp(U);
    expect(findJobByUrl(U)!.snoozeUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    restoreFollowUp(U, before);
    logFollowUp(U);
    expect(findJobByUrl(U)!.followUp).toBeTruthy();
    restoreFollowUp(U, before);
    const after = findJobByUrl(U)!;
    expect(after.followUp).toBeUndefined();
    expect(after.snoozeUntil).toBeUndefined();
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

describe('job dates (#419)', () => {
  it('a save stamps savedAt; a detailed save carries the posted and discovered dates', () => {
    addJob('https://acme.example/jobs/1');
    expect(Date.parse(findJobByUrl('https://acme.example/jobs/1')!.savedAt!)).not.toBeNaN();
    const url = addJobDetailed('https://acme.example/jobs/2', {
      postedAt: '2026-10-25T08:00:00Z',
      discoveredAt: '2026-10-27T09:00:00.000Z',
    })!;
    const saved = findJobByUrl(url)!;
    expect(saved.postedAt).toBe('2026-10-25T08:00:00Z');
    expect(saved.discoveredAt).toBe('2026-10-27T09:00:00.000Z');
    expect(Date.parse(saved.savedAt!)).not.toBeNaN();
  });

  it('sanitize keeps well-formed dates, drops the rest and backfills savedAt from the history', () => {
    const [a, b] = sanitizeJobs([
      {
        url: 'https://acme.example/jobs/1',
        label: 'A',
        status: 'Applied',
        postedAt: '2026-10-01',
        discoveredAt: 'yesterday',
        closedAt: 42,
        history: [
          { status: 'Saved', at: '2026-10-02' },
          { status: 'Applied', at: '2026-10-04' },
        ],
      },
      { url: 'https://acme.example/jobs/2', label: 'B', status: 'Applied', applied: '2026-10-04' },
    ]);
    expect(a.postedAt).toBe('2026-10-01');
    expect(a.savedAt).toBe('2026-10-02');
    expect('discoveredAt' in a).toBe(false);
    expect('closedAt' in a).toBe(false);
    expect('savedAt' in b).toBe(false); // nothing says when it was saved
  });
});
