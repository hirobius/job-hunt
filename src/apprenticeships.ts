// Apprenticeships / earn-while-you-learn board — Spokane-eligible + remote, kept current
// by design. Two reliable kinds of tile only:
//   1. LIVE SEARCHES — return whatever is actually posted *right now* when clicked
//      (open by definition; no staleness).
//   2. APPLICATION / PROGRAM PORTALS — accept applications on a rolling basis.
// Deliberately NO static one-off job postings: liveness can't be verified ahead of time
// (and would go stale immediately), so they'd violate "only what's open right now".
import { type Group, type Tile } from './jobsData';

const t = (name: string, meta: string, url: string): Tile => ({ name, meta, url });

export const APPRENTICESHIP_GROUPS: Group[] = [
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
        'Indeed · medical assistant apprentice',
        'Spokane clinical earn-while-you-learn',
        'https://www.indeed.com/jobs?q=medical+assistant+apprentice&l=Spokane%2C+WA',
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
        'IBEW Local 73',
        'Inland NW electrical apprenticeship (union)',
        'https://www.google.com/search?q=IBEW+Local+73+Spokane+electrical+apprenticeship',
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
        'CHAS Health — Medical Assistant',
        '$20.99/hr · 1-year clinical apprenticeship',
        'https://chas.org/about-chas/careers/educational-programs/medical-assistant-apprenticeship-program/',
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
    label: 'Remote — programs (apply anytime)',
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
    id: 'veteran',
    label: 'Veteran pathways (Spokane + remote)',
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
