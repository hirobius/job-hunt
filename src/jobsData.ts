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
];

// ---- ATS hidden-jobs generator ----
export const ATS_ROLES = [
  'sheet metal',
  'fabricator',
  'welder',
  'metal fabrication',
  'machine operator',
  'CNC machinist',
];
export const ATS: { name: string; domain: string; site: string }[] = [
  {
    name: 'Greenhouse',
    domain: 'boards.greenhouse.io',
    site: '(site:boards.greenhouse.io OR site:job-boards.greenhouse.io)',
  },
  { name: 'Lever', domain: 'jobs.lever.co', site: 'site:jobs.lever.co' },
  { name: 'Ashby', domain: 'jobs.ashbyhq.com', site: 'site:jobs.ashbyhq.com' },
  { name: 'Workday', domain: 'myworkdayjobs.com', site: 'site:myworkdayjobs.com' },
  {
    name: 'SmartRecruiters',
    domain: 'jobs.smartrecruiters.com',
    site: 'site:jobs.smartrecruiters.com',
  },
  { name: 'iCIMS', domain: 'careers.icims.com', site: 'site:careers.icims.com' },
  { name: 'JazzHR', domain: 'applytojob.com', site: 'site:applytojob.com' },
  { name: 'Workable', domain: 'apply.workable.com', site: 'site:apply.workable.com' },
];

// ---- Curated groups ----
export const GROUPS: Group[] = [
  {
    // Design Systems "Apply Now" — the parallel (non-trades) track: remote design-systems /
    // design-engineering roles. Board rule holds: live remote searches + ATS Google-dorks
    // (the low-competition hidden-jobs angle), no one-off postings. Remote by construction,
    // so it sidesteps the Spokane-locked Title-search BOARDS.
    id: 'ds-brief',
    label: 'Apply Now',
    tiles: [
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
    ],
  },
  {
    // Implementation Consulting "Apply Now" — the other parallel (non-trades) track: software
    // implementation / onboarding / professional-services roles, generalist across ecosystems.
    // Curates BOTH remote and Spokane-area live searches (the pillar is remote+Spokane), plus
    // ATS Google-dorks for the low-competition hidden-jobs angle. Board rule holds: live
    // searches + durable dorks only, no one-off postings.
    id: 'ic-brief',
    label: 'Apply Now',
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
        'Live Spokane-area implementation & onboarding postings',
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
    label: 'Apply Now',
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
    label: 'Apply Now',
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
        'All live Spokane fab + sheet-metal postings',
        'https://www.indeed.com/jobs?q=fabricator+OR+%22sheet+metal%22&l=Spokane%2C+WA',
      ),
    ],
  },
  {
    // Welding & machining "Apply Now" — shops that run welders and CNC/machine operators.
    id: 'weld-brief',
    label: 'Apply Now',
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
    label: 'Apply Now',
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
        'Live Spokane CNC + machine-operator postings',
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
