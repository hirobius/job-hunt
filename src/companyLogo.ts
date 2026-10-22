// Which web address a company's logo is looked up by. Pure and table-tested (companyLogo.test.ts):
// `CompanyLogo` and every surface that shows a company go through `logoDomain` / `logoUrl`.
// The icon comes from DuckDuckGo's keyless service and sees only the domain (legal.ts discloses it).
//
// A job posting's host is usually the job board's, not the company's: showing Greenhouse's logo for
// every Greenhouse job would be wrong, so board, ATS and aggregator hosts never yield a domain and
// the caller shows the letter instead.

export const LOGO_HOST = 'https://icons.duckduckgo.com';

/** Hosts (and everything under them) that belong to a job board, ATS or aggregator, never to the
 *  hiring company. Oracle's recruiting cloud is `oraclecloud.com`; oracle.com is the company's own. */
export const BOARD_DOMAINS: readonly string[] = [
  'greenhouse.io',
  'lever.co',
  'ashbyhq.com',
  'workable.com',
  'recruitee.com',
  'smartrecruiters.com',
  'teamtailor.com',
  'personio.de',
  'personio.com',
  'workday.com',
  'myworkdayjobs.com',
  'myworkdaysite.com',
  'icims.com',
  'taleo.net',
  'successfactors.com',
  'successfactors.eu',
  'oraclecloud.com',
  'bamboohr.com',
  'jobvite.com',
  'linkedin.com',
  'indeed.com',
  'glassdoor.com',
  'ziprecruiter.com',
  'wellfound.com',
  'angel.co',
  'remotive.com',
  'remotive.io',
  'remoteok.com',
  'remoteok.io',
  'jobicy.com',
  'ycombinator.com',
  'algolia.com',
  'google.com',
];

/** Never a real company site. */
const RESERVED_TLDS = ['example', 'test', 'invalid', 'localhost', 'local', 'internal'];

/** RFC 2606's reserved example sites (the sample data's `*.example.com`): never a real company. */
const RESERVED_SITES = ['example.com', 'example.net', 'example.org'];

/** A careers sub-domain of the company's own site is still the company: look up the bare site. */
const CAREERS_PREFIX = /^(?:careers?|jobs?|apply|boards?|work|hiring)\./;

const isIp = (host: string) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':');

/** The host to look a logo up by for one web address, or null (not a web address, a board, a
 *  reserved or local name, an IP). */
export function logoDomain(address: string | undefined | null): string | null {
  const raw = address?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  let host = url.hostname
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^www\./, '');
  if (!host.includes('.') || isIp(host)) return null;
  if (RESERVED_TLDS.includes(host.slice(host.lastIndexOf('.') + 1))) return null;
  if (RESERVED_SITES.some((d) => host === d || host.endsWith(`.${d}`))) return null;
  if (BOARD_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) return null;
  const bare = host.replace(CAREERS_PREFIX, '');
  if (bare.includes('.') && !BOARD_DOMAINS.some((d) => bare === d)) host = bare;
  return host;
}

/** The first usable domain among the addresses, in the order given (the company's own website
 *  first, then the posting's link). */
export function companyDomain(...addresses: (string | undefined | null)[]): string | null {
  for (const a of addresses) {
    const d = logoDomain(a);
    if (d) return d;
  }
  return null;
}

/** The icon address for a domain. */
export const logoUrl = (domain: string) => `${LOGO_HOST}/ip3/${encodeURIComponent(domain)}.ico`;

/** Under this many pixels a loaded icon is DuckDuckGo's placeholder, not a logo. */
export const MIN_LOGO_PX = 16;

/** The mark's letter: the company's first letter or digit. */
export const logoLetter = (company: string) =>
  (company.match(/[\p{L}\p{N}]/u)?.[0] ?? '').toUpperCase();

/** Icons already judged this page load (true = a real logo), so a row that remounts doesn't flash
 *  back to its letter and none is asked for twice. */
export const verdicts = new Map<string, boolean>();
export const resetLogoVerdicts = () => verdicts.clear();
