// Apprenticeships / earn-while-you-learn board — Spokane-eligible + remote, kept current
// by design. Two reliable kinds of tile only:
//   1. LIVE SEARCHES — return whatever is actually posted *right now* when clicked
//      (open by definition; no staleness).
//   2. APPLICATION / PROGRAM PORTALS — accept applications on a rolling basis.
// Deliberately NO static one-off job postings: liveness can't be verified ahead of time
// (and would go stale immediately), so they'd violate "only what's open right now".
//
// Named programs/JATCs below were web-checked in Jun 2026 for "open + Spokane-or-remote
// eligible." Each tile's meta carries its status (rolling, annual window, or closed-until).
// Dropped as ineligible: Year Up (hub-based, in-person, no Spokane site), Multiverse
// (employer-sponsored only — no individual intake). Cycle-gated kept with a window note.
import { type Group, type Tile } from './jobsData';

const t = (name: string, meta: string, url: string): Tile => ({ name, meta, url });

export const APPRENTICESHIP_GROUPS: Group[] = [
  {
    id: 'spk-medical',
    label: 'Spokane — medical assistant apprenticeships (verified Jun 2026)',
    tiles: [
      t(
        'Providence — MA Apprentice (Spokane)',
        'Hiring now · 13-mo · $6k forgivable loan · CCMA · 2,000 paid hrs',
        'https://providence.jobs/locations/spokane-wa/job-titles/medical-assistant-apprentice/jobs/',
      ),
      t(
        'CHAS Health — MA Apprenticeship',
        'DOL-registered · 1-yr CMA · 2-wk cohort window (watch chas.org)',
        'https://chas.org/about-chas/careers/educational-programs/medical-assistant-apprenticeship-program/',
      ),
      t(
        'Greater Spokane Apprenticeship — Medical',
        'WSATC-approved MA apprenticeship (new, 2026)',
        'https://spokaneapprenticeship.org/medical/',
      ),
      t(
        'NEW Health — MA Apprenticeship',
        'NE Washington (Colville / Chewelah) · paid',
        'https://newhealth.org/medical-assistant-apprenticeship-program/',
      ),
      t(
        'MultiCare — Medical Assistant (Spokane)',
        'MA roles + advancement · Spokane clinics',
        'https://jobs.multicare.org/medical-assistant-jobs-in-spokane/',
      ),
      t(
        'Indeed · MA apprentice (Spokane)',
        'All live Spokane MA-apprentice postings',
        'https://www.indeed.com/jobs?q=medical+assistant+apprentice&l=Spokane%2C+WA',
      ),
    ],
  },
  {
    id: 'spk-trades',
    label: 'Spokane — union trades JATCs (web-checked Jun 2026)',
    tiles: [
      t(
        'Ironworkers Local 14',
        'Open year-round · structural / reinforcing iron',
        'https://iw14appr.org/',
      ),
      t(
        'UA Local 44 — Plumbers & Pipefitters',
        'Apply online · plumbing / HVAC-R / welding',
        'https://ua44.org/',
      ),
      t(
        'SMART Local 55 — Sheet Metal',
        'Sheet metal / HVAC apprenticeship',
        'https://www.smw55.org/apprenticeship',
      ),
      t(
        'Cement Masons Local 72 (OPCMIA)',
        'Cement masonry / plastering apprenticeship',
        'https://www.opcmia72.org/apprenticeship',
      ),
      t(
        'Heat & Frost Insulators Local 82',
        'Mechanical (pipe & equipment) insulator JATC',
        'https://www.local82jatc.com/',
      ),
      t(
        'Boilermakers Local 242',
        'Construction boilermaker apprenticeship',
        'https://www.google.com/search?q=Boilermakers+Local+242+Spokane+apprenticeship',
      ),
      t(
        'IUPAT Painters Local 10',
        'Painters / glaziers / drywall finishers',
        'https://www.google.com/search?q=IUPAT+Painters+Local+10+Spokane+apprenticeship',
      ),
      t(
        'IBEW Local 73 — Electrical',
        '2026 intake CLOSED (slots filled) · reopens ~Jan 2027',
        'https://www.google.com/search?q=IBEW+Local+73+Spokane+electrical+apprenticeship',
      ),
    ],
  },
  {
    id: 'spk-search',
    label: 'Spokane — open now (live searches)',
    tiles: [
      t(
        'Indeed · apprentice',
        'Every Spokane apprentice posting, live',
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
        'Spokane apprentice roles, live',
        'https://www.linkedin.com/jobs/search/?keywords=apprentice&location=Spokane%2C%20Washington',
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
      t(
        'Avista — careers',
        'Spokane-HQ utility · lineman / trades openings',
        'https://www.google.com/search?q=Avista+careers+apprentice+lineman',
      ),
      t(
        'Kaiser Aluminum (Trentwood)',
        'Industrial trades & maintenance openings',
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
    id: 'spk-programs',
    label: 'Spokane — application portals (rolling intake)',
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
        'Apollo Mechanical — HVAC Apprentice',
        'Spokane Valley contractor · $25–40/hr · hires apprentices on a rolling basis',
        'https://careers.apollomech.com/',
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
    ],
  },
  {
    id: 'remote-search',
    label: 'Remote — open now (live searches)',
    tiles: [
      t(
        'Indeed · apprentice (remote)',
        'Remote apprentice postings, live',
        'https://www.indeed.com/jobs?q=apprentice&l=Remote',
      ),
      t(
        'Indeed · trainee / paid training (remote)',
        'Remote earn-while-you-learn',
        'https://www.indeed.com/jobs?q=%22paid+training%22+OR+trainee&l=Remote',
      ),
      t(
        'Indeed · entry / no experience (remote)',
        'Remote entry roles',
        'https://www.indeed.com/jobs?q=%22no+experience%22+OR+%22entry+level%22&l=Remote',
      ),
      t(
        'LinkedIn · apprentice (remote)',
        'Remote-filtered apprentice roles',
        'https://www.linkedin.com/jobs/search/?keywords=apprentice&f_WT=2',
      ),
      t(
        'Google Jobs · remote apprentice',
        'Aggregates every board',
        'https://www.google.com/search?q=remote+apprentice&ibp=htl;jobs',
      ),
      t(
        'ZipRecruiter · apprentice (remote)',
        '1-click apply · remote',
        'https://www.ziprecruiter.com/jobs-search?search=apprentice&location=Remote',
      ),
    ],
  },
  {
    id: 'remote-programs',
    label: 'Remote — programs (web-checked Jun 2026)',
    tiles: [
      t(
        'AWS Technical Apprenticeship',
        '12-wk course + up to 12-mo paid OJT · now open to all (was vets-only)',
        'https://www.amazon.jobs/content/en/teams/amazon-web-services/technical-apprenticeships',
      ),
      t(
        'Per Scholas — AWS re/Start',
        '15-wk free · live-remote (US) · AWS cert covered',
        'https://perscholas.org/courses/aws-restart/',
      ),
      t(
        'IBM Apprenticeship',
        '12-mo paid · DOL-registered · no degree',
        'https://www.ibm.com/careers/blog/the-ibm-apprenticeship-program-no-degree-no-problem',
      ),
      t(
        'Accenture Apprenticeship',
        '~12-mo paid · no degree · salaried + benefits',
        'https://www.accenture.com/us-en/careers/life-at-accenture/apprenticeships',
      ),
      t(
        'ServiceNow RiseUp',
        'Free virtual · CSA cert + mentoring + hiring network',
        'https://learning.servicenow.com/apply',
      ),
      t(
        'Boeing BTAP',
        'Up to 12-mo paid · DOL-registered · no degree',
        'https://jobs.boeing.com/BTAP',
      ),
      t(
        'Google Apprenticeships',
        '18-mo paid · DOL · apps open ~Sept yearly (next cohort Mar)',
        'https://www.google.com/about/careers/applications/buildyourfuture/apprenticeships/',
      ),
      t(
        'Microsoft Leap',
        '16-wk paid · for returners (1+ yr out of work) · apps Sept–Nov',
        'https://leap.microsoft.com/',
      ),
      t(
        'LearnSFDC',
        'Salesforce 1099 project work · waitlist — apply to be notified',
        'https://learnsfdc.com/salesforce-apprenticeship-program/',
      ),
    ],
  },
  {
    id: 'veteran',
    label: 'Veteran pathways (Spokane + remote)',
    tiles: [
      t(
        'DoD SkillBridge',
        'Industry training in your last 180 days of service',
        'https://skillbridge.osd.mil/locations.htm',
      ),
      t(
        'Microsoft MSSA',
        'Free · service members/vets within 6 mo of separation · cohorts open now',
        'https://military.microsoft.com/mssa/',
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
  {
    id: 'finders',
    label: 'Program finders',
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
    ],
  },
];
