// BambooHR, Rippling, Gem, Pinpoint and Breezy HR boards. UNVERIFIED LIVE: their hosts were not
// reachable from the build container, so the payloads below are written from the shapes each
// careers page reads, not captured answers.
import { describe, expect, it } from 'vitest';
import { boardOfJobUrl } from '../liveness';
import { boardApiUrl, boardJobs, canonicalBoardUrl, fetchBoard, parseBoardUrl } from './ats';

describe('parseBoardUrl: the five newer boards', () => {
  it.each([
    ['https://acme.bamboohr.com/careers', { kind: 'bamboohr', slug: 'acme' }],
    ['https://acme.bamboohr.com/careers/42', { kind: 'bamboohr', slug: 'acme' }],
    ['https://ats.rippling.com/acme/jobs', { kind: 'rippling', slug: 'acme' }],
    ['https://ats.rippling.com/en-GB/acme/jobs/abc-123', { kind: 'rippling', slug: 'acme' }],
    // A two-letter company is not a locale.
    ['https://ats.rippling.com/hq/jobs', { kind: 'rippling', slug: 'hq' }],
    ['https://jobs.gem.com/acme', { kind: 'gem', slug: 'acme' }],
    ['https://jobs.gem.com/acme/am9icG9zdDox', { kind: 'gem', slug: 'acme' }],
    ['https://acme.pinpointhq.com', { kind: 'pinpoint', slug: 'acme' }],
    ['https://acme.pinpointhq.com/postings/7f2c', { kind: 'pinpoint', slug: 'acme' }],
    ['https://acme.breezy.hr', { kind: 'breezy', slug: 'acme' }],
    [
      'https://acme-labs.breezy.hr/p/0a1b2c-product-designer',
      { kind: 'breezy', slug: 'acme-labs' },
    ],
  ])('%s', (url, board) => {
    expect(parseBoardUrl(url)).toEqual(board);
  });

  it.each([
    'https://www.bamboohr.com/careers',
    'https://api.bamboohr.com/x',
    'https://a.b.bamboohr.com/careers',
    'https://ats.rippling.com/',
    'https://www.rippling.com/careers',
    'https://jobs.gem.com/',
    'https://www.gem.com/careers',
    'https://www.pinpointhq.com/',
    'https://app.breezy.hr/',
    'https://marketplace.breezy.hr/',
    'https://acme.breezy.hr.evil.example',
  ])('rejects %s', (url) => {
    expect(parseBoardUrl(url)).toBeNull();
  });
});

describe('urls', () => {
  it.each([
    ['bamboohr', 'https://acme.bamboohr.com/careers/list', 'https://acme.bamboohr.com/careers'],
    [
      'rippling',
      'https://api.rippling.com/platform/api/ats/v1/board/acme/jobs',
      'https://ats.rippling.com/acme/jobs',
    ],
    ['gem', 'https://api.gem.com/job_board/v0/acme/job_posts/', 'https://jobs.gem.com/acme'],
    ['pinpoint', 'https://acme.pinpointhq.com/postings.json', 'https://acme.pinpointhq.com'],
    ['breezy', 'https://acme.breezy.hr/json', 'https://acme.breezy.hr'],
  ] as const)('%s', (kind, api, page) => {
    expect(boardApiUrl({ kind, slug: 'acme' })).toBe(api);
    expect(canonicalBoardUrl({ kind, slug: 'acme' })).toBe(page);
    // The board's page reads back as the same board.
    expect(parseBoardUrl(page)).toEqual({ kind, slug: 'acme' });
  });
});

const BAMBOO = {
  meta: { totalCount: 2 },
  result: [
    {
      id: '42',
      jobOpeningName: 'Design Systems Lead',
      departmentLabel: 'Design',
      employmentStatusLabel: 'Contractor',
      location: { city: 'Lindon', state: 'Utah' },
      isRemote: true,
    },
    { id: '43', jobOpeningName: 'Office Manager', location: { city: 'Lindon', state: 'Utah' } },
  ],
};
const RIPPLING = [
  {
    uuid: 'abc-123',
    name: 'Senior Design Systems Engineer',
    url: 'https://ats.rippling.com/acme/jobs/abc-123',
    department: { label: 'Design' },
    workLocation: { label: 'Remote (US)' },
  },
];
const GEM = [
  {
    id: 'am9icG9zdDox',
    title: 'Design Technologist',
    absolute_url: 'https://jobs.gem.com/acme/am9icG9zdDox',
    location: { name: 'New York, NY' },
    location_type: 'hybrid',
    employment_type: 'contract',
    content: '<p>Own our <b>design system</b>.</p>',
    first_published_at: '2026-10-20T00:00:00Z',
  },
];
const PINPOINT = {
  data: [
    {
      id: '7f2c',
      title: 'Product Designer, Design System',
      url: 'https://acme.pinpointhq.com/postings/7f2c',
      location: { name: 'London' },
      workplace_type: 'remote',
      employment_type_text: 'Full-time',
      description: '<p>Build the component library.</p>',
    },
  ],
};
const BREEZY = [
  {
    id: '0a1b2c',
    friendly_id: '0a1b2c-product-designer',
    name: 'Product Designer (Design Systems)',
    url: 'https://acme.breezy.hr/p/0a1b2c-product-designer',
    published_date: '2026-10-21T00:00:00Z',
    type: { name: 'Full-Time' },
    location: { name: 'Austin, TX', is_remote: false },
    company: { name: 'Acme Inc' },
  },
];

