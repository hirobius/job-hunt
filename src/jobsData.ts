export interface Tile {
  name: string;
  meta: string;
  url: string;
}
export interface Group {
  id: string;
  label: string;
  tiles: Tile[];
  /** Stashed under the "Archived" disclosure at the bottom of the board (issue: trades pivot).
   *  Kept for reference, but out of the way so hands-on trades lead. */
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

// ---- Title search generator ----
export const TITLES = [
  'Sheet Metal Mechanic',
  'Sheet Metal Worker',
  'Sheet Metal Fabricator',
  'Metal Fabricator',
  'Welder-Fabricator',
  'Fabricator',
  'MIG Welder',
  'TIG Welder',
  'Structural Welder',
  'Press Brake Operator',
  'CNC Machinist',
  'Machine Operator',
];
// Work mode + location drive every generated search (issue #58). Location is user-set — no more
// hard-coded Spokane — and work-mode is a deliberate choice (there is NO remote default: remote
// roles draw far more applicants, so local/hybrid is often the better-odds filter).
export type WorkMode = 'any' | 'remote' | 'hybrid' | 'onsite';
export interface SearchLoc {
  /** City / state / region, e.g. "Spokane, WA" or "United States". Blank = anywhere. */
  where: string;
  mode: WorkMode;
}
const encc = encodeURIComponent;
export const BOARDS: {
  name: string;
  tag: string;
  build: (term: string, loc: SearchLoc) => string;
  /** The work modes it is shown for; left out, every mode. */
  modes?: readonly WorkMode[];
}[] = [
  {
    name: 'Indeed',
    tag: 'Aggregator',
    build: (term, { where, mode }) => {
      const l = mode === 'remote' ? 'Remote' : where.trim();
      return `https://www.indeed.com/jobs?q=${encc(term)}${l ? `&l=${encc(l)}` : ''}`;
    },
  },
  {
    name: 'LinkedIn',
    tag: 'Aggregator',
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
    build: (term, { where, mode }) => {
      const l = mode === 'remote' ? 'Remote' : where.trim();
      return `https://www.ziprecruiter.com/jobs-search?search=${encc(term)}${l ? `&location=${encc(l)}` : ''}`;
    },
  },
  {
    name: 'Google Jobs',
    tag: 'Aggregator',
    build: (term, { where, mode }) => {
      const q = term + (mode === 'remote' ? ' remote' : where.trim() ? ` ${where.trim()}` : '');
      return `https://www.google.com/search?q=${encc(q)}&ibp=htl;jobs`;
    },
  },
  {
    name: 'Snagajob',
    tag: 'Hourly',
    build: (term, { where, mode }) => {
      const w = mode === 'remote' ? 'Remote' : where.trim();
      return `https://www.snagajob.com/search?q=${encc(term)}${w ? `&w=${encc(w)}` : ''}`;
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
    build: (term) => {
      // No title (an empty clause like `""`): the plain newest-first list, no jobTitle param.
      const quoted = [...term.matchAll(/"([^"]*)"/g)].map((m) => m[1].trim());
      const first = quoted.length ? (quoted.find(Boolean) ?? '') : term.trim();
      const base = 'https://www.remoterocketship.com/?sort=DateAdded';
      return first ? `${base}&jobTitle=${encc(first)}` : base;
    },
  },
];

/** The big boards to show for a work mode. */
export const boardsFor = (mode: WorkMode) =>
  BOARDS.filter((b) => !b.modes || b.modes.includes(mode));

// ---- ATS hidden-jobs generator ----
export const ATS_ROLES = [
  'sheet metal',
  'fabricator',
  'welder',
  'metal fabrication',
  'machine operator',
  'CNC machinist',
];
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

/** One quoted title, or several ORed: ("a" OR "b"). */
export function titleClause(titles: string[]): string {
  const q = titles.map((t) => `"${t.trim()}"`);
  return q.length > 1 ? `(${q.join(' OR ')})` : (q[0] ?? '""');
}

function queryTail({ role, roles, entry, where, mode, contract }: HiddenQuery): string {
  const w = where.trim();
  return [
    titleClause(roles && roles.length > 1 ? roles : [role]),
    entry ? '(entry OR junior OR associate)' : '',
    mode === 'remote' ? 'remote' : w ? `"${w}"` : '',
    contract ? CONTRACT_CLAUSE : '',
  ]
    .filter(Boolean)
    .join(' ');
}

const googleUrl = (query: string, recency?: string) =>
  `https://www.google.com/search?q=${encc(query)}${recency ? '&tbs=qdr:' + recency : ''}`;

export const atsSearchUrl = (siteClause: string, o: HiddenQuery) =>
  googleUrl(`${siteClause} ${queryTail(o)}`, o.recency);

/** Google ignores everything after a query's 32nd word. */
const GOOGLE_MAX_WORDS = 32;
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

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

export function searchAllUrl(sites: HiddenSite[], o: HiddenQuery): string {
  return googleUrl(`(${fitSites(sites, o).join(' OR ')}) ${queryTail(o)}`, o.recency);
}

/** How many sites `searchAllUrl` fits — shown on its button. */
export function searchAllCount(sites: HiddenSite[], o: HiddenQuery): number {
  return fitSites(sites, o).length;
}

// ---- Curated groups ----
export const GROUPS: Group[] = [
  {
    // Design Systems "Apply Now" — the parallel (non-trades) track: remote design-systems /
    // design-engineering roles. Board rule holds: live remote searches + ATS Google-dorks
    // (the low-competition hidden-jobs angle), no one-off postings. Remote by construction,
    // so it sidesteps the Spokane-locked Title-search BOARDS.
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
        'We Work Remotely · Design',
        'Remote-only design and frontend roles',
        'https://weworkremotely.com/categories/remote-design-jobs',
      ),
      t(
        'LinkedIn · Design Systems (Remote)',
        'Live remote design-systems / design-engineer roles',
        'https://www.linkedin.com/jobs/search/?keywords=design%20systems%20engineer&location=United%20States&f_WT=2',
      ),
      t(
        'Indeed · Design Systems (Remote)',
        'All live remote design-systems postings',
        'https://www.indeed.com/jobs?q=design+systems+engineer&l=Remote',
      ),
      t(
        'Google Jobs · Design Engineer (Remote)',
        'Aggregated remote design-engineer roles',
        'https://www.google.com/search?q=design+systems+engineer+remote&ibp=htl;jobs',
      ),
      t(
        'Greenhouse · Design Systems (hidden jobs)',
        'Google-dork into Greenhouse boards · less competition',
        'https://www.google.com/search?q=%28site%3Aboards.greenhouse.io+OR+site%3Ajob-boards.greenhouse.io%29+%22design+systems%22+remote',
      ),
      t(
        'Lever · Design Engineer (hidden jobs)',
        'Google-dork into Lever boards · less competition',
        'https://www.google.com/search?q=site%3Ajobs.lever.co+%22design+engineer%22+remote',
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
  {
    // Implementation Consulting "Apply Now" — the other parallel (non-trades) track: software
    // implementation / onboarding / professional-services roles, generalist across ecosystems.
    // Curates BOTH remote and local live searches (the local ones follow the track's location when
    // seeded, curation/localize.ts), plus
    // ATS Google-dorks for the low-competition hidden-jobs angle. Board rule holds: live
    // searches + durable dorks only, no one-off postings.
    id: 'ic-brief',
    label: 'Apply now',
    tiles: [
      t(
        'LinkedIn · Implementation Consultant (Remote)',
        'Live remote implementation / onboarding roles',
        'https://www.linkedin.com/jobs/search/?keywords=implementation%20consultant&location=United%20States&f_WT=2',
      ),
      t(
        'Indeed · Implementation Consultant (Remote)',
        'All live remote implementation postings',
        'https://www.indeed.com/jobs?q=implementation+consultant&l=Remote',
      ),
      t(
        'Google Jobs · Implementation Specialist (Remote)',
        'Aggregated remote implementation / onboarding roles',
        'https://www.google.com/search?q=implementation+specialist+remote&ibp=htl;jobs',
      ),
      t(
        'LinkedIn · Implementation (Spokane)',
        'Local / hybrid implementation & solutions-consultant roles',
        'https://www.linkedin.com/jobs/search/?keywords=implementation%20consultant&location=Spokane%2C%20Washington',
      ),
      t(
        'Indeed · Implementation / Onboarding (Spokane)',
        'Live local implementation & onboarding postings',
        'https://www.indeed.com/jobs?q=implementation+OR+%22onboarding+specialist%22&l=Spokane%2C+WA',
      ),
      t(
        'Greenhouse · Implementation Consultant (hidden jobs)',
        'Google-dork into Greenhouse boards · less competition',
        'https://www.google.com/search?q=%28site%3Aboards.greenhouse.io+OR+site%3Ajob-boards.greenhouse.io%29+%22implementation+consultant%22+remote',
      ),
      t(
        'Lever · Implementation / Solutions (hidden jobs)',
        'Google-dork into Lever boards · less competition',
        'https://www.google.com/search?q=site%3Ajobs.lever.co+%22implementation+consultant%22+remote',
      ),
      t(
        'Ashby · Implementation (hidden jobs)',
        'Google-dork into Ashby boards · less competition',
        'https://www.google.com/search?q=site%3Ajobs.ashbyhq.com+%22implementation%22+remote',
      ),
      t(
        'Workday · Professional Services (hidden jobs)',
        'Google-dork into Workday boards · less competition',
        'https://www.google.com/search?q=site%3Amyworkdayjobs.com+%22professional+services+consultant%22+remote',
      ),
    ],
  },
  {
    // ServiceNow "Apply Now" — a platform-specific implementation track (developer / admin /
    // consultant / architect across the ServiceNow ecosystem). Remote-forward. Board rule holds:
    // live remote searches + the ServiceNow vendor careers page + a durable pure-play partner +
    // ATS Google-dorks (the low-competition hidden-jobs angle), no one-off postings.
    id: 'sn-brief',
    label: 'Apply now',
    tiles: [
      t(
        'LinkedIn · ServiceNow (Remote)',
        'Live remote ServiceNow developer / admin / consultant roles',
        'https://www.linkedin.com/jobs/search/?keywords=servicenow&location=United%20States&f_WT=2',
      ),
      t(
        'Indeed · ServiceNow (Remote)',
        'All live remote ServiceNow postings',
        'https://www.indeed.com/jobs?q=servicenow&l=Remote',
      ),
      t(
        'Google Jobs · ServiceNow Developer (Remote)',
        'Aggregated remote ServiceNow developer / consultant roles',
        'https://www.google.com/search?q=servicenow+developer+remote&ibp=htl;jobs',
      ),
      t(
        'ServiceNow · Careers (the platform vendor)',
        'ServiceNow itself hires remote — implementation, PS & platform roles',
        'https://careers.servicenow.com/en/jobs/',
      ),
      t(
        'GlideFast · ServiceNow Partner (careers)',
        'Pure-play ServiceNow Elite partner · remote implementation consultants',
        'https://www.glidefast.com/careers/',
      ),
      t(
        'Greenhouse · ServiceNow (hidden jobs)',
        'Google-dork into Greenhouse boards · less competition',
        'https://www.google.com/search?q=%28site%3Aboards.greenhouse.io+OR+site%3Ajob-boards.greenhouse.io%29+%22servicenow%22+remote',
      ),
      t(
        'Lever · ServiceNow (hidden jobs)',
        'Google-dork into Lever boards · less competition',
        'https://www.google.com/search?q=site%3Ajobs.lever.co+%22servicenow%22+remote',
      ),
      t(
        'Ashby · ServiceNow (hidden jobs)',
        'Google-dork into Ashby boards · less competition',
        'https://www.google.com/search?q=site%3Ajobs.ashbyhq.com+%22servicenow%22+remote',
      ),
      t(
        'Workday · ServiceNow at SIs (hidden jobs)',
        'Google-dork into Workday boards (big system integrators) · less competition',
        'https://www.google.com/search?q=site%3Amyworkdayjobs.com+%22servicenow%22+remote',
      ),
    ],
  },
  {
    // Sheet-metal & fab "Apply Now" — durable Spokane-area employer pages that hire and
    // train on the bench. Board rule holds: careers pages + 1-click local searches, no
    // one-off postings.
    id: 'sm-brief',
    label: 'Apply now',
    tiles: [
      t(
        'SMART Local 55 — Sheet Metal',
        'Sheet metal / HVAC apprenticeship · paid day one · 509-928-5009',
        'https://smw55.org/apprenticeship/',
      ),
      t(
        'Haakon Industries (Cheney)',
        'Custom air-handling mfg · robotic sheet metal / weld · entry base-frame builder · 4-day week',
        'https://haakon.com/about-us/careers/',
      ),
      t(
        'Colmac Coil (Colville)',
        'Heat-exchanger mfg · sheet-metal assembly + TIG · trains beginners · ~$17.66–22/hr',
        'https://www.colmaccoil.com/joinourteam.aspx',
      ),
      t(
        'Wagstaff Inc (Spokane Valley)',
        'TIG fabrication · swing shift · entry training',
        'https://www.wagstaff.com/careers/',
      ),
      t(
        'SteelFab Inc',
        'MIG/TIG welders & fitters · entry OK, they train · 509-747-4139',
        'https://www.steelfab-inc.com/careers/',
      ),
      t(
        'Hydrafab Northwest',
        'Custom fab / prototyping · welder-fab, machine operator, laborer · 509-535-0075',
        'https://www.hydrafabnw.com/',
      ),
      t(
        'Keytronic (Spokane Valley)',
        'Precision electronics mfg + assembly · machinist / production apprentice paths · 509-928-8000',
        'https://www.keytronic.com/company/careers/',
      ),
      t(
        'Hewescraft (Colville)',
        'Welded-aluminum boats · entry Fabricator Helper ~$17/hr, will train (MIG/TIG Al) · full benefits',
        'https://hewescraft.com/careers/',
      ),
      t(
        'ZipRecruiter · Sheet metal (Spokane)',
        '1-click apply · entry sheet-metal / fab roles',
        'https://www.ziprecruiter.com/jobs-search?search=sheet+metal&location=Spokane%2C+WA',
      ),
      t(
        'Indeed · Fabricator (Spokane)',
        'All live fab + sheet-metal postings',
        'https://www.indeed.com/jobs?q=fabricator+OR+%22sheet+metal%22&l=Spokane%2C+WA',
      ),
    ],
  },
  {
    // Welding & machining "Apply Now" — shops that run welders and CNC/machine operators.
    id: 'weld-brief',
    label: 'Apply now',
    tiles: [
      t(
        'Travis Pattern & Foundry',
        'Al / bronze / iron casting + pattern shop · entry molder / grinder, will train · ~$20–26/hr · hr@travispattern.com · 509-466-3545',
        'https://www.travispattern.com/careers',
      ),
      t(
        'voestalpine Nortrak',
        'Prestressed concrete rail ties + steel trackwork · entry Machine Operator I $22.50–24.70/hr · tuition assist',
        'https://www.voestalpine.com/nortrak/en/careers/Jobs',
      ),
      t(
        'MetalQuest Unlimited (Post Falls)',
        'Precision CNC shop (AS9100D) · entry CNC operator, they train',
        'https://www.metalquest.net/careers',
      ),
      t(
        'ASC Machine Tools (Spokane Valley)',
        'Coil-processing equipment mfg · welders / fabricators',
        'https://www.ascmt.com/',
      ),
      t(
        'Western States Cat — Tech Academy',
        '~10-mo diesel tech (8-mo class + paid internship) · Spokane / Liberty Lake',
        'https://www.westernstatescat.com/tech-academy/',
      ),
      t(
        'Machinists Institute / NWMAC',
        'WSATC-registered machinist apprenticeship · 2000 OJT hrs/yr + evening RSI · Spokane · also welding courses',
        'https://www.machinistsinstitute.org/apprenticeship-programs',
      ),
      t(
        'Northwest Steel Fab (Deer Park)',
        'AISC structural-steel fab · great for new welders, will train · day + swing · 509-276-1592',
        'https://nwsfab.com/',
      ),
      t(
        'ZipRecruiter · Welder no experience (Spokane)',
        '1-click apply · entry welding',
        'https://www.ziprecruiter.com/jobs-search?search=welder+no+experience&location=Spokane%2C+WA',
      ),
      t(
        'Indeed · Welder / machinist (Spokane)',
        'All live Spokane welding + machining postings',
        'https://www.indeed.com/jobs?q=welder+OR+machinist&l=Spokane%2C+WA',
      ),
    ],
  },
  {
    // Construction-trades "Apply Now" — union JATCs + non-union portals that pay from day one.
    id: 'const-brief',
    label: 'Apply now',
    tiles: [
      t(
        'Ironworkers Local 14',
        'Structural / reinforcing iron · open year-round online · DD-214 = experience credit',
        'https://iw14appr.org/',
      ),
      t(
        'Operating Engineers IUOE 302',
        'Heavy-equipment operator · online application window — confirm the current deadline on the live page',
        'https://oetraining.unionimpact.com/',
      ),
      t(
        'Laborers — NW LETT (Local 238)',
        'Rolling / phone intake · no upfront skills · free training, housing & meals',
        'https://www.nwlett.edu/about-us/apprenticeship/',
      ),
      t(
        'Cement Masons & Plasterers — sign up',
        'Registered plasterer / cement-mason apprenticeship · 6400 OJT hrs · admin@trowelout.org',
        'https://www.cmpltraining.org/signup',
      ),
      t(
        'Inland NW AGC JATC',
        'Carpenter · Laborer · Heavy Equipment Operator · Spokane Valley · year-round',
        'https://nwagcapprenticeship.org/apply-today/',
      ),
      t(
        'CITC Eastern WA',
        'Electrical · HVAC · Plumbing · Carpentry · Sheet Metal · non-union · year-round',
        'https://citcwa.org/apprenticeship/',
      ),
      t(
        'Apollo Mechanical — HVAC Apprentice',
        'Spokane Valley contractor · $25–40/hr · hires apprentices on a rolling basis',
        'https://careers.apollomech.com/',
      ),
      t(
        'Helmets to Hardhats',
        'Free · veteran direct-entry into registered building trades (some skip the waitlist)',
        'https://helmetstohardhats.org/',
      ),
      t(
        'Indeed · Apprentice (Spokane)',
        'Every Spokane apprentice posting, live',
        'https://www.indeed.com/jobs?q=apprentice&l=Spokane%2C+WA',
      ),
    ],
  },
  {
    id: 'income',
    label: 'Quick Income',
    tiles: [
      t('Instawork', 'Same-day shifts · paid fast', 'https://www.instawork.com/'),
      t(
        'Veryable',
        'On-demand labor / light-industrial ops · Spokane',
        'https://www.veryableops.com/',
      ),
      t('Wonolo', 'Next-day gig work · no interview', 'https://www.wonolo.com/find-work'),
      t('PeopleReady', 'Temp / same-day-pay labor', 'https://www.peopleready.com/job-seekers/'),
      t(
        'Craigslist · Labor Gigs (Spokane)',
        'Cash, often same-day',
        'https://spokane.craigslist.org/search/lbg',
      ),
      t(
        'Craigslist · All Gigs (Spokane)',
        'Quick-cash gigs',
        'https://spokane.craigslist.org/search/ggg',
      ),
      t(
        'DoorDash (Dasher)',
        'Gig delivery · start this week · own hours',
        'https://dasher.doordash.com/en-us',
      ),
      t('Uber Driver', 'Rideshare/delivery · fast onboarding', 'https://www.uber.com/us/en/drive/'),
      t('Amazon Flex', 'Package-delivery blocks · Spokane', 'https://flex.amazon.com/'),
    ],
  },
  {
    id: 'hirenow',
    label: 'Hire Now',
    tiles: [
      t(
        'Indeed · Hiring Immediately (Spokane)',
        'Posted ≤3 days',
        'https://www.indeed.com/jobs?q=hiring+immediately&l=Spokane%2C+WA&fromage=3',
      ),
      t(
        'Indeed · Warehouse (Spokane)',
        'Low-barrier · ≤7 days',
        'https://www.indeed.com/jobs?q=warehouse&l=Spokane%2C+WA&fromage=7',
      ),
      t(
        'Kaiser Aluminum (Trentwood)',
        'Industrial trades & maintenance openings',
        'https://www.google.com/search?q=Kaiser+Aluminum+Trentwood+Spokane+careers',
      ),
      t(
        'Amazon · Spokane Warehouse',
        'Hiring now · hourly',
        'https://www.amazon.jobs/en/search?base_query=warehouse&loc_query=Spokane%2C+WA',
      ),
      t('UPS Package Handler', 'Warehouse · benefits early', 'https://www.jobs-ups.com/'),
      t('Costco · Spokane', 'Hourly · strong pay/benefits', 'https://www.costco.com/jobs.html'),
      t(
        'URM / Rosauers (Spokane)',
        'Local grocery + distribution',
        'https://www.google.com/search?q=URM+Rosauers+Spokane+WA+careers',
      ),
      t(
        'Snagajob · Spokane',
        'Hourly, fast-apply',
        'https://www.snagajob.com/search?q=&w=Spokane%2C+WA',
      ),
      t(
        'Craigslist · All Jobs (Spokane)',
        'Local hiring, all categories',
        'https://spokane.craigslist.org/search/jjj',
      ),
    ],
  },
  {
    id: 'smshops',
    label: 'Sheet Metal & Fab Shops',
    tiles: [
      t(
        'Still Waters Metal Fab',
        'Welders & fitters · entry openings · Spokane Valley',
        'https://www.stillwatersmf.com/',
      ),
      t(
        'Fabtech Inc',
        'Structural steel fab · welders & fitters · will train · Spokane Valley',
        'https://www.fabtech1.us/',
      ),
      t(
        'Spokane Stainless Technologies',
        'Metal fab · forming / shearing · $18–22/hr · training',
        'https://www.spokanestainless.com/',
      ),
      t(
        'Sytech Inc',
        'Precision stainless fab · gas / electric welding · training',
        'https://sytechprecision.com/',
      ),
      t(
        'NIC Global',
        'Sheet metal fab & mechanical assembly · entry $18/hr · training',
        'https://www.google.com/search?q=NIC+Global+Spokane+production+jobs',
      ),
      t(
        'Phillips Tank & Structure',
        'Steel tank / structural fab · welders & fitters · will train',
        'https://phillipstankandstructure.applytojob.com/',
      ),
      t(
        'Buck Knives (Post Falls)',
        'Entry Prep I Fabricator ~$17/hr · sheet-metal / blade prep, they train · full benefits',
        'https://www.buckknives.com/',
      ),
      t(
        'Indeed · Will-train welder (Spokane)',
        'Entry / no-experience welding roles',
        'https://www.indeed.com/jobs?q=welder+%22no+experience%22&l=Spokane%2C+WA',
      ),
    ],
  },
  {
    id: 'machineshops',
    label: 'Machining & CNC',
    tiles: [
      t(
        'Altek (Spokane)',
        'Precision metal fab / CNC machining · aerospace / medical / defense · entry tech roles',
        'https://www.google.com/search?q=Altek+Spokane+machining+fabrication+jobs',
      ),
      t(
        'Harris & Bruno International (Post Falls)',
        'In-house fab / assembly of printing equipment · CNC lathe machinist / fab',
        'https://www.harris-bruno.com/',
      ),
      t(
        'Ground Force Worldwide (Post Falls)',
        'Heavy mining-equipment fab · $24–29/hr · multi-position wire-feed',
        'https://www.gfworldwide.com/',
      ),
      t(
        'Crux Subsurface',
        'Welder / fabricator roles · entry considered · Spokane Valley',
        'https://www.cruxsub.com/careers',
      ),
      t(
        'AJAC — Aerospace Joint Apprenticeship',
        'WA mfg apprenticeships (machinist, maintenance) · get hired first',
        'https://www.ajactraining.org/',
      ),
      t(
        'Perry Tech — trades job board',
        'Free welding / fab / machinist openings (American Alloy, CONTECH, Travis Pattern, Kaiser)',
        'https://www.perrytech.edu/alumni/jobs/',
      ),
      t(
        'Indeed · CNC machinist (Spokane)',
        'Live CNC + machine-operator postings',
        'https://www.indeed.com/jobs?q=CNC+OR+machinist&l=Spokane%2C+WA',
      ),
    ],
  },
  {
    id: 'unions',
    label: 'Union Trades (JATCs)',
    tiles: [
      t(
        'UA Local 44 — Plumbers & Steamfitters',
        'Window-based (typically May & Nov) · confirm the next application date on the live page · in-person pickup',
        'https://ua44.org/',
      ),
      t(
        'Boilermakers Local 242',
        'Construction boilermaker · applications accepted year-round',
        'https://boilermakers242.com/apprenticeship/',
      ),
      t(
        'Bricklayers BAC Local 1',
        'Trowel trades (brick/stone/tile/terrazzo) · applications open · E. WA',
        'https://bac1or.org/',
      ),
      t(
        'Heat & Frost Insulators Local 82',
        'Mechanical insulator JATC · rolling · interviews once a year in July',
        'https://www.local82jatc.com/',
      ),
      t(
        'FTINW — Painters / Drywall / Glaziers',
        'Finishing trades (IUPAT DC5 / Local 427) · Eastern WA · call-to-apply',
        'http://www.ftinw.org/becoming-apprentice',
      ),
      t(
        'IBEW Local 73 — Electrical',
        '2026 intake CLOSED · reopens ~Jan–Mar 2027 · apply via Inland Empire Electrical · 509-534-0922',
        'https://www.inlandelectrical.org/how-to-apply/',
      ),
    ],
  },
  {
    id: 'concrete',
    label: 'Concrete & Foundry',
    tiles: [
      t(
        'Knife River Prestress',
        'Precast / prestress production & finishing · Spokane · will train',
        'https://www.kniferiverprestress.com/careers',
      ),
      t(
        'Central Pre-Mix (Oldcastle APG)',
        'Pavers / retaining walls / bagged concrete · production & finishing · entry hiring',
        'https://www.oldcastleapg.com/careers',
      ),
      t(
        'ACME Concrete Paving',
        'Concrete paving crews · laborer → finisher · union scale · they train',
        'https://acmecpi.com/careers/',
      ),
      t(
        'INW Precast (Newman Lake)',
        'NPCA-certified precast — vaults / manholes / custom · production & millwright · ~$20–25/hr',
        'https://www.inwprecast.com/',
      ),
      t(
        'White Block Company',
        'Concrete masonry units · mixing / molding / finishing · Spokane Valley · 509-534-0651',
        'https://www.whiteblockcompany.com/',
      ),
      t(
        'Hern Iron Works',
        'Cast-iron foundry — gears, sprockets, grates · ask re: entry casting/labor',
        'https://www.hernironworks.com/',
      ),
      t(
        'Indeed · Concrete finisher (Spokane)',
        'Live concrete finishing / laborer roles',
        'https://www.indeed.com/jobs?q=concrete+finisher&l=Spokane%2C+WA',
      ),
    ],
  },
  {
    id: 'veteran',
    label: 'Veteran',
    tiles: [
      t(
        'Helmets to Hardhats',
        'Veteran direct-entry into registered building trades',
        'https://helmetstohardhats.org/',
      ),
      t(
        'Hiring Our Heroes',
        'Fellowships for vets & spouses · next cohort Fall 2026',
        'https://www.hiringourheroes.org/career-services/fellowships/',
      ),
      t('RecruitMilitary', 'Vet-focused job board', 'https://recruitmilitary.com/jobs'),
      t(
        'DoD SkillBridge',
        'Industry training in your last 180 days of service (active-duty only)',
        'https://skillbridge.mil/locations.htm',
      ),
      t(
        'Onward to Opportunity',
        'Free IVMF training + certification · vets & spouses · rolling',
        'https://ivmf.syracuse.edu/programs/career-training/',
      ),
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    tiles: [
      t(
        'WA L&I — ARTS program search',
        'Official database · every registered WA apprenticeship by occupation / county',
        'https://secure.lni.wa.gov/arts-public/',
      ),
      t(
        'Apprenticeship.gov finder',
        'Official U.S. registered-apprenticeship finder',
        'https://www.apprenticeship.gov/apprenticeship-job-finder',
      ),
      t(
        'WorkSource Spokane',
        'Spokane County master list of programs + phone numbers',
        'https://worksourcespokane.com/job-seekers/apprenticeships/',
      ),
      t('Jobscan', 'Match your resume to a posting — beat the filters', 'https://www.jobscan.co/'),
      t('Novoresume', 'ATS-friendly resume builder', 'https://novoresume.com/'),
    ],
  },
];
