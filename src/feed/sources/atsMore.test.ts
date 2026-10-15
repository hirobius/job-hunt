// Workable and Recruitee boards (UNVERIFIED LIVE: written from documented response shapes).
import { describe, expect, it } from 'vitest';
import {
  boardApiUrl,
  boardsFromUrls,
  canonicalBoardUrl,
  fetchBoard,
  parseBoardUrl,
  parseRecruiteeJob,
  parseWorkableJob,
} from './ats';

describe('parseBoardUrl: Workable and Recruitee', () => {
  it.each([
    ['https://apply.workable.com/acme', { kind: 'workable', slug: 'acme' }],
    ['https://apply.workable.com/acme/', { kind: 'workable', slug: 'acme' }],
    ['https://apply.workable.com/acme/j/ABC123DEF/', { kind: 'workable', slug: 'acme' }],
    ['apply.workable.com/acme', { kind: 'workable', slug: 'acme' }],
    ['https://acme.recruitee.com', { kind: 'recruitee', slug: 'acme' }],
    ['https://acme.recruitee.com/o/design-engineer', { kind: 'recruitee', slug: 'acme' }],
    ['https://acme-labs.recruitee.com/', { kind: 'recruitee', slug: 'acme-labs' }],
  ])('%s', (url, board) => {
    expect(parseBoardUrl(url)).toEqual(board);
  });

  it.each([
    'https://apply.workable.com/',
    'https://apply.workable.com/api/v1/widget/accounts/acme', // the API host path, not a board slug
    'https://www.workable.com/acme',
    'https://recruitee.com/acme',
    'https://www.recruitee.com',
    'https://api.recruitee.com/x',
    'https://a.b.recruitee.com',
    'https://evilrecruitee.com',
    'https://acme.recruitee.com.evil.example',
  ])('rejects %s', (url) => {
    expect(parseBoardUrl(url)).toBeNull();
  });

  it('dedupes across kinds by kind and slug', () => {
    expect(
      boardsFromUrls(['https://apply.workable.com/acme', 'https://acme.recruitee.com'], 9),
    ).toHaveLength(2);
  });
});

describe('urls', () => {
  it('builds the API and canonical urls', () => {
    expect(boardApiUrl({ kind: 'workable', slug: 'acme' })).toBe(
      'https://apply.workable.com/api/v1/widget/accounts/acme?details=true',
    );
    expect(boardApiUrl({ kind: 'recruitee', slug: 'acme' })).toBe(
      'https://acme.recruitee.com/api/offers/',
    );
    expect(canonicalBoardUrl({ kind: 'workable', slug: 'acme' })).toBe(
      'https://apply.workable.com/acme',
    );
    expect(canonicalBoardUrl({ kind: 'recruitee', slug: 'acme' })).toBe(
      'https://acme.recruitee.com',
    );
  });
});

const workable = {
  shortcode: 'ABC123',
  title: 'Design Engineer',
  url: 'https://apply.workable.com/acme/j/ABC123/',
  city: 'Austin',
  state: 'Texas',
  country: 'United States',
  telecommuting: false,
  employment_type: 'Contract',
  published_on: '2026-10-08',
  description: '<p>Own the <b>tokens</b>.</p>',
};

describe('parseWorkableJob', () => {
  it('normalizes a job, joins the location, folds employment type into the text', () => {
    const p = parseWorkableJob(workable, 'acme-labs')!;
    expect(p).toMatchObject({
      id: 'workable:acme-labs:ABC123',
      source: 'workable',
      title: 'Design Engineer',
      company: 'Acme Labs',
      url: workable.url,
      location: 'Austin, Texas, United States',
      postedAt: '2026-10-08',
    });
    expect(p.mode).toBeUndefined();
    expect(p.text).toBe('Employment: Contract\nOwn the tokens.');
  });
  it('telecommuting means remote', () => {
    expect(parseWorkableJob({ ...workable, telecommuting: true }, 'a')!.mode).toBe('remote');
  });
  it('tolerates missing fields and drops junk', () => {
    expect(parseWorkableJob({ shortcode: 'X', url: 'https://a/x' }, 'a')).toMatchObject({
      title: '',
      location: '',
      text: '',
    });
    expect(parseWorkableJob({ title: 'no code' }, 'a')).toBeNull();
    expect(parseWorkableJob({ shortcode: 'X' }, 'a')).toBeNull();
  });
});

const recruitee = {
  id: 77,
  title: 'UI Engineer',
  careers_url: 'https://acme.recruitee.com/o/ui-engineer',
  location: 'Berlin, Germany',
  remote: false,
  created_at: '2026-10-02 10:00:00 UTC',
  description: '<p>Build <i>components</i>.</p>',
  employment_type_code: 'contract',
  company_name: 'Acme GmbH',
};

describe('parseRecruiteeJob', () => {
  it('normalizes an offer; company_name wins over the slug', () => {
    const p = parseRecruiteeJob(recruitee, 'acme')!;
    expect(p).toMatchObject({
      id: 'recruitee:acme:77',
      source: 'recruitee',
      title: 'UI Engineer',
      company: 'Acme GmbH',
      url: recruitee.careers_url,
      location: 'Berlin, Germany',
    });
    expect(p.text).toBe('Employment: contract\nBuild components.');
    expect(parseRecruiteeJob({ ...recruitee, company_name: undefined }, 'acme-labs')!.company).toBe(
      'Acme Labs',
    );
  });
  it('remote flag means remote', () => {
    expect(parseRecruiteeJob({ ...recruitee, remote: true }, 'a')!.mode).toBe('remote');
  });
  it('drops rows without id or url', () => {
    expect(parseRecruiteeJob({ ...recruitee, careers_url: '' }, 'a')).toBeNull();
    expect(parseRecruiteeJob({ title: 'x' }, 'a')).toBeNull();
  });
});

describe('fetchBoard: Workable and Recruitee', () => {
  it('reads Workable jobs', async () => {
    const out = await fetchBoard({ kind: 'workable', slug: 'acme' }, async () => ({
      name: 'Acme',
      jobs: [workable, { junk: 1 }],
    }));
    expect(out.map((p) => p.id)).toEqual(['workable:acme:ABC123']);
  });
  it('a Workable body without a jobs array is an error, not an empty board', async () => {
    await expect(
      fetchBoard({ kind: 'workable', slug: 'acme' }, async () => ({ name: 'Acme' })),
    ).rejects.toThrow();
  });
  it('reads Recruitee offers; a body without offers is an error', async () => {
    const ok = await fetchBoard({ kind: 'recruitee', slug: 'acme' }, async () => ({
      offers: [recruitee],
    }));
    expect(ok).toHaveLength(1);
    await expect(fetchBoard({ kind: 'recruitee', slug: 'acme' }, async () => [])).rejects.toThrow();
  });
});
