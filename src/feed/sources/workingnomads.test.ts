import { describe, expect, it } from 'vitest';
import { parseWorkingNomads, workingNomads, WORKING_NOMADS_URL } from './workingnomads';

// Built from the described shape (unverified live).
const job = {
  url: 'https://www.workingnomads.com/jobs/design-systems-engineer-acme',
  title: 'Design Systems Engineer',
  description: '<p>Build <b>tokens</b> &amp; components.</p>',
  company_name: 'Acme',
  category_name: 'Development',
  tags: 'react,design systems',
  location: 'USA',
  pub_date: '2026-10-27T13:00:47-04:00',
};

describe('parseWorkingNomads', () => {
  it('normalizes a job, keyed by its url', () => {
    expect(parseWorkingNomads(JSON.stringify([job]))).toEqual([
      {
        id: `workingnomads:${job.url}`,
        source: 'workingnomads',
        title: 'Design Systems Engineer',
        company: 'Acme',
        url: job.url,
        location: 'USA',
        mode: 'remote',
        postedAt: '2026-10-27T17:00:47.000Z',
        text: 'Category: Development\nTags: react, design systems\nBuild tokens & components.',
      },
    ]);
  });

  it('takes tags as a list too, and drops junk', () => {
    const out = parseWorkingNomads(
      JSON.stringify([{ ...job, tags: ['ui'] }, { title: 'no url' }, null, { url: 'ftp://x' }]),
    );
    expect(out).toHaveLength(1);
    expect(out[0].text).toMatch(/^Category: Development\nTags: ui\n/);
    expect(parseWorkingNomads('<html>blocked</html>')).toEqual([]);
    expect(parseWorkingNomads('{"error":1}')).toEqual([]);
  });

  it('reads one fixed URL', () => {
    expect(workingNomads.upstream()).toEqual([WORKING_NOMADS_URL]);
  });
});
