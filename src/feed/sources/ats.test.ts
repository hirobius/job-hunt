import { describe, expect, it } from 'vitest';
import {
  boardApiUrl,
  canonicalBoardUrl,
  boardsFromUrls,
  fetchBoard,
  parseAshbyJob,
  parseBoardUrl,
  parseGreenhouseJob,
  parseLeverJob,
} from './ats';

describe('parseBoardUrl', () => {
  it.each([
    ['https://boards.greenhouse.io/figma', { kind: 'greenhouse', slug: 'figma' }],
    ['https://job-boards.greenhouse.io/acme/jobs/123', { kind: 'greenhouse', slug: 'acme' }],
    ['https://boards.greenhouse.io/embed/job_board?for=acme', { kind: 'greenhouse', slug: 'acme' }],
    ['https://boards-api.greenhouse.io/v1/boards/acme/jobs', { kind: 'greenhouse', slug: 'acme' }],
    ['https://jobs.lever.co/plaid', { kind: 'lever', slug: 'plaid' }],
    ['https://jobs.lever.co/plaid/6ed76ce8-4156', { kind: 'lever', slug: 'plaid' }],
    ['https://jobs.eu.lever.co/acme', { kind: 'lever', slug: 'acme', eu: true }],
    ['https://jobs.ashbyhq.com/ramp', { kind: 'ashby', slug: 'ramp' }],
    ['https://jobs.ashbyhq.com/Ramp/34413f8d', { kind: 'ashby', slug: 'Ramp' }],
    ['jobs.ashbyhq.com/ramp', { kind: 'ashby', slug: 'ramp' }],
  ])('%s', (url, board) => {
    expect(parseBoardUrl(url)).toEqual(board);
  });

  it.each([
    // A Google-dork tile *about* Greenhouse is not a board.
    'https://www.google.com/search?q=site%3Aboards.greenhouse.io+%22design+systems%22',
    'https://boards.greenhouse.io/',
    'https://jobs.lever.co/',
    'https://www.linkedin.com/jobs/search/?keywords=design',
    'not a url',
    'https://evil.example/jobs.lever.co/acme',
    'https://evilashbyhq.com/ramp',
  ])('rejects %s', (url) => {
    expect(parseBoardUrl(url)).toBeNull();
  });
});

describe('boardsFromUrls', () => {
  it('dedupes boards case-insensitively and caps the count', () => {
    const out = boardsFromUrls(
      [
        'https://jobs.lever.co/plaid',
        'https://jobs.lever.co/Plaid/123',
        'https://jobs.ashbyhq.com/ramp',
      ],
      10,
    );
    expect(out.map((b) => `${b.kind}:${b.slug}`)).toEqual(['lever:plaid', 'ashby:ramp']);
    expect(boardsFromUrls(['https://jobs.lever.co/a', 'https://jobs.lever.co/b'], 1)).toHaveLength(
      1,
    );
  });
});

describe('boardApiUrl', () => {
  it.each([
    [
      { kind: 'greenhouse', slug: 'acme' },
      'https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true',
    ],
    [{ kind: 'lever', slug: 'acme' }, 'https://api.lever.co/v0/postings/acme?mode=json'],
    [
      { kind: 'lever', slug: 'acme', eu: true },
      'https://api.eu.lever.co/v0/postings/acme?mode=json',
    ],
    [{ kind: 'ashby', slug: 'acme' }, 'https://api.ashbyhq.com/posting-api/job-board/acme'],
  ] as const)('%j', (board, url) => {
    expect(boardApiUrl(board)).toBe(url);
  });
});

describe('parseGreenhouseJob', () => {
  it('decodes the double-escaped content and infers mode from the location', () => {
    const p = parseGreenhouseJob(
      {
        id: 9,
        title: 'Staff Design Systems Engineer',
        absolute_url: 'https://boards.greenhouse.io/acme/jobs/9',
        location: { name: 'Remote (US)' },
        first_published: '2026-10-01T00:00:00-04:00',
        updated_at: '2026-10-03T00:00:00-04:00',
        company_name: 'Acme',
        content: '&lt;p&gt;Lead our design system &amp;amp; tokens.&lt;/p&gt;',
      },
      'acme',
    )!;
    expect(p).toMatchObject({
      id: 'greenhouse:acme:9',
      source: 'greenhouse',
      title: 'Staff Design Systems Engineer',
      company: 'Acme',
      location: 'Remote (US)',
      mode: 'remote',
      postedAt: '2026-10-01T00:00:00-04:00',
    });
    expect(p.text).toBe('Lead our design system & tokens.');
  });
  it('falls back to the slug for the company', () => {
    expect(
      parseGreenhouseJob({ id: 1, title: 'x', absolute_url: 'https://a/1' }, 'acme-labs')!.company,
    ).toBe('Acme Labs');
  });
});

