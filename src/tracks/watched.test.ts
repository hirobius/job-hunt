import { describe, expect, it } from 'vitest';
import { parseBoardUrl } from '../feed/sources/ats';
import { DIRECTORY_BY_PACK, TARGETS_BY_PACK } from '../radar/directory';
import { watchedFromUrl } from './watched';

describe('watchedFromUrl', () => {
  it('agrees with the app parser on every design systems starter board', () => {
    const urls = [
      ...DIRECTORY_BY_PACK.designsystems,
      ...TARGETS_BY_PACK.designsystems.map((c) => c.url),
    ];
    for (const url of urls) {
      const app = parseBoardUrl(url);
      const w = watchedFromUrl(url);
      if (app && !app.eu && ['greenhouse', 'lever', 'ashby'].includes(app.kind))
        expect(w, url).toMatchObject({ ats: app.kind, slug: app.slug });
      else expect(w, url).toBeNull();
    }
  });

  it('reads the embed, API and job-boards forms; names the company when given', () => {
    expect(watchedFromUrl('https://boards.greenhouse.io/embed/job_board?for=figma')).toEqual({
      company: 'figma',
      ats: 'greenhouse',
      slug: 'figma',
    });
    expect(watchedFromUrl('https://boards-api.greenhouse.io/v1/boards/stripe/jobs')?.slug).toBe(
      'stripe',
    );
    expect(watchedFromUrl('job-boards.greenhouse.io/datadog', 'Datadog')).toEqual({
      company: 'Datadog',
      ats: 'greenhouse',
      slug: 'datadog',
    });
    expect(watchedFromUrl('https://jobs.ashbyhq.com/openai')?.ats).toBe('ashby');
  });

  it('leaves out every other link (an EU Lever board, a search, a careers page)', () => {
    expect(watchedFromUrl('https://jobs.eu.lever.co/acme')).toBeNull();
    expect(watchedFromUrl('https://www.google.com/search?q=boards.greenhouse.io')).toBeNull();
    expect(watchedFromUrl('https://stripe.com/jobs')).toBeNull();
    expect(watchedFromUrl('not a url')).toBeNull();
  });
});
