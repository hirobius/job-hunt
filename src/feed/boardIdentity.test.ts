import { describe, expect, it } from 'vitest';
import {
  boardEvidence,
  confirmHits,
  identify,
  nameKey,
  nameSimilarity,
  SAME_NAME,
  websiteDomain,
  type BoardEvidence,
  type IdentityVerdict,
} from './boardIdentity';

// One real Greenhouse answer for the slug "forward" (2026-10-28, trimmed to one job): the board is
// getfwd.com's "Forward", not the YC company Forward the probe was asked about.
const GREENHOUSE_FORWARD = {
  jobs: [
    {
      absolute_url: 'https://getfwd.com/careers?gh_jid=5268094007',
      id: 5268094007,
      title: 'Senior Manager, Payment Operations',
      company_name: 'Forward',
      first_published: '2026-10-18T10:55:09-04:00',
      updated_at: '2026-10-23T12:33:04-04:00',
      location: { name: 'Austin, Texas' },
    },
  ],
  meta: { total: 2 },
};

describe('websiteDomain', () => {
  it.each([
    ['https://goforward.com', 'goforward.com'],
    ['www.stripe.com', 'stripe.com'],
    ['https://careers.acme.com/jobs', 'acme.com'],
    ['https://www.acme.co.uk/', 'acme.co.uk'],
    ['https://127.0.0.1/', null],
    ['localhost', null],
    ['not a url', null],
    ['https://ats.rippling.com/acme/jobs', null],
    // A design system site on a shared host says nothing about the company's domain.
    ['http://dropbox.github.io/scooter/index.html', null],
    ['https://acme-ds.netlify.app', null],
    ['https://acme.zeroheight.com/styleguide', null],
    // An ATS page is not a company website.
    ['https://jobs.lever.co/acme', null],
    ['https://boards.greenhouse.io/acme', null],
    ['', null],
    [undefined, null],
  ])('%s → %s', (site, want) => expect(websiteDomain(site)).toBe(want));
});

describe('boardEvidence', () => {
  it('reads the stated name and the apply link domain off a real Greenhouse answer', () => {
    expect(boardEvidence(GREENHOUSE_FORWARD, GREENHOUSE_FORWARD.jobs)).toEqual({
      name: 'Forward',
      domains: ['getfwd.com'],
      textDomains: [],
    });
  });

  it('never counts an ATS host, a logo or a CDN image as the company', () => {
    const jobs = [
      {
        hostedUrl: 'https://jobs.lever.co/acme/1',
        applyUrl: 'https://jobs.lever.co/acme/1/apply',
        logoUrl: 'https://cdn.example-images.com/acme.png',
      },
      { url: 'https://ats.rippling.com/acme/jobs/2' },
      { url: 'https://acme.breezy.hr/p/3-designer' },
    ];
    expect(boardEvidence(jobs, jobs)).toEqual({ domains: [], textDomains: [] });
  });

  it('reads links and emails out of job text as text evidence only', () => {
    const jobs = [
      {
        descriptionPlain: 'Read more at https://www.acme.com/about or write to jobs@acme.com.',
        lists: [{ text: 'Perks', content: '<li>See https://linkedin.com/company/acme</li>' }],
      },
    ];
    expect(boardEvidence(jobs, jobs)).toEqual({ domains: [], textDomains: ['acme.com'] });
  });

  it('takes the name from SmartRecruiters / Breezy company objects and Workable’s top level', () => {
    const sr = [{ id: '1', company: { name: 'Forward Networks', identifier: 'forward' } }];
    expect(boardEvidence({ content: sr }, sr).name).toBe('Forward Networks');
    expect(boardEvidence({ name: 'Acme', jobs: [] }, []).name).toBe('Acme');
  });

  it('reads only the first 25 jobs of a list payload (Lever, Breezy)', () => {
    const jobs = Array.from({ length: 40 }, (_, i) => ({ url: `https://co${i}.com/job` }));
    jobs[30] = { url: 'https://acme.com/job' };
    expect(boardEvidence(jobs, jobs).domains).not.toContain('acme.com');
  });

  it('a board-level website counts as a domain', () => {
    expect(boardEvidence({ website: 'https://acme.com', jobs: [] }, []).domains).toEqual([
      'acme.com',
    ]);
  });

  it('caps the domains it keeps', () => {
    const jobs = Array.from({ length: 20 }, (_, i) => ({ url: `https://co${i}.com/job` }));
    expect(boardEvidence(jobs, jobs).domains).toHaveLength(6);
  });
});