describe('parseLeverJob', () => {
  it('maps workplaceType, ms timestamps, and folds commitment + lists into the text', () => {
    const p = parseLeverJob(
      {
        id: 'abc',
        text: 'Design Engineer',
        hostedUrl: 'https://jobs.lever.co/acme/abc',
        createdAt: Date.parse('2026-10-04T00:00:00Z'),
        workplaceType: 'remote',
        categories: { location: 'United States', commitment: 'Contract' },
        descriptionPlain: 'Build components.',
        lists: [{ text: 'You will', content: '<li>Own the design system</li>' }],
      },
      'acme',
    )!;
    expect(p).toMatchObject({
      id: 'lever:acme:abc',
      company: 'Acme',
      location: 'United States',
      mode: 'remote',
      postedAt: '2026-10-04T00:00:00.000Z',
    });
    expect(p.text).toContain('Commitment: Contract');
    expect(p.text).toContain('Own the design system');
  });
  it('treats "unspecified" workplace as unknown', () => {
    expect(
      parseLeverJob(
        { id: 'a', text: 't', hostedUrl: 'https://a', workplaceType: 'unspecified' },
        'x',
      )!.mode,
    ).toBe(undefined);
  });
});

describe('parseAshbyJob', () => {
  it('maps OnSite/Hybrid/Remote and folds a contract employment type into the text', () => {
    const p = parseAshbyJob(
      {
        id: 'u1',
        title: 'Design Technologist',
        jobUrl: 'https://jobs.ashbyhq.com/acme/u1',
        location: 'New York, NY',
        workplaceType: 'OnSite',
        employmentType: 'Contract',
        publishedAt: '2026-10-06T00:00:00Z',
        descriptionPlain: 'Tokens and Storybook.',
      },
      'acme',
    )!;
    expect(p).toMatchObject({ id: 'ashby:acme:u1', mode: 'onsite', location: 'New York, NY' });
    expect(p.text).toBe('Employment: Contract\nTokens and Storybook.');
  });
  it('skips unlisted jobs', () => {
    expect(
      parseAshbyJob({ id: 'u', title: 't', jobUrl: 'https://a', isListed: false }, 'x'),
    ).toBeNull();
  });
});

describe('fetchBoard', () => {
  it('fetches the board API and parses by kind', async () => {
    let seen = '';
    const out = await fetchBoard({ kind: 'ashby', slug: 'acme' }, async (url) => {
      seen = url;
      return {
        jobs: [{ id: 'u1', title: 'Design Engineer', jobUrl: 'https://jobs.ashbyhq.com/acme/u1' }],
      };
    });
    expect(seen).toBe('https://api.ashbyhq.com/posting-api/job-board/acme');
    expect(out.map((p) => p.id)).toEqual(['ashby:acme:u1']);
  });
  it('reads Lever as a bare array', async () => {
    const out = await fetchBoard({ kind: 'lever', slug: 'acme' }, async () => [
      { id: 'a', text: 'UI Engineer', hostedUrl: 'https://jobs.lever.co/acme/a' },
    ]);
    expect(out).toHaveLength(1);
  });
});

describe('canonicalBoardUrl', () => {
  it.each([
    [{ kind: 'greenhouse', slug: 'figma' }, 'https://boards.greenhouse.io/figma'],
    [{ kind: 'lever', slug: 'plaid' }, 'https://jobs.lever.co/plaid'],
    [{ kind: 'lever', slug: 'acme', eu: true }, 'https://jobs.eu.lever.co/acme'],
    [{ kind: 'ashby', slug: 'ramp' }, 'https://jobs.ashbyhq.com/ramp'],
  ] as const)('%j', (board, url) => {
    expect(canonicalBoardUrl(board)).toBe(url);
    expect(parseBoardUrl(url)).toEqual(board);
  });
});
