export interface Tile {
  name: string;
  meta: string;
  url: string;
}
export interface Group {
  id: string;
  label: string;
  tiles: Tile[];
  /** Seeded as an archived section. */
  archived?: boolean;
}

const t = (name: string, meta: string, url: string): Tile => ({ name, meta, url });

// Bake an entry-level / early-career filter into board search URLs.
export function entryLevelize(u: string): string {
  if (!u) return u;
  try {
    if (/indeed\.com\/jobs/i.test(u)) {
      if (/[?&]q=/.test(u) && !/[?&]sc=/.test(u)) u += '&sc=0kf%3Aexplvl(ENTRY_LEVEL)%3B';
    } else if (/linkedin\.com\/jobs/i.test(u)) {
      if (!/[?&]f_E=/.test(u)) u += (u.indexOf('?') > -1 ? '&' : '?') + 'f_E=2%2C3';
    } else if (/ziprecruiter\.com/i.test(u)) u = append(u, 'search', 'entry level');
    else if (/dice\.com/i.test(u)) u = append(u, 'q', 'entry level');
    else if (/google\.[a-z.]+\/search/i.test(u) && /ibp=htl/i.test(u))
      u = append(u, 'q', 'entry level');
  } catch {
    /* ignore */
  }
  return u;
}
function append(u: string, param: string, term: string): string {
  const re = new RegExp('([?&]' + param + '=)([^&]*)', 'i');
  const add = encodeURIComponent(' ' + term);
  if (re.test(u)) return u.replace(re, (_m, p, v) => (/entry/i.test(v) ? _m : p + v + add));
  return u + (u.indexOf('?') > -1 ? '&' : '?') + param + '=' + encodeURIComponent(term);
}

// Work mode + location drive every generated search (issue #58). Location is user-set — no more
// hard-coded place — and work-mode is a deliberate choice (there is NO remote default: remote
// roles draw far more applicants, so local/hybrid is often the better-odds filter).
export type WorkMode = 'any' | 'remote' | 'hybrid' | 'onsite';
export interface SearchLoc {
  /** City / state / region, e.g. "Denver, CO" or "United States". Blank = anywhere. */
  where: string;
  mode: WorkMode;
}
const encc = encodeURIComponent;
/** Hybrid as a keyword (#355), for a board with no hybrid filter of its own: Hybrid otherwise
 *  sent the place only, the same link as Any. On-site has no keyword: most on-site postings never
 *  say so, and the word would hide them. */
