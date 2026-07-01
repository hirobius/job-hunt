// Apprenticeships / earn-while-you-learn board — Spokane-eligible + remote, kept current
// by design. Reliable tile kinds:
//   1. LIVE SEARCHES — return whatever is actually posted *right now* when clicked
//      (open by definition; no staleness).
//   2. APPLICATION / PROGRAM PORTALS — accept applications on a rolling basis, or a
//      named program in a known window (window/closed-until carried in the meta).
//   3. PAID REMOTE WORK (1099) — AI expert-contributor networks + SaaS partner pipelines
//      that onboard on a rolling basis. Not apprenticeships, but earn-from-day-one and
//      remote; grouped separately so the board's apprenticeship core stays honest.
// Deliberately NO static one-off job postings: liveness can't be verified ahead of time.
//
// Re-verified Jun 2026 for "open + Spokane-or-remote eligible." NOTE: most program hosts
// bot-block / proxy-block automated fetches, so statuses below were confirmed via live web
// search (indexed, current 2026 pages) rather than direct page loads — re-confirm any hard
// date by phone / on the live page before relying on it.
// Dropped as out-of-parameters: Year Up (age cap 29), Boeing BTAP (on-site, non-Spokane),
// Northwest HVAC/R (9-mo UNPAID), Kaiser MA (Spokane cohort unconfirmed). Cycle-gated kept
// with a window note; window-only-when-open programs (Elevator/NEIEP) left off until a
// recruitment window is posted.
import { type Group, type Tile } from './jobsData';

const t = (name: string, meta: string, url: string): Tile => ({ name, meta, url });

