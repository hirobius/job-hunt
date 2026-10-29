import { describe, expect, it } from 'vitest';
import {
  boardsInText,
  ccIndexes,
  ccPageCount,
  ccUrl,
  hnCompany,
  hnUrl,
  hnWindows,
  mergeCandidates,
  parseCdx,
  parseHnPage,
  parseSeed,
  parseSimplifyListings,
  parseSlugList,
  splitWindow,
  type Candidate,
} from './harvest';

describe('boardsInText', () => {
  it.each([
    ['https://boards.greenhouse.io/stripe/jobs/123', 'greenhouse:stripe'],
    ['see job-boards.greenhouse.io/figma', 'greenhouse:figma'],
    ['https:&#x2F;&#x2F;jobs.lever.co&#x2F;plaid&#x2F;abc', 'lever:plaid'],
    ['https://jobs.eu.lever.co/acme', 'lever:acme:eu'],
    ['jobs.ashbyhq.com/ramp?utm=hn', 'ashby:ramp'],
    ['https://apply.workable.com/acme-co/j/ABC/', 'workable:acme-co'],
    ['https://acme.recruitee.com/o/designer', 'recruitee:acme'],
    ['https://jobs.smartrecruiters.com/Visa1/123', 'smartrecruiters:Visa1'],
    ['https://acme.teamtailor.com/jobs/1', 'teamtailor:acme'],
    ['https://acme.jobs.personio.de/job/1', 'personio:acme'],
    ['https://acme.bamboohr.com/careers/12', 'bamboohr:acme'],
    ['https://ats.rippling.com/en-GB/acme/jobs', 'rippling:acme'],
    ['https://jobs.gem.com/acme', 'gem:acme'],
    ['https://acme.pinpointhq.com/', 'pinpoint:acme'],
    ['https://acme.breezy.hr/p/1', 'breezy:acme'],
  ])('finds %s', (text, want) => {
    const b = boardsInText(text);
    expect(b.map((x) => `${x.kind}:${x.slug}${x.eu ? ':eu' : ''}`)).toEqual([want]);
  });

  it.each([
    'https://boards.greenhouse.io/embed',
    'https://www.recruitee.com/pricing',
    'https://api.lever.co/v0/postings/x',
    'https://jobs.lever.co/',
    'https://marketplace.breezy.hr/',
    'greenhouse.io is an ATS',
  ])('skips %s', (text) => expect(boardsInText(text)).toEqual([]));

  it('lists each board once, case folded', () => {
    expect(
      boardsInText('jobs.lever.co/Plaid and https://jobs.lever.co/plaid/1').map((b) => b.slug),
    ).toEqual(['Plaid']);
  });
});

describe('mergeCandidates', () => {
  it('keeps the first name and site, adds sources, sorts by key', () => {
    const a: Candidate = { board: { kind: 'lever', slug: 'Zed' }, company: '', sources: ['hn'] };
    const b: Candidate = {
      board: { kind: 'lever', slug: 'zed' },
      company: 'Zed Industries',
      website: 'zed.dev',
      sources: ['github'],
    };
    const c: Candidate = {
      board: { kind: 'ashby', slug: 'ramp' },
      company: 'Ramp',
      sources: ['hn'],
    };
    const out = mergeCandidates([[a], [b, c]]);
    expect(out.map((x) => x.board.slug)).toEqual(['ramp', 'Zed']);
    expect(out[1]).toMatchObject({
      company: 'Zed Industries',
      website: 'zed.dev',
      sources: ['hn', 'github'],
    });
  });

  it('keeps Lever EU apart from Lever', () => {
    const out = mergeCandidates([
      [
        { board: { kind: 'lever', slug: 'acme' }, company: '', sources: ['hn'] },
        { board: { kind: 'lever', slug: 'acme', eu: true }, company: '', sources: ['hn'] },
      ],
    ]);
    expect(out).toHaveLength(2);
  });
});

