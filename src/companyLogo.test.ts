import { describe, expect, it } from 'vitest';
import { BOARD_DOMAINS, companyDomain, logoDomain, logoUrl } from './companyLogo';

describe('logoDomain', () => {
  it.each([
    ['https://www.acme.com/careers/42', 'acme.com'],
    ['acme.com', 'acme.com'],
    ['http://Acme.COM', 'acme.com'],
    ['https://careers.acme.com/jobs/1', 'acme.com'],
    ['https://jobs.acme.io/x', 'acme.io'],
    ['https://shop.acme.co.uk/', 'shop.acme.co.uk'],
    ['https://acme.com:8443/a', 'acme.com'],
  ])('%s → %s', (input, out) => expect(logoDomain(input)).toBe(out));

  it.each([
    'https://boards.greenhouse.io/acme/jobs/1',
    'https://job-boards.greenhouse.io/acme',
    'https://jobs.lever.co/acme/1',
    'https://jobs.ashbyhq.com/acme',
    'https://apply.workable.com/acme',
    'https://acme.recruitee.com/o/x',
    'https://jobs.smartrecruiters.com/Acme',
    'https://acme.teamtailor.com/jobs/1',
    'https://acme.jobs.personio.de/job/1',
    'https://acme.wd5.myworkdayjobs.com/en-US/x',
    'https://acme.icims.com/jobs/1',
    'https://acme.taleo.net/careersection',
    'https://career5.successfactors.com/x',
    'https://abc.fa.us2.oraclecloud.com/hcmUI',
    'https://acme.bamboohr.com/careers',
    'https://jobs.jobvite.com/acme',
    'https://www.linkedin.com/jobs/view/1',
    'https://www.indeed.com/viewjob?jk=1',
    'https://www.glassdoor.com/job-listing/x',
    'https://www.ziprecruiter.com/c/Acme',
    'https://wellfound.com/jobs/1',
    'https://angel.co/company/acme',
    'https://remotive.com/remote-jobs/x',
    'https://remoteok.com/remote-jobs/x',
    'https://jobicy.com/jobs/x',
    'https://news.ycombinator.com/item?id=1',
    'https://www.workatastartup.com.ycombinator.com/x',
    'https://www.google.com/search?q=acme',
  ])('a board or aggregator gives no domain: %s', (input) => expect(logoDomain(input)).toBeNull());

  it.each([
    '',
    '   ',
    undefined,
    null,
    'not a url',
    'mailto:a@acme.com',
    'ftp://acme.com',
    'javascript:alert(1)',
    'https://localhost:5173/x',
    'http://127.0.0.1/x',
    'http://[::1]/x',
    'https://acme.example/jobs',
    'https://larkspur.example.com/careers/x',
    'https://example.org',
    'https://acme.test',
    'https://intranet/jobs',
  ])('not usable: %j', (input) => expect(logoDomain(input)).toBeNull());

  it('every board domain is blocked, and so are its subdomains', () => {
    for (const d of BOARD_DOMAINS) {
      expect(logoDomain(`https://${d}/x`)).toBeNull();
      expect(logoDomain(`https://acme.${d}/x`)).toBeNull();
    }
  });

  it('does not block a company that only ends like a board name', () => {
    expect(logoDomain('https://notlever.co')).toBe('notlever.co');
    expect(logoDomain('https://oracle.com')).toBe('oracle.com');
  });
});

describe('companyDomain', () => {
  it('takes the first usable address: the company site before the posting', () => {
    expect(companyDomain('https://acme.com', 'https://jobs.lever.co/x')).toBe('acme.com');
    expect(companyDomain(undefined, 'https://boards.greenhouse.io/x', 'https://acme.org/c')).toBe(
      'acme.org',
    );
  });
  it('is null when none is usable', () => {
    expect(companyDomain('https://jobs.lever.co/x', '')).toBeNull();
    expect(companyDomain()).toBeNull();
  });
});

describe('logoUrl', () => {
  it('is DuckDuckGo’s icon service by domain', () => {
    expect(logoUrl('acme.com')).toBe('https://icons.duckduckgo.com/ip3/acme.com.ico');
  });
});