export const APPRENTICESHIP_GROUPS: Group[] = [
  {
    id: 'spk-medical',
    label: 'Spokane — healthcare apprenticeships (verified Jun 2026)',
    tiles: [
      t(
        'Providence — MA Apprentice (Spokane)',
        'Cohort-based · Fall 2026 cohort · 13-mo paid · $6k forgivable loan · CCMA (NHA)',
        'https://providence.jobs/ma-apprentice/',
      ),
      t(
        'Providence — Earn-to-Learn CNA (Spokane)',
        'Paid full-time CNA training · 100% tuition covered · quarterly hiring events',
        'https://www.providence.org/locations/wa/health-training/vocational-education/cna-training-program',
      ),
      t(
        'CHAS Health — MA Apprenticeship',
        'No experience needed · paid employee · 1-yr CCMA · cohort-gated (apply ~2 wk prior)',
        'https://chas.org/about-chas/careers/educational-programs/medical-assistant-apprenticeship-program/',
      ),
      t(
        'CHAS Health — Pharmacy Tech Apprenticeship',
        '1-yr paid pharmacy-tech apprenticeship · no experience · cohort-based 2026',
        'https://chas.org/about-chas/careers/educational-programs/pharmacy-technician-apprenticeship-program/',
      ),
      t(
        'Greater Spokane Apprenticeship — Medical',
        'WSATC-approved MA apprenticeship (new 2026) · 18+, HS/GED · employer-placed',
        'https://spokaneapprenticeship.org/medical/',
      ),
      t(
        'NEW Health — MA Apprenticeship',
        'NE WA (Colville / Chewelah) · 1-yr paid OJT + online coursework · CCMA',
        'https://newhealth.org/medical-assistant-apprenticeship-program/',
      ),
      t(
        'MultiCare — MA Training Programs',
        'Paid MA / CNA / phlebotomy training · no cert required · 18+ · rolling',
        'https://jobs.multicare.org/students-grads/training-programs/',
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
        'Operating Engineers IUOE 302',
        'OPEN now · heavy-equipment operator · apply by Nov 6 2026 · training Spring 2027',
        'https://oetraining.unionimpact.com/',
      ),
      t(
        'Ironworkers Local 14',
        'Open year-round online · structural / reinforcing iron · DD-214 = experience credit',
        'https://iw14appr.org/',
      ),
      t(
        'Laborers — NW LETT (Local 238)',
        'Rolling / phone intake · no upfront skills · 18+ · free training, housing & meals',
        'https://www.nwlett.edu/about-us/apprenticeship/',
      ),
      t(
        'UA Local 44 — Plumbers & Steamfitters',
        'Window-based (May & Nov) · next deadline ~Oct 9 2026 · in-person pickup',
        'https://ua44.org/',
      ),
      t(
        'SMART Local 55 — Sheet Metal',
        'Sheet metal / HVAC · by-contact / competitive · 509-928-5009',
        'https://smw55.org/apprenticeship/',
      ),
      t(
        'Cement Masons Local 72 (OPCMIA)',
        'Cement masonry / plastering · apply in person / email · HS-GED',
        'https://www.opcmia72.org/apprenticeship-forms/',
      ),
      t(
        'Heat & Frost Insulators Local 82',
        'Mechanical insulator JATC · rolling · interviews held once a year in July',
        'https://www.local82jatc.com/',
      ),
      t(
        'Boilermakers Local 242',
        'Construction boilermaker · applications accepted year-round',
        'https://boilermakers242.com/apprenticeship/',
      ),
      t(
        'Bricklayers BAC Local 1 (OR/WA/ID/MT)',
        'Trowel trades (brick/stone/tile/terrazzo) · applications currently open · E. WA',
        'https://bac1or.org/',
      ),
      t(
        'FTINW — Painters / Drywall / Glaziers',
        'Finishing trades (IUPAT DC5 / Local 427) · Eastern WA · call-to-apply / rolling',
        'http://www.ftinw.org/becoming-apprentice',
      ),
      t(
        'Roofers Local 189 (Inland Empire)',
        'Roofing / waterproofing JATC · by-phone (509) 327-2322 · status not posted online',
        'https://unionroofers.com/join-us/apprenticeship/',
      ),
      t(
        'IBEW Local 73 — Electrical',
        '2026 intake CLOSED (slots filled) · reopens ~Jan–Mar 2027 · join wait-list now',
        'https://www.inlandelectrical.org/how-to-apply/',
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
        'Carpenter · Laborer · Heavy Equipment Operator · Spokane Valley · year-round',
        'https://nwagcapprenticeship.org/apply-today/',
      ),
      t(
        'CITC Eastern WA',
        'Electrical · HVAC · Plumbing · Carpentry · Sheet Metal · non-union · year-round',
        'https://citcwa.org/apprenticeship/',
      ),
      t(
        'AJAC — Aerospace Joint Apprenticeship',
        'WA mfg apprenticeships (machinist, maintenance) · employer-gated: get hired first',
        'https://www.ajactraining.org/',
      ),
      t(
        'Avista / SCC Lineworker School',
        '16-wk pre-apprentice lineworker school (N. Spokane) · 2 sessions/yr · fills early',
        'https://scc.spokane.edu/What-to-Study/Hands-on-Building-Trades/Utility-Construction-Avista',
      ),
      t(
        'Western States Cat — Tech Academy',
        '~10-mo diesel tech (8-mo class + paid internship) · Spokane / Liberty Lake',
        'https://www.westernstatescat.com/tech-academy/',
      ),
      t(
        'Apollo Mechanical — HVAC Apprentice',
        'Spokane Valley contractor · $25–40/hr · hires apprentices on a rolling basis',
        'https://careers.apollomech.com/',
      ),
      t(
        'Apprenti (WA)',
        'Registered tech apprenticeships · no openings posted now — join the list',
        'https://apprenticareers.org/career-seeker/',
      ),
      t(
        'SCC Skilled Trades Prep',
        'Free 11-wk trades prep · OSHA-10, math, rigging · feeds 18 apprenticeships',
        'https://scc.spokane.edu/Become-a-Student/I-Need-Basic-Education/Short-Term-Training/Skilled-Trades-Preparation',
      ),
    ],
  },
  {
    // Specific shops (no stable careers URL) are live Google-search leads — same pattern as the
    // Avista/Kaiser/STA tiles — so they never go stale. Phone numbers in the meta where given.
    // OPCMIA Local 72 (concrete) already lives in the union-trades JATC group above.
    id: 'spk-shops',
    label: 'Spokane — welding, metal fab & concrete shops (entry-level · will-train)',
    tiles: [
      t(
        'Indeed · welder / fabricator (Spokane)',
        'All live Spokane welding + fab postings',
        'https://www.indeed.com/jobs?q=welder+OR+fabricator&l=Spokane%2C+WA',
      ),
      t(
        'Indeed · will-train welder (Spokane)',
        'Entry / no-experience welding roles',
        'https://www.indeed.com/jobs?q=welder+%22no+experience%22&l=Spokane%2C+WA',
      ),
      t(
        'ZipRecruiter · welder, no experience (Spokane)',
        '1-click apply · entry welding',
        'https://www.ziprecruiter.com/jobs-search?search=welder+no+experience&location=Spokane%2C+WA',
      ),
      t(
        'SteelFab Inc',
        'MIG/TIG welders & fitters · entry OK, they train · 509-747-4139',
        'https://www.google.com/search?q=SteelFab+Inc+Spokane+welding+jobs',
      ),
      t(
        'Still Waters Metal Fab',
        'Welders & fitters · entry openings · Spokane Valley',
        'https://www.google.com/search?q=Still+Waters+Metal+Fab+Spokane+Valley+jobs',
      ),
      t(
        'Spokane Stainless Technologies (SST)',
        'Metal fab · forming / shearing · $18–22/hr · training',
        'https://www.google.com/search?q=Spokane+Stainless+Technologies+careers',
      ),
      t(
        'Sytech Inc',
        'Precision stainless fab · gas / electric welding · training',
        'https://www.google.com/search?q=Sytech+Inc+Spokane+welding+jobs',
      ),
      t(
        'Wagstaff Inc',
        'TIG fabrication · swing shift · entry training · Spokane Valley',
        'https://www.google.com/search?q=Wagstaff+Inc+Spokane+careers+welding',
      ),
      t(
        'Finnoe Design LLC',
        'Fitter / welder · TIG preferred · they train',
        'https://www.google.com/search?q=Finnoe+Design+Spokane+welder+jobs',
      ),
      t(
        'NIC Global',
        'Sheet metal fab & mechanical assembly · entry $18/hr · training',
        'https://www.google.com/search?q=NIC+Global+Spokane+production+jobs',
      ),
      t(
        'Blue Compass RV',
        'Technician apprentice · welding / fab hybrid · Spokane Valley',
        'https://www.google.com/search?q=Blue+Compass+RV+Spokane+technician+apprentice',
      ),
      t(
        'All Phase Concrete',
        'Concrete finishing (driveways / patios / steps) · hire & train',
        'https://www.google.com/search?q=All+Phase+Concrete+Spokane+jobs',
      ),
      t(
        'Spokane Concrete Co',
        'Stamped concrete & finishing · actively hiring',
        'https://concrete-spokane.com/',
      ),
      t(
        'Wilbert Precast Inc',
        'Precast production & finishing · production roles',
        'https://www.google.com/search?q=Wilbert+Precast+Spokane+production+jobs',
      ),
      t(
        'Indeed · concrete finisher (Spokane)',
        'Live concrete finishing / laborer roles',
        'https://www.indeed.com/jobs?q=concrete+finisher&l=Spokane%2C+WA',
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
        'Code the Dream — CTD Labs',
        'Free remote coding school → paid apprenticeship ($31,200/yr) · 18+ · quarterly cohorts',
        'https://codethedream.org/apprenticeship/',
      ),
      t(
        'IBM Apprenticeship',
        '~12-mo paid · DOL-registered · no degree · rolling but posting-dependent (set alerts)',
        'https://www.ibm.com/us-en/employment/newcollar/apprenticeships/',
      ),
      t(
        'NPower',
        'Free virtual tech training + paid internship · young adults & veterans · no degree',
        'https://www.npower.org/apply/',
      ),
      t(
        'Per Scholas — National Remote',
        'Free live-remote IT/cyber/cloud · national team between cohorts — submit interest form',
        'https://perscholas.org/locations/national-remote-training/',
      ),
      t(
        'LinkedIn REACH',
        'Paid registered engineering apprenticeship · essay-based intake · opens a few ×/yr',
        'https://careers.linkedin.com/reach',
      ),
      t(
        'Accenture Apprenticeship',
        '1-yr paid salaried · 18+, HS diploma, no degree · US work auth · apply via careers (FY26 open)',
        'https://www.accenture.com/us-en/careers/life-at-accenture/apprenticeships',
      ),
      t(
        'AWS Technical Apprenticeship',
        'Veterans & mil-spouses · 12–18 wk paid course + up to 12-mo paid OJT · cloud roles',
        'https://www.amazon.jobs/content/en/teams/amazon-web-services/technical-apprenticeships',
      ),
      t(
        'ServiceNow RiseUp',
        'Free · CSA + CAD certs covered · 10–14 wk virtual · apply anytime',
        'https://learning.servicenow.com/apply',
      ),
      t(
        'Google Apprenticeships',
        '18-mo paid · DOL · window CLOSED now · reopens ~Sept 2026 (Mar/Sept starts)',
        'https://www.google.com/about/careers/applications/buildyourfuture/apprenticeships/',
      ),
      t(
        'Microsoft Leap',
        'Paid · non-traditional candidates (returners, self-taught, vets) · multiple cohorts/yr',
        'https://leap.microsoft.com/',
      ),
      t(
        'LearnSFDC',
        'Salesforce 1099 milestone-paid · waitlist — apply to be notified (slots intermittent)',
        'https://learnsfdc.com/salesforce-apprenticeship-program/',
      ),
    ],
  },
  {
    id: 'remote-ai',
    label: 'Remote — paid AI / expert work (1099, rolling)',
    tiles: [
      t(
        'DataAnnotation (coding)',
        'Get paid to write/evaluate code & AI outputs · $40–$100+/hr · fast onboarding',
        'https://www.dataannotation.tech/',
      ),
      t(
        'Mercor — Expert / Model Trainer',
        'One AI interview unlocks projects · $50–$200/hr specialized · weekly pay · US-eligible',
        'https://www.mercor.com/experts/',
      ),
      t(
        'Snorkel AI — Expert Contributor',
        'Task-based expert datasets (coding, STEM, law) · $10–$100/task · same-day start',
        'https://snorkel.ai/expert-community/',
      ),
      t(
        'Outlier (Scale AI)',
        '40+ domains incl. coding / DevOps / STEM · task-based · remote',
        'https://outlier.ai/',
      ),
      t(
        'micro1 (Zara AI interview)',
        'Certify skills → matched to AI-training projects · $120–$150+ software/finance',
        'https://www.micro1.ai/experts',
      ),
      t(
        'Handshake AI (Fellowship)',
        'Paid remote AI training/evaluation · no AI experience required · US work auth',
        'https://joinhandshake.com/ai/',
      ),
    ],
  },
  {
    id: 'remote-saas',
    label: 'Remote — paid SaaS partner pipelines',
    tiles: [
      t(
        'Webflow Certified Partners',
        'Vetted partner directory + client matchmaking · ~$100–200/hr · build 3 sites to qualify',
        'https://webflow.com/certified-partners/apply',
      ),
      t(
        'Notion Consulting Partner',
        'Certified consultant listed on Marketplace for client work · 3 badges + certs',
        'https://www.notion.com/help/become-a-notion-partner',
      ),
      t(
        'HubSpot Solutions Partner',
        'Commission / referral pipeline · best if you do CRM / marketing-ops work',
        'https://www.hubspot.com/partners/solutions',
      ),
    ],
  },
  {
    id: 'veteran',
    label: 'Veteran pathways (Spokane + remote)',
    tiles: [
      t(
        'Helmets to Hardhats',
        'Free · veteran direct-entry into registered building trades (some skip the waitlist)',
        'https://helmetstohardhats.org/',
      ),
      t(
        'VA VET TEC 2.0',
        'VA-funded high-tech training (no GI Bill used) · apps open since Jun 2026 · 4k/yr cap',
        'https://www.va.gov/education/other-va-education-benefits/vet-tec-2/',
      ),
      t(
        'Microsoft MSSA',
        'Free · service members/vets within 180 days of separation · next deadline Jul 6 2026',
        'https://military.microsoft.com/mssa/',
      ),
      t(
        'DoD SkillBridge',
        'Industry training in your last 180 days of service (active-duty only)',
        'https://skillbridge.mil/locations.htm',
      ),
      t(
        'Hiring Our Heroes',
        'Fellowships for vets & spouses · next cohort Fall 2026 · off-cycle apps accepted',
        'https://www.hiringourheroes.org/career-services/fellowships/',
      ),
      t(
        'Onward to Opportunity',
        'Free IVMF training + certification · vets & spouses · rolling enrollment',
        'https://ivmf.syracuse.edu/programs/career-training/',
      ),
    ],
  },
  {
    id: 'finders',
    label: 'Program finders',
    tiles: [
      t(
        'WorkSource / Apprenticeship Spokane',
        'Spokane County master list of local programs + phone numbers',
        'https://worksourcespokane.com/job-seekers/apprenticeships/',
      ),
      t(
        'WA L&I — Become an Apprentice',
        'All registered WA programs + employers (ARTS)',
        'https://www.lni.wa.gov/licensing-permits/apprenticeship/become-apprentice/',
      ),
      t(
        'Apprenticeship.gov',
        'Official U.S. registered-apprenticeship finder',
        'https://www.apprenticeship.gov/apprenticeship-job-finder',
      ),
      t(
        'CareerOneStop — Office Finder',
        'Sponsor finder retired (→ Apprenticeship.gov); office finder by state still works',
        'https://www.careeronestop.org/LocalHelp/EmploymentAndTraining/find-apprenticeship-offices.aspx',
      ),
      t(
        'SBCTC Apprenticeships',
        'WA community / technical college programs',
        'https://www.sbctc.edu/becoming-a-student/train-for-job/apprenticeships-student',
      ),
    ],
  },
];