describe('Hacker News', () => {
  it('builds yearly windows per term up to now', () => {
    const w = hnWindows(2024, new Date('2025-03-01T00:00:00Z'), ['lever.co']);
    expect(w).toHaveLength(2);
    expect(w[1].to).toBe(Date.parse('2025-03-01T00:00:00Z') / 1000);
  });

  it('halves a window, and stops at an hour', () => {
    const [a, b] = splitWindow({ term: 't', from: 0, to: 100_000 })!;
    expect([a.from, a.to, b.from, b.to]).toEqual([0, 50_000, 50_000, 100_000]);
    expect(splitWindow({ term: 't', from: 0, to: 3000 })).toBeNull();
  });

  it('asks for comments in the window', () => {
    const u = new URL(hnUrl({ term: 'lever.co', from: 1, to: 2 }, 3));
    expect(u.searchParams.get('tags')).toBe('comment');
    expect(u.searchParams.get('page')).toBe('3');
    expect(u.searchParams.get('numericFilters')).toBe('created_at_i>=1,created_at_i<2');
  });

  it.each([
    ['Acme Robotics | Senior Designer | Remote<p>Apply', 'Acme Robotics'],
    ['Acme (YC W21) | Remote', 'Acme'],
    ['We are hiring lots of people, come join us at our company', ''],
    ['A very long first segment that is clearly a sentence not a name | x', ''],
  ])('reads the company of %s', (html, want) => expect(hnCompany(html)).toBe(want));

  it('names a board only when the comment links one', () => {
    const body = {
      hits: [
        { comment_text: 'Acme | Remote<p>https:&#x2F;&#x2F;jobs.lever.co&#x2F;acme' },
        { comment_text: 'Recruiter | x<p>jobs.lever.co/aa and jobs.lever.co/bb' },
        { comment_text: '' },
      ],
    };
    expect(parseHnPage(body).map((c) => [c.board.slug, c.company])).toEqual([
      ['acme', 'Acme'],
      ['aa', ''],
      ['bb', ''],
    ]);
  });
});

describe('GitHub lists', () => {
  it('reads Simplify listings: board URLs and company names only', () => {
    const out = parseSimplifyListings([
      { url: 'https://boards.greenhouse.io/acme/jobs/1', company_name: 'Acme' },
      { url: 'https://acme.wd1.myworkdayjobs.com/x', company_name: 'Workday Co' },
      'junk',
    ]);
    expect(out).toEqual([
      { board: { kind: 'greenhouse', slug: 'acme' }, company: 'Acme', sources: ['github'] },
    ]);
  });
});

describe('Common Crawl', () => {
  it('reads the newest index ids', () => {
    expect(
      ccIndexes([{ id: 'CC-MAIN-2025-38' }, { id: 'x' }, { id: 'CC-MAIN-2025-33' }], 1),
    ).toEqual(['CC-MAIN-2025-38']);
  });

  it('reads page counts and CDX lines', () => {
    expect(ccPageCount('{"pages": 4, "pageSize": 5}')).toBe(4);
    expect(ccPageCount('nope')).toBe(0);
    const text =
      '{"url": "https://jobs.ashbyhq.com/ramp/abc"}\nnot json\n{"url": "https://example.com"}\n';
    expect(parseCdx(text).map((c) => c.board.slug)).toEqual(['ramp']);
    expect(ccUrl('CC-MAIN-2025-38', 'jobs.lever.co/*')).toContain('url=jobs.lever.co%2F*');
  });
});

describe('the seed', () => {
  it('takes only confirmed boards, with the website', () => {
    const out = parseSeed({
      companies: [
        {
          name: 'A',
          website: 'https://a.com',
          board: { url: 'https://jobs.lever.co/a', confirmed: 'linked' },
        },
        { name: 'B', board: { url: 'https://jobs.lever.co/b', confirmed: null } },
        { name: 'C', board: null },
      ],
    });
    expect(out).toEqual([
      {
        board: { kind: 'lever', slug: 'a' },
        company: 'A',
        website: 'https://a.com',
        sources: ['seed'],
      },
    ]);
  });
});

describe('job-board-aggregator lists', () => {
  it('reads board slugs, dropping junk', () => {
    const out = parseSlugList(['stripe', 'a', 'bad slug', 'embed', 42, 'figma-2'], 'greenhouse');
    expect(out.map((c) => `${c.board.kind}:${c.board.slug}`)).toEqual([
      'greenhouse:stripe',
      'greenhouse:figma-2',
    ]);
    expect(out[0].sources).toEqual(['aggregator']);
  });
});