const hybridWord = (mode: WorkMode) => (mode === 'hybrid' ? ' hybrid' : '');
export interface Board {
  name: string;
  tag: string;
  build: (term: string, loc: SearchLoc) => string;
  /** The work modes it is shown for; left out, every mode. */
  modes?: readonly WorkMode[];
  /** The work modes besides Any its link narrows to (a filter or a keyword), so the row can say
   *  when it can't (#355). */
  filters: readonly WorkMode[];
}
export const BOARDS: Board[] = [
  {
    name: 'Indeed',
    tag: 'Aggregator',
    filters: ['remote', 'hybrid'],
    build: (term, { where, mode }) => {
      const l = mode === 'remote' ? 'Remote' : where.trim();
      return `https://www.indeed.com/jobs?q=${encc(term + hybridWord(mode))}${l ? `&l=${encc(l)}` : ''}`;
    },
  },
  {
    name: 'LinkedIn',
    tag: 'Aggregator',
    filters: ['remote', 'hybrid', 'onsite'],
    build: (term, { where, mode }) => {
      // f_WT: 1 = on-site, 2 = remote, 3 = hybrid; omit for "any".
      const wt =
        mode === 'remote'
          ? '&f_WT=2'
          : mode === 'hybrid'
            ? '&f_WT=3'
            : mode === 'onsite'
              ? '&f_WT=1'
              : '';
      const loc = mode === 'remote' ? where.trim() || 'United States' : where.trim();
      return `https://www.linkedin.com/jobs/search/?keywords=${encc(term)}${loc ? `&location=${encc(loc)}` : ''}${wt}`;
    },
  },
  {
    name: 'ZipRecruiter',
    tag: '1-click',
    filters: ['remote', 'hybrid'],
    build: (term, { where, mode }) => {
      const l = mode === 'remote' ? 'Remote' : where.trim();
      return `https://www.ziprecruiter.com/jobs-search?search=${encc(term + hybridWord(mode))}${l ? `&location=${encc(l)}` : ''}`;
    },
  },
  {
    name: 'Google Jobs',
    tag: 'Aggregator',
    filters: ['remote', 'hybrid'],
    build: (term, { where, mode }) => {
      const q =
        term +
        hybridWord(mode) +
        (mode === 'remote' ? ' remote' : where.trim() ? ` ${where.trim()}` : '');
      return `https://www.google.com/search?q=${encc(q)}&ibp=htl;jobs`;
    },
  },
  {
    name: 'Snagajob',
    tag: 'Hourly',
    filters: ['remote', 'hybrid'],
    build: (term, { where, mode }) => {
      const w = mode === 'remote' ? 'Remote' : where.trim();
      return `https://www.snagajob.com/search?q=${encc(term + hybridWord(mode))}${w ? `&w=${encc(w)}` : ''}`;
    },
  },
  {
    // Remote-only, so it shows for Remote and Any. A link out only: no API (its paid one needs a
    // personal key), no fetch, so CSP and legal.ts are unchanged. Its title filter takes one
    // title, so the link carries the first ticked one. The `jobTitle` + `sort` query is the form
    // its own search page uses (unverified live from here: the host was not reachable).
    name: 'Remote Rocketship',
    tag: 'Remote only',
    modes: ['remote', 'any'],
    filters: ['remote'],
    build: (term) => {
      // No title (an empty clause like `""`): the plain newest-first list, no jobTitle param.
      const quoted = [...term.matchAll(/"([^"]*)"/g)].map((m) => m[1].trim());
      const first = quoted.length ? (quoted.find(Boolean) ?? '') : term.trim();
      const base = 'https://www.remoterocketship.com/?sort=DateAdded';
      return first ? `${base}&jobTitle=${encc(first)}` : base;
    },
  },
];

const MODE_NAME: Record<WorkMode, string> = {
  any: 'Any',
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
};
/** "On-site not filtered" on a board row whose link can't narrow to the mode; else blank. */
export const modeNote = (b: Board, mode: WorkMode) =>
  mode === 'any' || b.filters.includes(mode) ? '' : `${MODE_NAME[mode]} not filtered`;

/** The big boards to show for a work mode. */
export const boardsFor = (mode: WorkMode) =>
  BOARDS.filter((b) => !b.modes || b.modes.includes(mode));

// ---- ATS hidden-jobs generator ----
export interface HiddenSite {
  name: string;
  domain: string;
  /** The Google `site:` clause — a host (with an optional path), or several ORed. Empty on a
   *  link-only row (`href`). */
  site: string;
  /** A plain link that bypasses Google (a members-only community, say). Such a row is never part
   *  of "Search all". */
  href?: string;
  /** One line under the name; defaults to the domain. */
  note?: string;
}
const site = (name: string, domain: string, path = ''): HiddenSite => ({
  name,
  domain,
  site: `site:${domain}${path}`,
});
/** A row whose clause is more than one host: a site restriction plus an `inurl:` or keyword. */
const clause = (name: string, domain: string, siteClause: string): HiddenSite => ({
  name,
  domain,
  site: siteClause,
});

/** Companies' own hiring systems, searched through Google — far less competition than the big
 *  aggregators. Most-used first: "Search all" fills Google's word limit in this order. */
