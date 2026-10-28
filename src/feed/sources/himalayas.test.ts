import { describe, expect, it } from 'vitest';
import { himalayas, himalayasUrl, parseHimalayas } from './himalayas';

// Built from the described shape (unverified live).
const job = {
  title: 'Senior Design Systems Engineer',
  companyName: 'Acme',
  description: '<p>Own the <b>design system</b>.</p>',
  excerpt: 'Own the design system.',
  employmentType: 'Full Time',
  minSalary: 140000,
  maxSalary: 180000,
  currency: 'USD',
  locationRestrictions: ['United States', { name: 'Canada' }],
  pubDate: 1793131200,
  applicationLink: 'https://acme.example/apply',
  guid: 'https://himalayas.app/companies/acme/jobs/senior-design-systems-engineer',
};

describe('parseHimalayas', () => {
  it('normalizes a job and links to its Himalayas page', () => {
    expect(parseHimalayas(JSON.stringify({ jobs: [job] }))).toEqual([
      {
        id: `himalayas:${job.guid}`,
        source: 'himalayas',
        title: 'Senior Design Systems Engineer',
        company: 'Acme',
        url: job.guid,
        location: 'United States, Canada',
        mode: 'remote',
        postedAt: new Date(1793131200 * 1000).toISOString(),
        text: 'Job type: Full Time\nOwn the design system.',
        salaryMin: 140000,
        salaryMax: 180000,
        currency: 'USD',
      },
    ]);
  });

  it('falls back to the application link, and drops junk', () => {
    const out = parseHimalayas(
      JSON.stringify({ jobs: [{ ...job, guid: 'abc', minSalary: 0, maxSalary: null }, {}, null] }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ url: 'https://acme.example/apply' });
    expect(out[0].currency).toBeUndefined();
    expect(parseHimalayas('nope')).toEqual([]);
  });

  it('is a search source: the term goes upstream, nothing without one', () => {
    expect(himalayas.search).toBe(true);
    expect(himalayas.upstream('design systems')).toEqual([
      'https://himalayas.app/jobs/api/search?q=design%20systems',
    ]);
    expect(himalayas.upstream('')).toEqual([]);
    expect(himalayasUrl('x'.repeat(100))).toHaveLength(
      'https://himalayas.app/jobs/api/search?q='.length + 60,
    );
  });
});
