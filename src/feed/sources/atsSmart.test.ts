// SmartRecruiters, Teamtailor and Personio boards (#216). UNVERIFIED LIVE: written from reported
// response shapes; the build sandbox can't reach them.
import { describe, expect, it } from 'vitest';
import {
  boardApiUrl,
  boardJobs,
  canonicalBoardUrl,
  fetchBoard,
  parseBoardUrl,
  parsePersonioJob,
  parseSmartRecruitersJob,
  parseTeamtailorJob,
  type Board,
} from './ats';

describe('parseBoardUrl: SmartRecruiters, Teamtailor and Personio', () => {
  it.each([
    ['https://jobs.smartrecruiters.com/Acme', { kind: 'smartrecruiters', slug: 'Acme' }],
    [
      'https://jobs.smartrecruiters.com/Acme/744000012345678-design-engineer',
      { kind: 'smartrecruiters', slug: 'Acme' },
    ],
    ['careers.smartrecruiters.com/acme', { kind: 'smartrecruiters', slug: 'acme' }],
    ['https://acme.teamtailor.com', { kind: 'teamtailor', slug: 'acme' }],
    ['https://acme.teamtailor.com/jobs/123-ui-engineer', { kind: 'teamtailor', slug: 'acme' }],
    ['https://acme-labs.jobs.personio.de/', { kind: 'personio', slug: 'acme-labs' }],
    ['https://acme.jobs.personio.com/job/42?language=en', { kind: 'personio', slug: 'acme' }],
  ])('%s', (url, board) => {
    expect(parseBoardUrl(url)).toEqual(board);
  });

  it.each([
    'https://jobs.smartrecruiters.com/',
    'https://www.smartrecruiters.com/acme',
    'https://teamtailor.com/acme',
    'https://www.teamtailor.com',
    'https://a.b.teamtailor.com',
    'https://acme.teamtailor.com.evil.example',
    'https://jobs.personio.de/acme',
    'https://acme.personio.de',
    'https://www.jobs.personio.de',
  ])('rejects %s', (url) => {
    expect(parseBoardUrl(url)).toBeNull();
  });
});

describe('urls', () => {
  it.each<[Board, string, string]>([
    [
      { kind: 'smartrecruiters', slug: 'Acme' },
      'https://api.smartrecruiters.com/v1/companies/Acme/postings?limit=100',
      'https://jobs.smartrecruiters.com/Acme',
    ],
    [
      { kind: 'teamtailor', slug: 'acme' },
      'https://acme.teamtailor.com/jobs.json',
      'https://acme.teamtailor.com/jobs',
    ],
    [
      { kind: 'personio', slug: 'acme' },
      'https://acme.jobs.personio.de/search.json',
      'https://acme.jobs.personio.de',
    ],
  ])('%o', (b, api, page) => {
    expect(boardApiUrl(b)).toBe(api);
    expect(canonicalBoardUrl(b)).toBe(page);
    // The page a tile links to reads back as the same board.
    expect(parseBoardUrl(page)).toEqual(b);
  });
});

const smart = {
  id: '744000012345678',
  name: 'Design Engineer',
  company: { identifier: 'Acme', name: 'Acme Corp' },
  releasedDate: '2026-10-05T10:00:00.000Z',
  location: { city: 'Austin', region: 'TX', country: 'us', remote: false },
  typeOfEmployment: { label: 'Contract' },
  department: { label: 'Design' },
  experienceLevel: { label: 'Mid-Senior Level' },
};

describe('parseSmartRecruitersJob', () => {
  it('normalizes a posting and builds its page url', () => {
    expect(parseSmartRecruitersJob(smart, 'Acme')).toEqual({
      id: 'smartrecruiters:Acme:744000012345678',
      source: 'smartrecruiters',
      title: 'Design Engineer',
      company: 'Acme Corp',
      url: 'https://jobs.smartrecruiters.com/Acme/744000012345678',
      location: 'Austin, TX, US',
      mode: undefined,
      postedAt: '2026-10-05T10:00:00.000Z',
      text: 'Employment: Contract\nDesign\nMid-Senior Level',
    });
  });
  it.each([
    [{ remote: true }, 'remote'],
    [{ hybrid: true }, 'hybrid'],
    [{ fullLocation: 'Remote, US' }, 'remote'],
  ])('location %o is %s', (location, mode) => {
    expect(parseSmartRecruitersJob({ ...smart, location }, 'Acme')!.mode).toBe(mode);
  });
  it('tolerates missing fields and drops rows without an id', () => {
    expect(parseSmartRecruitersJob({ id: 1 }, 'acme-labs')).toMatchObject({
      title: '',
      company: 'Acme Labs',
      location: '',
      text: '',
    });
    expect(parseSmartRecruitersJob({ name: 'x' }, 'a')).toBeNull();
  });
});