describe('fetchBoard', () => {
  const read = (kind: Parameters<typeof boardApiUrl>[0]['kind'], body: unknown) =>
    fetchBoard({ kind, slug: 'acme' }, async () => body);

  it('BambooHR: title, location, remote, employment, a link to the posting', async () => {
    const [p, q] = await read('bamboohr', BAMBOO);
    expect(p).toMatchObject({
      id: 'bamboohr:acme:42',
      source: 'bamboohr',
      title: 'Design Systems Lead',
      company: 'Acme',
      url: 'https://acme.bamboohr.com/careers/42',
      location: 'Lindon, Utah',
      mode: 'remote',
      text: 'Employment: Contractor\nDesign',
    });
    expect(q.mode).toBeUndefined();
  });

  it('Rippling', async () => {
    expect(await read('rippling', RIPPLING)).toEqual([
      expect.objectContaining({
        id: 'rippling:acme:abc-123',
        title: 'Senior Design Systems Engineer',
        url: 'https://ats.rippling.com/acme/jobs/abc-123',
        location: 'Remote (US)',
        mode: 'remote',
        text: 'Design',
      }),
    ]);
  });

  it('Gem', async () => {
    const [p] = await read('gem', GEM);
    expect(p).toMatchObject({
      id: 'gem:acme:am9icG9zdDox',
      title: 'Design Technologist',
      url: 'https://jobs.gem.com/acme/am9icG9zdDox',
      location: 'New York, NY',
      mode: 'hybrid',
      postedAt: '2026-10-20T00:00:00Z',
    });
    expect(p.text).toContain('Employment: contract');
    expect(p.text).toContain('Own our design system.');
  });

  it('Pinpoint', async () => {
    const [p] = await read('pinpoint', PINPOINT);
    expect(p).toMatchObject({
      id: 'pinpoint:acme:7f2c',
      url: 'https://acme.pinpointhq.com/postings/7f2c',
      location: 'London',
      mode: 'remote',
    });
    expect(p.text).toContain('Build the component library.');
  });

  it('Breezy: the company’s own name, and its posting link', async () => {
    const [p] = await read('breezy', BREEZY);
    expect(p).toMatchObject({
      id: 'breezy:acme:0a1b2c',
      company: 'Acme Inc',
      url: 'https://acme.breezy.hr/p/0a1b2c-product-designer',
      location: 'Austin, TX',
      postedAt: '2026-10-21T00:00:00Z',
    });
  });

  it('builds the posting link when a board leaves it out', async () => {
    const [r] = await read('rippling', [{ uuid: 'u1', name: 'X' }]);
    expect(r.url).toBe('https://ats.rippling.com/acme/jobs/u1');
    const [b] = await read('breezy', [{ id: 'b1', friendly_id: 'b1-x', name: 'X' }]);
    expect(b.url).toBe('https://acme.breezy.hr/p/b1-x');
  });

  it('never takes a non-web link', async () => {
    const [p] = await read('pinpoint', { data: [{ id: '1', url: 'javascript:alert(1)' }] });
    expect(p.url).toBe('https://acme.pinpointhq.com/postings/1');
  });

  it.each([
    ['bamboohr', { meta: {} }],
    ['rippling', { error: 'nope' }],
    ['gem', 'html'],
    ['pinpoint', []],
    ['breezy', { jobs: 'x' }],
  ] as const)(
    '%s: a body without a job list is an error, not an empty board',
    async (kind, body) => {
      expect(boardJobs({ kind, slug: 'acme' }, body)).toBeNull();
      await expect(read(kind, body)).rejects.toThrow(/no job list/);
    },
  );
});

describe('liveness refs', () => {
  it.each([
    ['https://acme.bamboohr.com/careers/42', '42'],
    ['https://ats.rippling.com/acme/jobs/abc-123', 'abc-123'],
    ['https://jobs.gem.com/acme/am9icG9zdDox', 'am9icG9zdDox'],
    ['https://acme.pinpointhq.com/postings/7f2c', '7f2c'],
    // The title slug after the id may change when the role is retitled.
    ['https://acme.breezy.hr/p/0a1b2c-product-designer', '0a1b2c'],
    ['https://acme.breezy.hr/p/0a1b2c-lead-designer', '0a1b2c'],
  ])('%s → %s', (url, ref) => {
    expect(boardOfJobUrl(url)?.ref).toBe(ref);
  });

  it.each([
    'https://acme.bamboohr.com/careers',
    'https://ats.rippling.com/acme/jobs',
    'https://jobs.gem.com/acme',
    'https://acme.pinpointhq.com',
    'https://acme.breezy.hr',
  ])('a board page is not a posting: %s', (url) => {
    expect(boardOfJobUrl(url)).toBeNull();
  });
});
