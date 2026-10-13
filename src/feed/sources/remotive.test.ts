import { describe, expect, it } from 'vitest';
import { fetchRemotive, parseRemotiveJob } from './remotive';

const job = {
  id: 42,
  url: 'https://remotive.com/remote-jobs/software-dev/ds-engineer-42',
  title: 'Design Systems Engineer',
  company_name: 'Acme',
  job_type: 'part_time',
  publication_date: '2026-10-05T12:00:00',
  candidate_required_location: 'USA',
  description: '<p>Own our <b>design system</b>.</p>',
};

describe('parseRemotiveJob', () => {
  it('normalizes a job and folds job_type into the text for signal detection', () => {
    expect(parseRemotiveJob(job)).toEqual({
      id: 'remotive:42',
      source: 'remotive',
      title: 'Design Systems Engineer',
      company: 'Acme',
      url: job.url,
      location: 'USA',
      mode: 'remote',
      postedAt: '2026-10-05T12:00:00',
      text: 'Job type: part-time\nOwn our design system.',
    });
  });
  it('rejects a job without an id or url', () => {
    expect(parseRemotiveJob({ ...job, url: '' })).toBeNull();
    expect(parseRemotiveJob({ ...job, id: undefined })).toBeNull();
  });
});

describe('fetchRemotive', () => {
  it('searches by term and maps the jobs array', async () => {
    let seen = '';
    const out = await fetchRemotive('design systems', async (url) => {
      seen = url;
      return { 'job-count': 1, jobs: [job, { junk: true }] };
    });
    expect(seen).toContain('search=design%20systems');
    expect(out.map((p) => p.id)).toEqual(['remotive:42']);
  });
});