const tailorFlat = {
  id: 123,
  title: 'UI Engineer',
  url: 'https://acme.teamtailor.com/jobs/123-ui-engineer',
  location: 'Stockholm',
  remote_status: 'hybrid',
  created_at: '2026-10-01',
  body: '<p>Own the <b>tokens</b>.</p>',
};
const tailorJsonApi = {
  id: '124',
  type: 'jobs',
  attributes: {
    title: 'Design Lead',
    body: '<p>Lead.</p>',
    'remote-status': 'fully',
    'created-at': '2026-10-02',
  },
  links: { 'careersite-job-url': 'https://acme.teamtailor.com/jobs/124-design-lead' },
};

describe('parseTeamtailorJob', () => {
  it('reads a flat job', () => {
    expect(parseTeamtailorJob(tailorFlat, 'acme')).toEqual({
      id: 'teamtailor:acme:123',
      source: 'teamtailor',
      title: 'UI Engineer',
      company: 'Acme',
      url: tailorFlat.url,
      location: 'Stockholm',
      mode: 'hybrid',
      postedAt: '2026-10-01',
      text: 'Own the tokens.',
    });
  });
  it('reads a JSON:API resource', () => {
    expect(parseTeamtailorJob(tailorJsonApi, 'acme')).toMatchObject({
      id: 'teamtailor:acme:124',
      title: 'Design Lead',
      url: 'https://acme.teamtailor.com/jobs/124-design-lead',
      mode: 'remote',
      postedAt: '2026-10-02',
      text: 'Lead.',
    });
  });
  it('drops rows without id or url', () => {
    expect(parseTeamtailorJob({ ...tailorFlat, url: '' }, 'a')).toBeNull();
    expect(parseTeamtailorJob({ title: 'x', url: 'https://a/x' }, 'a')).toBeNull();
  });
});

const personio = {
  id: 42,
  name: 'Frontend Engineer',
  office: 'Berlin',
  department: 'Engineering',
  employment_type: 'freelance',
  schedule: 'full-time',
  seniority: 'experienced',
  keywords: 'react,design system',
};

describe('parsePersonioJob', () => {
  it('normalizes a position and builds its page url', () => {
    expect(parsePersonioJob(personio, 'acme-labs')).toEqual({
      id: 'personio:acme-labs:42',
      source: 'personio',
      title: 'Frontend Engineer',
      company: 'Acme Labs',
      url: 'https://acme-labs.jobs.personio.de/job/42',
      location: 'Berlin',
      mode: undefined,
      postedAt: undefined,
      text: 'Employment: freelance\nfull-time\nEngineering\nexperienced\nreact,design system',
    });
  });
  it('drops rows without an id', () => {
    expect(parsePersonioJob({ name: 'x' }, 'a')).toBeNull();
  });
});

describe('boardJobs and fetchBoard', () => {
  it.each<[Board, unknown, number | null]>([
    [{ kind: 'smartrecruiters', slug: 'a' }, { totalFound: 1, content: [smart] }, 1],
    [{ kind: 'smartrecruiters', slug: 'a' }, { jobs: [] }, null],
    [{ kind: 'teamtailor', slug: 'a' }, [tailorFlat], 1],
    [{ kind: 'teamtailor', slug: 'a' }, { jobs: [tailorFlat] }, 1],
    [{ kind: 'teamtailor', slug: 'a' }, { data: [tailorJsonApi] }, 1],
    [{ kind: 'teamtailor', slug: 'a' }, { error: 'x' }, null],
    [{ kind: 'personio', slug: 'a' }, [personio], 1],
    [{ kind: 'personio', slug: 'a' }, { positions: [] }, null],
  ])('%o reads %o', (b, body, n) => {
    expect(boardJobs(b, body)?.length ?? null).toBe(n);
  });

  it('reads each board and drops junk rows', async () => {
    const sr = await fetchBoard({ kind: 'smartrecruiters', slug: 'Acme' }, async () => ({
      content: [smart, {}],
    }));
    expect(sr.map((p) => p.id)).toEqual(['smartrecruiters:Acme:744000012345678']);
    const tt = await fetchBoard({ kind: 'teamtailor', slug: 'acme' }, async () => ({
      data: [tailorJsonApi, { id: 9 }],
    }));
    expect(tt.map((p) => p.id)).toEqual(['teamtailor:acme:124']);
    const pe = await fetchBoard({ kind: 'personio', slug: 'acme' }, async () => [personio]);
    expect(pe).toHaveLength(1);
  });

  it.each<Board>([
    { kind: 'smartrecruiters', slug: 'a' },
    { kind: 'teamtailor', slug: 'a' },
    { kind: 'personio', slug: 'a' },
  ])('a %o body without a job list is an error, not an empty board', async (b) => {
    await expect(fetchBoard(b, async () => ({ nope: 1 }))).rejects.toThrow();
  });
});