export const ATS: HiddenSite[] = [
  {
    name: 'Greenhouse',
    domain: 'boards.greenhouse.io',
    site: '(site:boards.greenhouse.io OR site:job-boards.greenhouse.io)',
  },
  site('Lever', 'jobs.lever.co'),
  site('Ashby', 'jobs.ashbyhq.com'),
  site('Workday', 'myworkdayjobs.com'),
  site('SmartRecruiters', 'jobs.smartrecruiters.com'),
  site('Workable', 'apply.workable.com'),
  site('Recruitee', 'recruitee.com'),
  site('Teamtailor', 'teamtailor.com'),
  site('BambooHR', 'bamboohr.com'),
  site('Rippling', 'ats.rippling.com'),
  site('Pinpoint', 'pinpointhq.com'),
  site('Breezy HR', 'breezy.hr'),
  site('Gem', 'jobs.gem.com'),
  site('Dover', 'app.dover.com'),
  site('Jobvite', 'jobs.jobvite.com'),
  // Tenants are careers-<name>.icims.com, so the bare host.
  clause('iCIMS', 'icims.com', 'site:icims.com inurl:jobs'),
  site('JazzHR', 'applytojob.com'),
  site('Personio', 'jobs.personio.com'),
  // Large per-tenant systems (docs/specs/discovery-methods.md, method 6): Google only. Their
  // endpoints are undocumented, POST-only or CORS-closed, so the app never fetches them.
  clause(
    'SuccessFactors',
    'successfactors.com',
    '(site:successfactors.com OR site:successfactors.eu) inurl:career',
  ),
  clause('Taleo', 'taleo.net', 'site:taleo.net inurl:careersection'),
  clause('Oracle Recruiting', 'oraclecloud.com', 'site:oraclecloud.com inurl:CandidateExperience'),
];

/** Freelance, startup and remote boards with no open API (or one this app can't call from the
 *  browser): Google is the way in. */
export const HIDDEN_BOARDS: HiddenSite[] = [
  site('Upwork', 'upwork.com'),
  site('Contra', 'contra.com'),
  site('Wellfound', 'wellfound.com'),
  site('YC Work at a Startup', 'workatastartup.com'),
  site('Remote OK', 'remoteok.com'),
  site('Himalayas', 'himalayas.app'),
  site('Jobicy', 'jobicy.com'),
  site('We Work Remotely', 'weworkremotely.com'),
  site('Working Not Working', 'workingnotworking.com'),
  site('Dribbble Jobs', 'dribbble.com', '/jobs'),
  // Design-systems community boards (method 5). None has an API; every host is unverified from
  // the build sandbox, so check each once in a browser.
  site('Smashing Jobs', 'smashingmagazine.com', '/jobs'),
  clause('Design Systems Jobs', 'designsystems.com', 'site:designsystems.com jobs'),
  site('Into Design Systems', 'intodesignsystems.com'),
  site('Authentic Jobs', 'authenticjobs.com'),
  site('Dynamite Jobs', 'dynamitejobs.com'),
  {
    // The Slack is members only and not indexed, so there is no site clause: a plain link.
    name: 'Join Design Systems Slack',
    domain: 'designsystems.com',
    site: '',
    href: 'https://www.google.com/search?q=join+design+systems+slack+community',
    note: 'Members only; its jobs channel is not searchable',
  },
];

/** "Contract only": the words contract and fractional postings use. */
export const CONTRACT_CLAUSE = '(contract OR freelance OR fractional)';

export interface HiddenQuery {
  role: string;
  /** Several roles searched at once, ORed (the wide sweep, #213). Overrides `role` when 2+. */
  roles?: string[];
  entry?: boolean;
  where: string;
  mode: WorkMode;
  recency?: '' | 'w' | 'm';
  contract?: boolean;
}

/** One quoted title, or several ORed: ("a" OR "b"). A stray quote would end the phrase early, so
 *  quotes go; blank and repeated titles only cost words against Google's cap, so they go too. */
