import { describe, expect, it } from 'vitest';
import { fetchJobicy, jobicyUrl, parseJobicyJob } from './jobicy';

const job = {
  id: 101,
  url: 'https://jobicy.com/jobs/101-design-systems-engineer',
  jobTitle: 'Design Systems Engineer',
  companyName: 'Acme',
  jobGeo: 'USA, Canada',
  jobType: ['Contract', 'Part-time'],
  pubDate: '2026-10-10 09:00:00',
  jobDescription: '<p>Own our <b>design system</b>.</p>',
  annualSalaryMin: 90000,
  annualSalaryMax: 130000,
  salaryCurrency: 'USD',
};

describe('parseJobicyJob', () => {
  it('normalizes a job: remote, job type in the text, pay carried', () => {
    expect(parseJobicyJob(job)).toEqual({
      id: 'jobicy:101',
      source: 'jobicy',
      title: 'Design Systems Engineer',
      company: 'Acme',
      url: job.url,
      location: 'USA, Canada',
      mode: 'remote',
      postedAt: '2026-10-10T09:00:00Z',
      text: 'Job type: Contract, Part-time\nOwn our design system.',
      salaryMin: 90000,
      salaryMax: 130000,
      currency: 'USD',
    });
  });

  it('tolerates every optional field missing', () => {
    const p = parseJobicyJob({ id: 5, url: 'https://jobicy.com/jobs/5' })!;
    expect(p).toMatchObject({ id: 'jobicy:5', title: '', company: '', location: '', text: '' });
    expect(p.salaryMin).toBeUndefined();
    expect(p.postedAt).toBeUndefined();
  });

  it('tolerates string numbers and a non-array jobType', () => {
    const p = parseJobicyJob({
      ...job,
      annualSalaryMin: '80000',
      annualSalaryMax: 'x',
      jobType: 'Full-time',
    })!;
    expect(p.salaryMin).toBe(80000);
    expect(p.salaryMax).toBeUndefined();
  });

  it('drops junk rows', () => {
    expect(parseJobicyJob({ ...job, url: '' })).toBeNull();
    expect(parseJobicyJob({ ...job, id: undefined })).toBeNull();
    expect(parseJobicyJob('nope')).toBeNull();
  });
});

describe('fetchJobicy', () => {
  it('asks for the term as a tag and maps the jobs array', async () => {
    let seen = '';
    const out = await fetchJobicy('design systems', async (u) => {
      seen = u;
      return { jobs: [job, { junk: 1 }] };
    });
    expect(seen).toBe(jobicyUrl('design systems'));
    expect(seen).toContain('tag=design%20systems');
    expect(seen).toContain('count=50');
    expect(out.map((p) => p.id)).toEqual(['jobicy:101']);
  });

  it('skips the source silently for a tag under 3 characters, without a request', async () => {
    let calls = 0;
    const out = await fetchJobicy('UI', async () => (calls++, { jobs: [job] }));
    expect(out).toEqual([]);
    expect(calls).toBe(0);
  });

  it('a body without a jobs array is an empty list', async () => {
    expect(await fetchJobicy('design systems', async () => 'oops')).toEqual([]);
  });
});
