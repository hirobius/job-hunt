import { describe, expect, it } from 'vitest';
import { BOARD_DOMAINS, companyDomain, logoDomain, logoUrl, postingDomain } from './companyLogo';

describe('logoDomain', () => {
  it.each([
    ['https://www.acme.com/careers/42', 'acme.com'],
    ['acme.com', 'acme.com'],
    ['http://Acme.COM', 'acme.com'],
    ['https://careers.acme.com/jobs/1', 'acme.com'],
    ['https://jobs.acme.io/x', 'acme.io'],
    ['https://shop.acme.co.uk/', 'acme.co.uk'],
    ['https://eng.acme.com/x', 'acme.com'],
    ['https://careers.acme.co.uk/x', 'acme.co.uk'],
    ['https://jobs.acme.com.au', 'acme.com.au'],
    ['https://www.acme.co.nz', 'acme.co.nz'],
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
    'https://jobs.co.uk',
    'https://careers.com.au/x',
    'https://co.uk',
    'https://jobs.org.uk',
    'https://careers.co.za',
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

describe('hosts the blocklist must cover', () => {
  it.each([
    'paycomonline.net',
    'paycom.com',
    'governmentjobs.com',
    'neogov.com',
    'paylocity.com',
    'ultipro.com',
    'ukg.com',
    'adp.com',
    'dayforcehcm.com',
    'breezy.hr',
    'applytojob.com',
    'jazzhr.com',
    'rippling.com',
    'gem.com',
    'pinpointhq.com',
    'hirebridge.com',
    'dice.com',
    'monster.com',
    'builtin.com',
    'simplyhired.com',
    'weworkremotely.com',
    'himalayas.app',
    'welcometothejungle.com',
    'otta.com',
    'usajobs.gov',
    'craigslist.org',
    'careerbuilder.com',
    'snagajob.com',
    'github.com',
    'github.io',
    'notion.site',
    'notion.so',
    'google.com',
    'sites.google.com',
  ])('%s and its subdomains give no domain', (d) => {
    expect(BOARD_DOMAINS).toContain(d);
    expect(logoDomain(`https://${d}/x`)).toBeNull();
    expect(logoDomain(`https://acme.${d}/x`)).toBeNull();
  });
});

describe('postingDomain', () => {
  it.each([
    ['Acme', 'https://www.acme.com/careers/1', 'acme.com'],
    ['Acme, Inc.', 'https://jobs.acme.com/1', 'acme.com'],
    ['The Acme Co', 'https://acme.co.uk/x', 'acme.co.uk'],
    ['Acme Corp LLC', 'https://acme.io', 'acme.io'],
    ['Acme Inc', 'https://acme.com/j', 'acme.com'],
    ['The Acme Co', 'https://acmeco.com/j', 'acmeco.com'],
    ['Bank of America', 'https://bankofamerica.com/j', 'bankofamerica.com'],
    ['Meta', 'https://metacareers.com/j', 'metacareers.com'],
    ['Acme', 'https://acmejobs.com/j', 'acmejobs.com'],
    ['3M', 'https://3m.com/j', '3m.com'],
    ['Société Générale', 'https://societegenerale.com/j', 'societegenerale.com'],
    ['St. Mary’s Health', 'https://stmaryshealth.org', 'stmaryshealth.org'],
  ])('%s at %s → %s', (c, url, out) => expect(postingDomain(c, url)).toBe(out));
  it.each([
    ['Acme', 'https://www.randomhost.com/job/1'],
    ['Acme', 'https://boards.greenhouse.io/acme/1'],
    ['Acme', 'https://acme.github.io/jobs'],
    ['Acme', 'https://jobs.co.uk/x'],
    ['Inc', 'https://inc.com'],
    ['', 'https://acme.com'],
    ['Acme', 'https://staffing-agency.com/acme-job'],
    ['Top Talent Welding', 'https://talent.com/j'],
    ['Spokane Sheet Metal', 'https://metal.com/j'],
    ['Northwest Pipe', 'https://pipe.com/j'],
    ['Global', 'https://insightglobal.com/j'],
    ['HP', 'https://shpock.com/j'],
    ['Apple', 'https://applebees.com/j'],
    ['Go', 'https://gopuff.com/j'],
    ['Acme Welding Supply', 'https://acme.com'],
    ['Acme', 'https://acmewelding.com'],
    ['Acme', 'https://acmecareersjobs.com'],
  ])('%s at %s → none', (c, url) => expect(postingDomain(c, url)).toBeNull());
});

describe('companyDomain', () => {
  it('takes the first usable address: the company site before the posting', () => {
    expect(companyDomain('Acme', ['https://acme.com'], ['https://jobs.lever.co/x'])).toBe(
      'acme.com',
    );
    expect(
      companyDomain('Acme', [undefined, 'https://boards.greenhouse.io/x', 'https://acme.org/c']),
    ).toBe('acme.org');
  });
  it('the company site wins even when its name differs', () => {
    expect(companyDomain('Acme', ['https://other.com'], ['https://acme.com/j'])).toBe('other.com');
  });
  it('falls back to a posting whose domain carries the company name', () => {
    expect(companyDomain('Acme', [undefined], ['https://random.com/1', 'https://acme.com/2'])).toBe(
      'acme.com',
    );
    expect(companyDomain('Acme', [], ['https://random.com/1'])).toBeNull();
  });
  it('is null when none is usable', () => {
    expect(companyDomain('Acme', ['https://jobs.lever.co/x', ''])).toBeNull();
    expect(companyDomain('Acme')).toBeNull();
  });
});

describe('logoUrl', () => {
  it('is DuckDuckGo’s icon service by domain', () => {
    expect(logoUrl('acme.com')).toBe('https://icons.duckduckgo.com/ip3/acme.com.ico');
  });
});

describe('two-part public suffixes', () => {
  it.each([
    'com.pk',
    'co.ke',
    'com.ng',
    'co.il',
    'com.sg',
    'com.hk',
    'com.tw',
    'co.kr',
    'com.mx',
    'com.ar',
    'com.co',
    'com.tr',
    'co.th',
    'com.my',
    'com.ph',
    'com.vn',
    'com.eg',
    'com.sa',
    'co.id',
    'net.au',
    'org.au',
  ])('%s keeps the company label', (suffix) => {
    expect(logoDomain(`https://careers.acme.${suffix}/x`)).toBe(`acme.${suffix}`);
    expect(logoDomain(`https://jobs.${suffix}/x`)).toBeNull();
  });
});