describe('nameSimilarity', () => {
  it.each([
    ['Acme', 'Acme, Inc.', 1],
    ['The Browser Company', 'Browser Company', 1],
    ['Acme Labs', 'Acme', 1],
    ['Société Générale', 'Societe Generale', 1],
    ['Hugging Face', 'HuggingFace', 1],
  ])('%s ~ %s', (a, b, want) => expect(nameSimilarity(a, b)).toBe(want));

  it.each([
    ['Forward', 'Forward Networks'],
    ['Forward', 'Forward Financing'],
    ['Linear', 'Linear Orbit'],
    ['Acme', 'Apex'],
  ])('%s is not %s', (a, b) => expect(nameSimilarity(a, b)).toBeLessThan(SAME_NAME));

  it('nameKey folds legal suffixes and a leading The', () => {
    expect(nameKey('The Acme Co., Inc.')).toBe('acme');
  });
});

const ev = (e: Partial<BoardEvidence>): BoardEvidence => ({ domains: [], textDomains: [], ...e });

describe('identify', () => {
  const forward = { name: 'Forward', website: 'https://goforward.com' };
  it.each<[string, { name: string; website?: string }, BoardEvidence | undefined, string]>([
    ['apply links on the company’s own site', forward, ev({ domains: ['goforward.com'] }), 'match'],
    ['its domain named in job text', forward, ev({ textDomains: ['goforward.com'] }), 'match'],
    // The Forward case: same name, another company's site. Domain wins over name.
    [
      'apply links on another company’s site, same name',
      forward,
      boardEvidence(GREENHOUSE_FORWARD, GREENHOUSE_FORWARD.jobs),
      'mismatch',
    ],
    [
      'no website known: the stated name decides',
      { name: 'Forward' },
      ev({ name: 'Forward Networks' }),
      'mismatch',
    ],
    ['no website known, same stated name', { name: 'Acme' }, ev({ name: 'Acme Inc' }), 'match'],
    ['website known, no links: the name decides', forward, ev({ name: 'Forward' }), 'match'],
    ['nothing to go on', forward, ev({}), 'unknown'],
    ['no evidence at all (an old cache entry)', forward, undefined, 'unknown'],
    [
      'website on a shared host is no evidence: the name decides',
      { name: 'Dropbox', website: 'http://dropbox.github.io/scooter/' },
      ev({ name: 'Dropbox', domains: ['dropbox.com'] }),
      'match',
    ],
  ])('%s', (_, company, evidence, want) => {
    expect(identify(company, evidence).identity).toBe(want);
  });

  it('says why a board is not the company’s', () => {
    expect(identify(forward, boardEvidence(GREENHOUSE_FORWARD, GREENHOUSE_FORWARD.jobs)).why).toBe(
      'Its jobs link to getfwd.com, not goforward.com.',
    );
    expect(identify({ name: 'Forward' }, ev({ name: 'Forward Networks' })).why).toBe(
      "The board is Forward Networks's.",
    );
  });
});

describe('confirmHits', () => {
  const h = (id: string, identity: IdentityVerdict['identity']) => ({ id, verdict: { identity } });
  const ids = (r: { confirmed: { id: string }[]; unconfirmed: { id: string }[] }) => ({
    confirmed: r.confirmed.map((x) => x.id),
    unconfirmed: r.unconfirmed.map((x) => x.id),
  });

  it.each<[string, ReturnType<typeof h>[], { confirmed: string[]; unconfirmed: string[] }]>([
    [
      'one board, nothing either way: kept',
      [h('gh', 'unknown')],
      { confirmed: ['gh'], unconfirmed: [] },
    ],
    [
      'one board that is someone else’s',
      [h('gh', 'mismatch')],
      { confirmed: [], unconfirmed: ['gh'] },
    ],
    [
      // Forward: three systems answered for one name and none shows it is the company.
      'several boards, none confirmed',
      [h('gh', 'mismatch'), h('sr', 'mismatch'), h('pe', 'unknown')],
      { confirmed: [], unconfirmed: ['gh', 'sr', 'pe'] },
    ],
    [
      'several boards, one matches: only that one is kept',
      [h('gh', 'match'), h('sr', 'mismatch'), h('pe', 'unknown')],
      { confirmed: ['gh'], unconfirmed: ['sr', 'pe'] },
    ],
    [
      'two boards with nothing either way are ambiguous',
      [h('lever', 'unknown'), h('ashby', 'unknown')],
      { confirmed: [], unconfirmed: ['lever', 'ashby'] },
    ],
    ['no boards', [], { confirmed: [], unconfirmed: [] }],
  ])('%s', (_, hits, want) => expect(ids(confirmHits(hits))).toEqual(want));
});
