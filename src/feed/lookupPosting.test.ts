import { describe, expect, it } from 'vitest';
import { lookupPosting, postingRef } from './lookupPosting';

describe('postingRef', () => {
  it.each([
    [
      'https://job-boards.greenhouse.io/vercel/jobs/6129441004',
      { kind: 'greenhouse', slug: 'vercel', id: '6129441004' },
    ],
    [
      'https://boards.greenhouse.io/stripe/jobs/123?gh_src=x',
      { kind: 'greenhouse', slug: 'stripe', id: '123' },
    ],
    [
      'https://jobs.lever.co/acme/5dcaffbc-79bd-4e4f-9494-c7d243d5ce06',
      { kind: 'lever', slug: 'acme', id: '5dcaffbc-79bd-4e4f-9494-c7d243d5ce06' },
    ],
    [
      'https://jobs.ashbyhq.com/ramp/baa94095-c976-46d0-8d18-25a951950714',
      { kind: 'ashby', slug: 'ramp', id: 'baa94095-c976-46d0-8d18-25a951950714' },
    ],
  ])('reads %s', (url, ref) => {
    expect(postingRef(url)).toMatchObject(ref);
  });
  it('ignores board pages and other sites', () => {
    expect(postingRef('https://boards.greenhouse.io/stripe')).toBeNull();
    expect(postingRef('https://www.linkedin.com/jobs/view/123')).toBeNull();
  });
});

describe('lookupPosting', () => {
  it('reads a Greenhouse job', async () => {
    const fetchJson = async (u: string) => {
      expect(u).toBe('https://boards-api.greenhouse.io/v1/boards/vercel/jobs/6129441004');
      return {
        id: 6129441004,
        title: 'Design Engineer',
        absolute_url: 'https://x/y',
        location: { name: 'Remote - United States' },
        company_name: 'Vercel',
      };
    };
    const p = await lookupPosting(
      'https://job-boards.greenhouse.io/vercel/jobs/6129441004',
      fetchJson,
    );
    expect(p).toMatchObject({
      title: 'Design Engineer',
      company: 'Vercel',
      location: 'Remote - United States',
      mode: 'remote',
    });
  });
  it('finds an Ashby job inside its board payload', async () => {
    const fetchJson = async () => ({
      jobs: [
        { id: 'other', title: 'Other', jobUrl: 'https://jobs.ashbyhq.com/ramp/other' },
        {
          id: 'baa9',
          title: 'Design Systems Lead',
          jobUrl: 'https://jobs.ashbyhq.com/ramp/baa9',
          location: 'New York, NY',
          isRemote: true,
        },
      ],
    });
    const p = await lookupPosting('https://jobs.ashbyhq.com/ramp/baa9', fetchJson);
    expect(p).toMatchObject({ title: 'Design Systems Lead', company: 'Ramp', mode: 'remote' });
  });
  it('reads a Lever job', async () => {
    const fetchJson = async (u: string) => {
      expect(u).toBe('https://api.lever.co/v0/postings/acme/abc');
      return {
        id: 'abc',
        text: 'UI Engineer',
        hostedUrl: 'https://jobs.lever.co/acme/abc',
        categories: { location: 'Remote' },
        workplaceType: 'remote',
      };
    };
    expect(await lookupPosting('https://jobs.lever.co/acme/abc', fetchJson)).toMatchObject({
      title: 'UI Engineer',
      mode: 'remote',
    });
  });
  it('returns null when the source fails or the job is gone', async () => {
    expect(
      await lookupPosting('https://jobs.lever.co/acme/abc', async () => {
        throw new Error('404');
      }),
    ).toBeNull();
    expect(
      await lookupPosting('https://jobs.ashbyhq.com/ramp/gone', async () => ({ jobs: [] })),
    ).toBeNull();
    expect(await lookupPosting('https://example.com/job', async () => ({}))).toBeNull();
  });
});
