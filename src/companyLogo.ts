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
  'bsky.app',
  'reddit.com',
  'mastodon.social',
  'hachyderm.io',
  'ycombinator.com',
  'algolia.com',
  'google.com',
  'sites.google.com',
  // More ATS
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
  // More job boards
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
  // Hosting: a page on someone's repo or notes is not their company
  'github.com',
  'github.io',
  'notion.site',
  'notion.so',
];

/** Common two-level public suffixes. The registrable name is the label before one of these (or
 *  before the last label), so `jobs.co.uk` has no company in it and `shop.acme.co.uk` is acme.co.uk. */
const TWO_LEVEL_SUFFIXES = new Set([
  'co.uk',
  'ac.uk',
  'gov.uk',
  'org.uk',
  'me.uk',
  'ltd.uk',
  'plc.uk',
  'net.uk',
  'sch.uk',
  'com.au',
  'net.au',
  'org.au',
  'edu.au',
  'gov.au',
  'id.au',
  'co.nz',
  'org.nz',
  'net.nz',
  'govt.nz',
  'ac.nz',
  'co.jp',
  'or.jp',
  'ne.jp',
  'ac.jp',
  'go.jp',
  'com.br',
  'net.br',
  'org.br',
  'gov.br',
  'co.in',
  'net.in',
  'org.in',
  'gov.in',
  'ac.in',
  'com.mx',
  'org.mx',
  'gob.mx',
  'co.za',
  'org.za',
  'gov.za',
  'ac.za',
  'com.sg',
  'com.hk',
  'com.tr',
  'com.ar',
  'com.cn',
  'com.tw',
  'co.kr',
  'co.il',
  'co.id',
  'com.my',
  'com.ph',
  'com.co',
  'com.pk',
  'co.ke',
  'com.ng',
  'co.th',
  'com.vn',
  'com.eg',
  'com.sa',
]);

/** Splits a host into its registrable name and public suffix, or null when the host is itself a
 *  suffix (or one label). */
function registrable(host: string): { name: string; suffix: string } | null {
  const labels = host.split('.');
  const two = labels.slice(-2).join('.');
  const n = TWO_LEVEL_SUFFIXES.has(two) ? 2 : 1;
  if (labels.length <= n) return null;
  return { name: labels[labels.length - n - 1], suffix: labels.slice(-n).join('.') };
}

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
  if (bare !== host && bare.includes('.')) host = bare;
  else if (bare !== host && TWO_LEVEL_SUFFIXES.has(bare)) return null;
  const parts = registrable(host);
  return parts ? `${parts.name}.${parts.suffix}` : null;
}

const FILLER_WORDS = new Set(['inc', 'llc', 'ltd', 'co', 'corp', 'company', 'the', 'group']);

/** The one word a careers-style site may add to the company's name (`metacareers.com`). */
const CAREERS_SUFFIXES = ['careers', 'jobs', 'hq', 'group', 'team', 'work'];

/** A name as lower-case letters and digits only, accents folded (é → e). */
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The spellings of a company's name a site may use: without Inc/LLC/Co/the and the like
 *  ("Acme Inc" → acme), or with only a leading "the" dropped ("The Acme Co" → acmeco). */
function nameForms(company: string): string[] {
  const words = fold(company)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const stripped = words.filter((w) => !FILLER_WORDS.has(w)).join('');
  const kept = (words[0] === 'the' ? words.slice(1) : words).join('');
  return stripped ? [...new Set([stripped, kept])] : [];
}

/** Long enough to mean something: 3 letters, or 2 when it holds a digit (3M). */
const longEnough = (name: string) => name.length >= 3 || (name.length === 2 && /\d/.test(name));

/** A posting's domain, used only when its registrable name IS the company's name (accents, spaces,
 *  punctuation and Inc/LLC-like words aside), or the name plus one careers word (metacareers.com).
 *  A name merely inside the other (talent.com for "Top Talent Welding") gives the letter. */
export function postingDomain(company: string, address: string | undefined | null): string | null {
  const domain = logoDomain(address);
  if (!domain) return null;
  const label = fold(registrable(domain)?.name ?? '').replace(/[^\p{L}\p{N}]/gu, '');
  const ok = nameForms(company).some(
    (name) =>
      longEnough(name) && (label === name || CAREERS_SUFFIXES.some((x) => label === name + x)),
  );
  return ok ? domain : null;
}

/** The domain for a company's mark: its own website (`sites`, any is trusted, first usable wins),
 *  else the first posting link whose domain carries the company's name. */
export function companyDomain(
  company: string,
  sites: (string | undefined | null)[] = [],
  postings: (string | undefined | null)[] = [],
): string | null {
  for (const a of sites) {
    const d = logoDomain(a);
    if (d) return d;
  }
  for (const a of postings) {
    const d = postingDomain(company, a);
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
