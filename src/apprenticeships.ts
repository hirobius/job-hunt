// Curated apprenticeship / earn-while-you-learn programs for the Apprenticeships tab.
// Spokane-first: local trades, healthcare, and employer postings; statewide search
// tools; plus remote/national tech and veteran pathways open to WA residents.
//
// NOTE on freshness: durable application/program pages accept applications year-round.
// Specific job postings expire — those are marked "verify" in the meta; click to confirm
// they're still hiring. (Links curated from research; not auto-verified.)
import { type Group, type Tile } from './jobsData';

const t = (name: string, meta: string, url: string): Tile => ({ name, meta, url });

export const APPRENTICESHIP_GROUPS: Group[] = [
  {
    id: 'appr-spokane-trades',
    label: 'Spokane & Eastern WA — trades',
    tiles: [
      t(
        'Inland NW AGC JATC',
        'Carpenter · Laborer · Heavy Equipment Operator · Spokane Valley',
        'https://nwagcapprenticeship.org/apply-today/',
      ),
      t(
        'CITC Eastern WA',
        'Electrical · HVAC · Plumbing · Carpentry · Sheet Metal · Glazier · non-union',
        'https://citcwa.org/apprenticeship/online-apprenticeship-application/',
      ),
      t(
        'Western States Cat — Diesel Academy',
        '10-mo diesel tech · Spokane / Liberty Lake · tools + laptop provided',
        'https://www.westernstatescat.com/tech-academy/',
      ),
      t(
        'Apprenti (WA)',
        'Registered tech apprenticeships · take the assessment',
        'https://apprenticareers.org/career-seeker/',
      ),
      t(
        'SCC Skilled Trades Prep',
        'Free 11-wk trades prep · OSHA-10, math, rigging',
        'https://scc.spokane.edu/Become-a-Student/I-Need-Basic-Education/Short-Term-Training/Skilled-Trades-Preparation',
      ),
      t(
        'Avista — utility & trades',
        'Spokane-HQ utility · lineman / trades apprenticeships',
        'https://www.google.com/search?q=Avista+careers+apprentice+lineman',
      ),
      t(
        'IBEW Local 73',
        'Inland NW electrical apprenticeship (union)',
        'https://www.google.com/search?q=IBEW+Local+73+Spokane+electrical+apprenticeship',
      ),
      t(
        'Kaiser Aluminum (Trentwood)',
        'Industrial trades & maintenance · Spokane Valley',
        'https://www.google.com/search?q=Kaiser+Aluminum+Trentwood+Spokane+careers',
      ),
      t(
        'Spokane Transit (STA)',
        'Transit coach mechanic / maintenance',
        'https://www.google.com/search?q=Spokane+Transit+Authority+careers',
      ),
    ],
  },
  {
    id: 'appr-spokane-health',
    label: 'Spokane — healthcare & pharmacy',
    tiles: [
      t(
        'CHAS Health — Medical Assistant',
        '$20.99/hr · 1-year clinical apprenticeship',
        'https://chas.org/about-chas/careers/educational-programs/medical-assistant-apprenticeship-program/',
      ),
      t(
        'Providence — Medical Assistant',
        '$20.91+/hr · $2,500 sign-on · posting, verify',
        'https://providence.jobs/spokane-wa/medical-assistant-primary-care-multiple-clinics/2AA4177C2C0447068C75CBC0686AA149/job/',
      ),
      t(
        'MultiCare Rockwood — Medical Assistant',
        'Float-pool MA · Spokane Valley',
        'https://www.multicare.org/',
      ),
      t(
        'Walgreens — Pharmacy Tech',
        '$19.50–23/hr · PTCB cert · posting, verify',
        'https://jobs.walgreens.com/en/job/spokane/pharmacy-technician-pharm-tech-apprenticeship/1242/96851549680',
      ),
    ],
  },
  {
    id: 'appr-spokane-postings',
    label: 'Spokane employer postings — verify still open',
    tiles: [
      t(
        'JLL — Mechatronics & Robotics',
        '$17–22/hr + 12 wks paid training · Spokane',
        'https://jll.wd1.myworkdayjobs.com/en-US/jllcareers/job/Mechatronics---Robotics-Apprenticeship_REQ495795-1',
      ),
      t(
        'Lennox — HVAC Service Apprentice',
        '$33–41k/yr + company vehicle · Spokane',
        'https://hrlydistribution-lennox.icims.com/jobs/53670/hvac-service-apprentice/job',
      ),
      t(
        'McCallum — Drill / Blast Apprentice',
        '$21–25/hr · Cheney · 100% paid medical',
        'https://www.mccallumrockdrilling.com/',
      ),
      t(
        'Raptor Rooter — Plumbing Apprentice',
        '$17–32/hr · Spokane Valley · 401(k) match',
        'https://raptorrooter.com/',
      ),
      t(
        'River City Glass — Glazier',
        '$20–35/hr · Spokane Valley · Indeed posting',
        'https://www.indeed.com/viewjob?jk=776ceabcc5259e65',
      ),
    ],
  },
  {
    id: 'appr-spokane-search',
    label: 'Widen the net — Spokane searches',
    tiles: [
      t(
        'Indeed · apprentice',
        'Every Spokane apprentice posting',
        'https://www.indeed.com/jobs?q=apprentice&l=Spokane%2C+WA',
      ),
      t(
        'Indeed · trainee / paid training',
        'Earn-while-you-learn roles',
        'https://www.indeed.com/jobs?q=%22paid+training%22+OR+trainee&l=Spokane%2C+WA',
      ),
      t(
        'Indeed · will-train / no experience',
        'Entry roles, no experience needed',
        'https://www.indeed.com/jobs?q=%22will+train%22+OR+%22no+experience%22&l=Spokane%2C+WA',
      ),
      t(
        'LinkedIn · apprentice',
        'Spokane apprentice roles',
        'https://www.linkedin.com/jobs/search/?keywords=apprentice&location=Spokane%2C%20Washington',
      ),
      t(
        'Google Jobs · apprentice',
        'Aggregates every board',
        'https://www.google.com/search?q=apprentice+spokane+wa&ibp=htl;jobs',
      ),
      t(
        'ZipRecruiter · apprentice',
        '1-click apply · Spokane',
        'https://www.ziprecruiter.com/jobs-search?search=apprentice&location=Spokane%2C+WA',
      ),
      t(
        'Snagajob · Spokane',
        'Hourly / entry · fast apply',
        'https://www.snagajob.com/search?q=&w=Spokane%2C+WA',
      ),
      t(
        'USAJOBS · Spokane',
        'Federal roles · veteran preference',
        'https://www.usajobs.gov/Search/Results?l=Spokane%2C%20Washington',
      ),
      t(
        'WorkSource WA',
        'State job center · apprenticeship listings',
        'https://www.worksourcewa.com/',
      ),
    ],
  },
  {
    id: 'appr-search',
    label: 'Search every WA program',
    tiles: [
      t(
        'WA L&I — Become an Apprentice',
        'All registered WA programs + employers',
        'https://www.lni.wa.gov/licensing-permits/apprenticeship/become-apprentice/',
      ),
      t(
        'Apprenticeship.gov',
        'Official U.S. registered-apprenticeship finder',
        'https://www.apprenticeship.gov/apprenticeship-job-finder',
      ),
      t(
        'CareerOneStop Finder',
        'Search by trade + state (DoL)',
        'https://www.careeronestop.org/Toolkit/Training/find-apprenticeships.aspx',
      ),
      t(
        'SBCTC Apprenticeships',
        'WA community / technical college programs',
        'https://www.sbctc.edu/becoming-a-student/train-for-job/apprenticeships-student.aspx',
      ),
      t(
        'Indeed — Spokane apprenticeships',
        'Live local apprenticeship postings',
        'https://www.indeed.com/q-apprenticeship-program-l-spokane,-wa-jobs.html',
      ),
    ],
  },
  {
    id: 'appr-remote-tech',
    label: 'Remote & national tech (open to WA)',
    tiles: [
      t(
        'Per Scholas — AWS re/Start',
        '15-wk free virtual · AWS cert covered',
        'https://perscholas.org/courses/aws-restart/',
      ),
      t(
        'Google Apprenticeships',
        '18–24 mo · paid · DOL-certified',
        'https://www.google.com/about/careers/applications/buildyourfuture/apprenticeships/',
      ),
      t('Microsoft Leap', '16-wk paid · SWE / PM / UX / Data', 'https://leap.microsoft.com/'),
      t(
        'Microsoft MSSA',
        'Software & Systems Academy · service members',
        'https://military.microsoft.com/programs/microsoft-software-systems-academy/',
      ),
      t('IBM New Collar', '12-mo paid apprenticeships · no degree', 'https://www.ibm.com/careers'),
      t(
        'ServiceNow RiseUp',
        'Free certification + mentoring + placement',
        'https://learning.servicenow.com/apply',
      ),
      t(
        'Multiverse',
        'Apprenticeships in software, data & AI',
        'https://www.multiverse.io/en-US/apprenticeships',
      ),
      t(
        'LearnSFDC',
        'Salesforce · 1099 project-based',
        'https://learnsfdc.com/salesforce-apprenticeship-program/',
      ),
      t('Boeing BTAP', 'Cybersecurity / assembly · vets welcome', 'https://jobs.boeing.com/BTAP'),
    ],
  },
  {
    id: 'appr-veteran',
    label: 'Veteran pathways',
    tiles: [
      t(
        'DoD SkillBridge',
        'Industry training in your last 180 days of service',
        'https://skillbridge.osd.mil/locations.htm',
      ),
      t(
        'VA VET TEC',
        'VA-funded high-tech training (no GI Bill used)',
        'https://www.va.gov/education/about-gi-bill-benefits/how-to-use-benefits/vettec-high-tech-program/',
      ),
      t(
        'Hiring Our Heroes',
        'Fellowships + apprenticeships for vets & spouses',
        'https://www.hiringourheroes.org/career-services/fellowships/',
      ),
      t(
        'Onward to Opportunity',
        'Free IVMF training + certification',
        'https://ivmf.syracuse.edu/programs/career-training/',
      ),
    ],
  },
];