export function titleClause(titles: string[]): string {
  const seen = new Set<string>();
  const q: string[] = [];
  for (const raw of titles) {
    const t = raw.replace(/"/g, '').replace(/\s+/g, ' ').trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    q.push(`"${t}"`);
  }
  return q.length > 1 ? `(${q.join(' OR ')})` : (q[0] ?? '""');
}

function queryTail({ role, roles, entry, where, mode, contract }: HiddenQuery): string {
  const w = where.trim();
  return [
    titleClause(roles && roles.length > 0 ? roles : [role]),
    entry ? '(entry OR junior OR associate)' : '',
    mode === 'remote' ? 'remote' : w ? `"${w}"` : '',
    // #355: Hybrid narrows by keyword, after the place; the 32-word fit counts it.
    mode === 'hybrid' ? 'hybrid' : '',
    contract ? CONTRACT_CLAUSE : '',
  ]
    .filter(Boolean)
    .join(' ');
}

const googleUrl = (query: string, recency?: string) =>
  `https://www.google.com/search?q=${encc(query)}${recency ? '&tbs=qdr:' + recency : ''}`;

/** Google ignores everything after a query's 32nd word. */
const GOOGLE_MAX_WORDS = 32;
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Drop the last ORed titles until `fits` holds (or one is left): the place and Contract only
 *  come after the titles, so a query past the cap would lose them first. */
function fitRoles(o: HiddenQuery, fits: (o: HiddenQuery) => boolean): HiddenQuery {
  let fit = o;
  while (fit.roles && fit.roles.length > 1 && !fits(fit))
    fit = { ...fit, roles: fit.roles.slice(0, -1) };
  return fit;
}

export function atsSearchUrl(siteClause: string, o: HiddenQuery): string {
  const fit = fitRoles(o, (f) => words(`${siteClause} ${queryTail(f)}`) <= GOOGLE_MAX_WORDS);
  return googleUrl(`${siteClause} ${queryTail(fit)}`, o.recency);
}

/** As many of `sites` as fit in one query, in order, ORed together. */
function fitSites(sites: HiddenSite[], o: HiddenQuery): string[] {
  const tail = queryTail(o);
  const picked: string[] = [];
  for (const s of sites) {
    if (!s.site) continue; // a link-only row has nothing to search
    const next = `(${[...picked, s.site].join(' OR ')}) ${tail}`;
    if (words(next) > GOOGLE_MAX_WORDS) break;
    picked.push(s.site);
  }
  return picked;
}

/** The query with its last titles dropped until at least `min` of `sites` fit in one search. */
export const fitQuery = (sites: HiddenSite[], o: HiddenQuery, min = 1): HiddenQuery =>
  fitRoles(o, (f) => fitSites(sites, f).length >= min);

/** Titles trimmed until at least one site fits, so Search all never searches an empty group. */
const fitAll = (sites: HiddenSite[], o: HiddenQuery) => fitQuery(sites, o);

export function searchAllUrl(sites: HiddenSite[], o: HiddenQuery): string {
  const fit = fitAll(sites, o);
  return googleUrl(`(${fitSites(sites, fit).join(' OR ')}) ${queryTail(fit)}`, o.recency);
}

/** How many sites `searchAllUrl` fits — shown on its button. */
export function searchAllCount(sites: HiddenSite[], o: HiddenQuery): number {
  return fitSites(sites, fitAll(sites, o)).length;
}

// ---- Curated groups: design systems only (Adrian 2026-10-29; src/dsOnly.test.ts) ----
export const GROUPS: Group[] = [
  {
    // Design Systems "Apply now": remote design-systems roles. Board rule holds: live remote
    // searches + ATS Google-dorks (the low-competition hidden-jobs angle), no one-off postings.
    id: 'ds-brief',
    label: 'Apply now',
    tiles: [
      t(
        'designsystems.jobs',
        'Job board just for design-systems roles · check weekly',
        'https://designsystems.jobs/',
      ),
      t(
        'Into Design Systems · jobs',
        'Design-systems job board · filter for AI-skilled roles',
        'https://jobs.intodesignsystems.com/',
      ),
      t(
        'Wellfound · Design Systems',
        'Startup roles · search "design systems", filter remote',
        'https://wellfound.com/jobs',
      ),
      t(
        'Welcome to the Jungle · Design Systems',
        'Curated tech roles (formerly Otta) · search design systems',
        'https://www.welcometothejungle.com/en/jobs?query=design%20systems',
      ),
      t(
        'LinkedIn · Design Systems (Contract)',
        'Contract and fractional design-systems roles, remote',
        'https://www.linkedin.com/jobs/search/?keywords=design%20systems&location=United%20States&f_WT=2&f_JT=C',
      ),
      t(
        'Contra · Design Systems',
        'Freelance / fractional projects · search design systems',
        'https://contra.com/',
      ),
      t(
        'LinkedIn · Design Systems (Remote)',
        'Live remote design-systems roles',
        'https://www.linkedin.com/jobs/search/?keywords=design%20systems%20engineer&location=United%20States&f_WT=2',
      ),
      t(
        'Indeed · Design Systems (Remote)',
        'All live remote design-systems postings',
        'https://www.indeed.com/jobs?q=design+systems+engineer&l=Remote',
      ),
      t(
        'Google Jobs · Design Systems (Remote)',
        'Aggregated remote design-systems roles',
        'https://www.google.com/search?q=design+systems+engineer+remote&ibp=htl;jobs',
      ),
      t(
        'Greenhouse · Design Systems (hidden jobs)',
        'Google-dork into Greenhouse boards · less competition',
        'https://www.google.com/search?q=%28site%3Aboards.greenhouse.io+OR+site%3Ajob-boards.greenhouse.io%29+%22design+systems%22+remote',
      ),
      t(
        'Lever · Design Systems (hidden jobs)',
        'Google-dork into Lever boards · less competition',
        'https://www.google.com/search?q=site%3Ajobs.lever.co+%22design+systems%22+remote',
      ),
      t(
        'Ashby · Design Systems (hidden jobs)',
        'Google-dork into Ashby boards · less competition',
        'https://www.google.com/search?q=site%3Ajobs.ashbyhq.com+%22design+systems%22+remote',
      ),
    ],
  },
  {
    // Design Systems watched companies: their public job boards (Lever / Greenhouse / Ashby), which
    // the Live postings feed pulls live, so a new design-systems opening shows up there. Durable
    // board pages, not one-off postings. From Adrian's 2026-10 shortlist; on 2026-10-13 none of the
    // three listed a design-systems role (the shortlisted postings had closed).
    id: 'ds-watch',
    label: 'Watched companies',
    tiles: [
      t(
        'Deputy · jobs',
        'Lever board · design technologist / DS engineer roles',
        'https://jobs.lever.co/deputy',
      ),
      t(
        'Instacart · jobs',
        'Greenhouse board · design-systems technologist roles',
        'https://boards.greenhouse.io/instacart',
      ),
      t(
        'Cambly · jobs',
        'Ashby board · contract design-systems roles',
        'https://jobs.ashbyhq.com/cambly',
      ),
      t(
        'Rocket Money · jobs',
        'Greenhouse board · design-systems engineering (remote US)',
        'https://job-boards.greenhouse.io/truebill',
      ),
      t(
        'Vanta · jobs',
        'Ashby board · design-systems and systems-design roles (remote US)',
        'https://jobs.ashbyhq.com/vanta',
      ),
      t(
        'Stripe · jobs',
        'Greenhouse board · design engineering and design systems',
        'https://boards.greenhouse.io/stripe',
      ),
      t(
        'Ramp · jobs',
        'Ashby board · Design Systems Lead + design engineering (remote)',
        'https://jobs.ashbyhq.com/ramp',
      ),
      t(
        'Vercel · jobs',
        'Greenhouse board · Design engineering (remote US)',
        'https://boards.greenhouse.io/vercel',
      ),
      t(
        'Mixpanel · jobs',
        'Greenhouse board · Staff design engineering (remote)',
        'https://boards.greenhouse.io/mixpanel',
      ),
      t(
        'Linear · jobs',
        'Ashby board · Design engineering (North America remote)',
        'https://jobs.ashbyhq.com/linear',
      ),
      t('Replit · jobs', 'Ashby board · Design engineering', 'https://jobs.ashbyhq.com/replit'),
      t(
        'Gusto · jobs',
        'Greenhouse board · Design-systems product design (hybrid)',
        'https://boards.greenhouse.io/gusto',
      ),
      t(
        'Discord · jobs',
        'Greenhouse board · Design-systems product design',
        'https://boards.greenhouse.io/discord',
      ),
      t(
        'Datadog · jobs',
        'Greenhouse board · Design-systems leadership',
        'https://boards.greenhouse.io/datadog',
      ),
      t(
        'Faire · jobs',
        'Greenhouse board · Design-systems frontend engineering',
        'https://boards.greenhouse.io/faire',
      ),
      t('Okta · jobs', 'Greenhouse board · UI Platform team', 'https://boards.greenhouse.io/okta'),
      t(
        'Cloudflare · jobs',
        'Greenhouse board · Design engineering',
        'https://boards.greenhouse.io/cloudflare',
      ),
      t(
        'Samsara · jobs',
        'Greenhouse board · Product design engineering',
        'https://boards.greenhouse.io/samsara',
      ),
    ],
  },
];
