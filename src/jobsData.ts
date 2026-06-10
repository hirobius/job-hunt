export interface Tile { name: string; meta: string; url: string; }
export interface Group { id: string; label: string; tiles: Tile[]; }

const t = (name: string, meta: string, url: string): Tile => ({ name, meta, url });

// Bake an entry-level / early-career filter into board search URLs.
export function entryLevelize(u: string): string {
  if (!u) return u;
  try {
    if (/indeed\.com\/jobs/i.test(u)) { if (/[?&]q=/.test(u) && !/[?&]sc=/.test(u)) u += '&sc=0kf%3Aexplvl(ENTRY_LEVEL)%3B'; }
    else if (/linkedin\.com\/jobs/i.test(u)) { if (!/[?&]f_E=/.test(u)) u += (u.indexOf('?') > -1 ? '&' : '?') + 'f_E=2%2C3'; }
    else if (/ziprecruiter\.com/i.test(u)) u = append(u, 'search', 'entry level');
    else if (/dice\.com/i.test(u)) u = append(u, 'q', 'entry level');
    else if (/google\.[a-z.]+\/search/i.test(u) && /ibp=htl/i.test(u)) u = append(u, 'q', 'entry level');
  } catch { /* ignore */ }
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
  'Help Desk Technician', 'Help Desk Analyst', 'Service Desk Technician', 'Service Desk Analyst',
  'IT Support Specialist', 'IT Support Technician', 'Technical Support Specialist', 'Desktop Support Technician',
  'IT Service Desk Agent', 'End User Support Technician', 'Tier 1 Support', 'GRC Analyst',
  'Compliance Analyst', 'SOC Analyst', 'IT Auditor', 'Associate IT Technician',
];
export const BOARDS: { name: string; tag: string; build: (term: string) => string }[] = [
  { name: 'Indeed', tag: 'Remote', build: (t) => `https://www.indeed.com/jobs?q=${encodeURIComponent(t)}&l=Remote` },
  { name: 'LinkedIn', tag: 'Entry · Remote', build: (t) => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(t)}&f_WT=2` },
  { name: 'Google Jobs', tag: 'Aggregator', build: (t) => `https://www.google.com/search?q=${encodeURIComponent(t + ' remote')}&ibp=htl;jobs` },
  { name: 'ZipRecruiter', tag: 'Remote', build: (t) => `https://www.ziprecruiter.com/jobs-search?search=${encodeURIComponent(t)}&location=Remote` },
  { name: 'Dice', tag: 'Tech', build: (t) => `https://www.dice.com/jobs?q=${encodeURIComponent(t)}&filters.workplaceTypes=Remote` },
  { name: 'Indeed · Spokane', tag: 'On-site', build: (t) => `https://www.indeed.com/jobs?q=${encodeURIComponent(t)}&l=Spokane%2C+WA` },
];

// ---- ATS hidden-jobs generator ----
export const ATS_ROLES = ['GRC analyst', 'IT support', 'help desk', 'compliance analyst', 'SOC analyst', 'service desk'];
export const ATS: { name: string; domain: string; site: string }[] = [
  { name: 'Greenhouse', domain: 'boards.greenhouse.io', site: '(site:boards.greenhouse.io OR site:job-boards.greenhouse.io)' },
  { name: 'Lever', domain: 'jobs.lever.co', site: 'site:jobs.lever.co' },
  { name: 'Ashby', domain: 'jobs.ashbyhq.com', site: 'site:jobs.ashbyhq.com' },
  { name: 'Workday', domain: 'myworkdayjobs.com', site: 'site:myworkdayjobs.com' },
  { name: 'SmartRecruiters', domain: 'jobs.smartrecruiters.com', site: 'site:jobs.smartrecruiters.com' },
  { name: 'iCIMS', domain: 'careers.icims.com', site: 'site:careers.icims.com' },
  { name: 'JazzHR', domain: 'applytojob.com', site: 'site:applytojob.com' },
  { name: 'Workable', domain: 'apply.workable.com', site: 'site:apply.workable.com' },
];

// ---- Curated groups ----
export const GROUPS: Group[] = [
  { id: 'brief', label: 'Apply Now', tiles: [
    // Fresh batch (refreshed Jun 2026) — durable employer pages + 1-click "now hiring" boards
    t('STCU (Spokane)', 'IT / tech roles · local credit union', 'https://stcu.org/here-for-good/about-stcu/careers'),
    t('Numerica Credit Union', 'IT Support / Systems · ~$28–43/hr · local', 'https://www.numericacu.com/careers'),
    t('Leidos · Public Trust', 'Help Desk / Service Desk Tier 1 · clearable', 'https://careers.leidos.com/search/clearance/public-trust/jobs/in'),
    t('Maximus', 'CSR / Help Desk · paid training · WFH after · $14–20/hr', 'https://maximus.avature.net/careers/USHome'),
    t('Amazon OTS', 'IT Support · $23–37/hr · Spokane onsite', 'https://www.amazon.jobs/en/search?base_query=IT+Support&loc_query=Spokane%2C+WA'),
    t('City of Spokane', 'IT classifications · onsite · veteran preference', 'https://www.governmentjobs.com/careers/spokanecity'),
    t('ZipRecruiter · Help Desk (Spokane)', '$19–41/hr · 1-click apply · now hiring', 'https://www.ziprecruiter.com/Jobs/Help-Desk-Technician/-in-Spokane,WA'),
    t('ZipRecruiter · Entry IT Help Desk (Spokane)', 'Entry-level · 1-click apply', 'https://www.ziprecruiter.com/Jobs/Entry-Level-It-Help-Desk/-in-Spokane,WA'),
    t('LinkedIn · Help Desk (Spokane)', '~58 local listings · Easy Apply', 'https://www.linkedin.com/jobs/help-desk-jobs-spokane-wa'),
    t('Indeed · Help Desk Tech (Spokane)', '20+ local openings', 'https://www.indeed.com/q-help-desk-technician-l-spokane,-wa-jobs.html'),
    t('ClearanceJobs · Help Desk (Remote)', 'Cleared / clearable desks', 'https://www.clearancejobs.com/q-help-desk-remote'),
    t('ZipRecruiter · Public Trust Help Desk', 'Clearable govcon · $19–38/hr', 'https://www.ziprecruiter.com/Jobs/Help-Desk-Technician-Public-Trust-Clearance'),
    t('Indeed · Remote Tech Support (Veterans)', 'Vet-friendly · work-from-home', 'https://www.indeed.com/q-remote-tech-support-veterans-jobs.html'),
    t('ZipRecruiter · Entry Remote GRC Analyst', '$26–48/hr · entry-level · now hiring', 'https://www.ziprecruiter.com/Jobs/Entry-Level-Remote-Grc-Analyst'),
    t('Glassdoor · Remote GRC Analyst', '~77 openings (Jun 2026)', 'https://www.glassdoor.com/Job/remote-grc-analyst-jobs-SRCH_IL.0,6_IS11047_KO7,18.htm'),
  ]},
  { id: 'income', label: 'Quick Income', tiles: [
    // Gig apps — start this week, own hours, no interview
    t('DoorDash (Dasher)', 'Gig delivery · start this week · own hours', 'https://dasher.doordash.com/en-us'),
    t('Uber Driver', 'Rideshare/delivery · fast onboarding', 'https://www.uber.com/us/en/drive/'),
    t('Instacart Shopper', 'Grocery gig · flexible', 'https://shoppers.instacart.com/'),
    t('Amazon Flex', 'Package-delivery blocks · Spokane', 'https://flex.amazon.com/'),
    t('Walmart Spark', 'Delivery gig · same-day pay options', 'https://drive4spark.walmart.com/'),
    t('Shipt Shopper', 'Grocery delivery · weekly pay + tips', 'https://www.shipt.com/be-a-shopper/'),
    t('Rover', 'Dog walking / pet sitting · pick your jobs', 'https://www.rover.com/become-a-sitter/'),
    // Same-day shifts (gig-staffing apps) — paid fast
    t('Instawork', 'Same-day shifts · paid fast', 'https://www.instawork.com/'),
    t('Wonolo', 'Next-day gig work · no interview', 'https://www.wonolo.com/find-work'),
    t('Veryable', 'On-demand labor ops · Spokane', 'https://www.veryableops.com/'),
    t('PeopleReady', 'Temp / same-day-pay labor', 'https://www.peopleready.com/job-seekers/'),
    t('TaskRabbit', 'Odd jobs / handy work · set your rate', 'https://www.taskrabbit.com/become-a-tasker'),
    // Monetize your design / tech skills for cash
    t('Craigslist · Creative Gigs', 'Design for cash · Spokane', 'https://spokane.craigslist.org/search/crg'),
    t('Craigslist · Computer Gigs', 'Tech/design skills for $$', 'https://spokane.craigslist.org/search/cpg'),
    t('Craigslist · Writing Gigs', 'Copy / docs for pay', 'https://spokane.craigslist.org/search/wrg'),
    t('Upwork', 'Freelance design / admin gigs', 'https://www.upwork.com/'),
    t('Fiverr', 'List a design service · inbound gigs', 'https://www.fiverr.com/start_selling'),
    // Craigslist local quick-cash
    t('Craigslist · All Gigs (Spokane)', 'Quick-cash gigs', 'https://spokane.craigslist.org/search/ggg'),
    t('Craigslist · Labor Gigs', 'Cash, often same-day', 'https://spokane.craigslist.org/search/lbg'),
  ]},
  { id: 'hirenow', label: 'Hire Now', tiles: [
    // Low-barrier W2 — steady paycheck, fast hire (Spokane)
    t('Amazon · Spokane Warehouse', 'Hiring now · hourly', 'https://www.amazon.jobs/en/search?base_query=warehouse&loc_query=Spokane%2C+WA'),
    t('UPS Package Handler', 'Warehouse · benefits early', 'https://www.jobs-ups.com/'),
    t('FedEx Ground', 'Package handler · Spokane', 'https://careers.fedex.com/'),
    t('Costco · Spokane', 'Hourly · strong pay/benefits', 'https://www.costco.com/jobs.html'),
    t('Target', 'Retail / fulfillment · fast hire', 'https://jobs.target.com/'),
    t('Starbucks', 'Barista · benefits part-time', 'https://www.starbucks.com/careers/'),
    t('Kroger / Fred Meyer', 'Grocery · steady hours', 'https://jobs.kroger.com/'),
    t('URM / Rosauers (Spokane)', 'Local grocery + distribution', 'https://www.google.com/search?q=URM+Rosauers+Spokane+WA+careers'),
    t('Providence (non-clinical)', 'EVS / food / patient access', 'https://www.providence.jobs/'),
    t('Indeed · Hiring Immediately', 'Spokane · posted ≤3 days', 'https://www.indeed.com/jobs?q=hiring+immediately&l=Spokane%2C+WA&fromage=3'),
    t('Indeed · Warehouse (Spokane)', 'Low-barrier · ≤7 days', 'https://www.indeed.com/jobs?q=warehouse&l=Spokane%2C+WA&fromage=7'),
    t('Indeed · Retail (Spokane)', 'Cashier / stock · ≤7 days', 'https://www.indeed.com/jobs?q=retail&l=Spokane%2C+WA&fromage=7'),
    t('Snagajob · Spokane', 'Hourly, fast-apply', 'https://www.snagajob.com/search?q=&w=Spokane%2C+WA'),
    t('Indeed · Remote Customer Service', 'Work-from-home · ≤7 days', 'https://www.indeed.com/jobs?q=customer+service+representative&l=Remote&fromage=7'),
    t('Craigslist · Food/Bev/Hosp Jobs', 'Servers, baristas, kitchen', 'https://spokane.craigslist.org/search/fbh'),
    t('Craigslist · Customer Service Jobs', 'Phones / front desk', 'https://spokane.craigslist.org/search/csr'),
    t('Craigslist · All Jobs (Spokane)', 'Local hiring, all categories', 'https://spokane.craigslist.org/search/jjj'),
  ]},
  { id: 'designtech', label: 'Design Tech', tiles: [
    t('LinkedIn · Design Technologist', 'Remote · all levels', 'https://www.linkedin.com/jobs/search/?keywords=Design%20Technologist&f_WT=2'),
    t('LinkedIn · Design Engineer', 'Design-eng hybrid · remote', 'https://www.linkedin.com/jobs/search/?keywords=Design%20Engineer&f_WT=2'),
    t('LinkedIn · Creative Technologist', 'Prototyping + code · remote', 'https://www.linkedin.com/jobs/search/?keywords=Creative%20Technologist&f_WT=2'),
    t('Indeed · UX Engineer', 'UX + front-end · remote', 'https://www.indeed.com/jobs?q=UX+engineer&l=Remote'),
    t('Google Jobs · Design Engineer', 'Aggregates all boards', 'https://www.google.com/search?q=design+engineer+remote&ibp=htl;jobs'),
    t('Dribbble Jobs', 'Design + design-eng roles', 'https://dribbble.com/jobs'),
    t('Vercel', 'Known for design engineers', 'https://vercel.com/careers'),
    t('Linear', 'Design-eng culture', 'https://linear.app/careers'),
    t('Figma', 'Design tooling; design-eng roles', 'https://www.figma.com/careers/'),
    t('Framer', 'Design + code product team', 'https://www.framer.com/careers/'),
  ]},
  { id: 'aieng', label: 'AI Engineer', tiles: [
    t('LinkedIn · AI Engineer', 'Remote · all levels', 'https://www.linkedin.com/jobs/search/?keywords=AI%20Engineer&f_WT=2'),
    t('LinkedIn · Applied AI Engineer', 'Product-facing AI · remote', 'https://www.linkedin.com/jobs/search/?keywords=Applied%20AI%20Engineer&f_WT=2'),
    t('Indeed · ML Engineer', 'Machine learning · remote', 'https://www.indeed.com/jobs?q=machine+learning+engineer&l=Remote'),
    t('Google Jobs · AI Engineer', 'Aggregates all boards', 'https://www.google.com/search?q=AI+engineer+remote&ibp=htl;jobs'),
    t('Wellfound · AI Engineer', 'Startup AI roles', 'https://wellfound.com/role/r/ai-engineer'),
    t('Y Combinator Startups', 'Work at a Startup — AI', 'https://www.workatastartup.com/companies?industry=ai'),
    t('ai-jobs.net', 'AI/ML-only job board', 'https://ai-jobs.net/'),
    t('Hugging Face', 'Open-source AI; remote-first', 'https://apply.workable.com/huggingface/'),
    t('OpenAI', 'Frontier AI roles', 'https://openai.com/careers/search/'),
    t('Anthropic', 'Frontier AI roles', 'https://www.anthropic.com/careers'),
  ]},
  { id: 'itsupport', label: 'IT Support', tiles: [
    t('Indeed · Help Desk (Remote)', 'Entry · work-from-home', 'https://www.indeed.com/jobs?q=help+desk+entry+level&l=Remote'),
    t('Indeed · IT Support (Remote)', 'Entry support tech', 'https://www.indeed.com/jobs?q=IT+support+entry+level&l=Remote'),
    t('LinkedIn · Help Desk', 'Entry + remote filtered', 'https://www.linkedin.com/jobs/search/?keywords=IT%20help%20desk&f_E=2&f_WT=2'),
    t('ZipRecruiter · Remote Helpdesk', 'Now hiring · 1-click · $19–30/hr', 'https://www.ziprecruiter.com/Jobs/Remote-Helpdesk'),
    t('Dice · Help Desk (Remote)', 'Tech-focused board', 'https://www.dice.com/jobs?q=help%20desk&location=Remote&filters.workplaceTypes=Remote'),
    t('ZipRecruiter · Entry IT Help Desk (Spokane)', 'Local · 1-click apply', 'https://www.ziprecruiter.com/Jobs/Entry-Level-It-Help-Desk/-in-Spokane,WA'),
    t('Indeed · Help Desk (Spokane)', 'Local · ~$19–26/hr', 'https://www.indeed.com/q-it-help-desk-l-spokane,-wa-jobs.html'),
  ]},
  { id: 'grc', label: 'Cyber / GRC', tiles: [
    t('Indeed · GRC Analyst', 'Entry-level GRC · remote', 'https://www.indeed.com/jobs?q=GRC+analyst+entry+level&l=Remote'),
    t('ZipRecruiter · Remote GRC Analyst', 'NIST/ISO/SOC2 · $55–111k', 'https://www.ziprecruiter.com/Jobs/Remote-Grc-Analyst'),
    t('Indeed · SOC Analyst I', 'Tier-1 security ops · remote', 'https://www.indeed.com/jobs?q=SOC+analyst+tier+1&l=Remote'),
    t('Dice · IT Auditor (Entry)', 'Controls + compliance · ~$66–75k', 'https://www.dice.com/jobs/q-entry+level+it+auditor-jobs'),
    t('LinkedIn · GRC', 'Entry + remote filtered', 'https://www.linkedin.com/jobs/search/?keywords=GRC%20analyst&f_E=2&f_WT=2'),
    t('A-LIGN', 'SOC 2 / ISO / FedRAMP — campus/associate', 'https://www.a-lign.com/careers'),
    t('Coalfire', 'Associate consultant · ~$88–100k', 'https://careers.coalfire.com/career-openings'),
    t('Schellman', 'Compliance / attestation · remote associate', 'https://www.schellman.com/careers'),
  ]},
  { id: 'govcon', label: 'Govcon', tiles: [
    t('ClearanceJobs · Help Desk', 'Cleared / clearable desks', 'https://www.clearancejobs.com/jobs?keywords=help%20desk'),
    t('ClearanceJobs · Public Trust', 'Public Trust roles · $45k–206k', 'https://www.clearancejobs.com/jobs/public-trust'),
    t('USAJOBS · IT Support (2210)', 'Federal tier-1 IT · vet preference', 'https://www.usajobs.gov/Search/Results?k=help+desk'),
    t('GDIT', 'Help desk tech · ~$31/hr · large hirer', 'https://www.gdit.com/careers/search/'),
    t('SAIC · Technical Support', 'Tier 1–3 service desk · federal', 'https://jobs.saic.com/search/technical-support/jobs'),
    t('Leidos · Public Trust', 'Cleared service desk roles', 'https://careers.leidos.com/search/clearance/public-trust/jobs'),
    t('Peraton', 'National-security IT support', 'https://www.careers.peraton.com/search-jobs'),
    t('CACI', 'IT help desk · ~$64–108k', 'https://careers.caci.com/global/en/search-results'),
  ]},
  { id: 'spokane', label: 'Spokane', tiles: [
    t('Indeed · Spokane Help Desk', '~50+ local listings · ~$19–26/hr', 'https://www.indeed.com/jobs?q=help+desk&l=Spokane%2C+WA'),
    t('LinkedIn · Spokane IT Support', 'Entry-level · local', 'https://www.linkedin.com/jobs/search/?keywords=IT%20support&location=Spokane%2C%20Washington&f_E=2'),
    t('Numerica Credit Union', 'Local CU careers · Spokane Valley', 'https://www.numericacu.com/careers'),
    t('STCU', 'Spokane Teachers CU · IT/support roles', 'https://stcu.org/here-for-good/about-stcu/careers'),
    t('Providence (Sacred Heart)', 'Health-system IT jobs · Spokane', 'https://providence.jobs/locations/spokane-wa/jobs/'),
    t('F5 (Liberty Lake)', 'Product-dev office · entry tech roles', 'https://www.f5.com/company/careers/locations/spokane'),
    t('Gonzaga University', 'University ITS / help desk', 'https://www.gonzaga.edu/about/offices-services/human-resources/employment'),
    t('Local MSPs', 'Intrinium · Executech · ISOutsource', 'https://www.google.com/search?q=Intrinium+Executech+ISOutsource+Spokane+help+desk+technician+careers'),
  ]},
  { id: 'saas', label: 'SaaS Support', tiles: [
    t('LinkedIn · Support Assoc.', 'SaaS support · entry · remote', 'https://www.linkedin.com/jobs/search/?keywords=associate%20technical%20support&f_E=2&f_WT=2'),
    t('Indeed · SaaS Support (Remote)', 'Work-from-home · ~$23/hr avg', 'https://www.indeed.com/q-saas-support-l-remote-jobs.html'),
    t('Built In · Remote Support', 'Curated tech-startup board', 'https://builtin.com/jobs/remote/customer-success'),
    t('Veeva', 'Tech Customer Support · "Work Anywhere"', 'https://careers.veeva.com/job-search-results/'),
    t('Zapier', 'Fully remote · support roles', 'https://zapier.com/jobs'),
    t('Smartsheet', 'SaaS · remote/hybrid support', 'https://www.smartsheet.com/careers-list'),
    t('HubSpot', 'Customer success/support · remote-friendly', 'https://www.hubspot.com/careers/customer-success/jobs'),
  ]},
  { id: 'remoteboards', label: 'Remote Boards', tiles: [
    t('We Work Remotely', 'Largest remote board · Support', 'https://weworkremotely.com/categories/remote-customer-support-jobs'),
    t('Remote OK', 'Tech + support tags', 'https://remoteok.com/remote-customer-support-jobs'),
    t('Remotive', 'Hand-curated tech/support', 'https://remotive.com/remote-jobs/customer-support'),
    t('Himalayas', 'Great filters · 80k+ jobs', 'https://himalayas.app/jobs'),
    t('Working Nomads', 'Curated daily digests', 'https://www.workingnomads.com/jobs'),
    t('Wellfound', 'Startup roles (ex-AngelList)', 'https://wellfound.com/jobs'),
    t('Jobgether', '100k+ remote, matched', 'https://jobgether.com/'),
    t('Built In', 'Tech incl. security/IT', 'https://builtin.com/jobs/remote'),
  ]},
  { id: 'remotecos', label: 'Remote-First Cos', tiles: [
    t('Automattic', '"Happiness Engineer" — non-traditional backgrounds', 'https://automattic.com/work-with-us/'),
    t('Zapier', 'Support Specialist roles', 'https://zapier.com/jobs'),
    t('Help Scout', 'Customer support', 'https://www.helpscout.com/careers/'),
    t('GitLab', 'Support + ops roles', 'https://about.gitlab.com/jobs/'),
    t('Deel', 'Heavy support / ops hiring', 'https://www.deel.com/careers'),
    t('Gusto', 'Payroll SaaS; customer support', 'https://gusto.com/about/careers'),
    t('Discord', 'Support & Trust/Safety', 'https://discord.com/careers'),
    t('Mercury', 'Fintech; customer support', 'https://mercury.com/jobs'),
    t('Canva', 'Support / customer success', 'https://www.canva.com/careers/'),
  ]},
  { id: 'seccos', label: 'Security / GRC Cos', tiles: [
    t('Vanta', 'SOC 2/ISO compliance automation', 'https://www.vanta.com/careers'),
    t('Drata', 'Compliance automation; GRC/CS', 'https://drata.com/careers'),
    t('Secureframe', 'Compliance automation', 'https://secureframe.com/careers'),
    t('Wiz', 'Cloud security', 'https://www.wiz.io/careers'),
    t('CrowdStrike', 'Endpoint security; remote-friendly', 'https://www.crowdstrike.com/careers/'),
    t('SailPoint', 'Identity security / IGA', 'https://www.sailpoint.com/company/careers'),
    t('BigID', 'Data security & governance', 'https://bigid.com/careers/'),
  ]},
  { id: 'staffing', label: 'Staffing', tiles: [
    t('TEKsystems', 'Largest IT staffing firm', 'https://www.teksystems.com/en/search-jobs'),
    t('Robert Half', 'Help desk / desktop', 'https://www.roberthalf.com/us/en/jobs?keywords=help%20desk'),
    t('Insight Global', 'High-volume contracts', 'https://jobs.insightglobal.com/find_a_job/'),
    t('Apex Systems', 'Big IT contract shop', 'https://www.apexsystems.com/job-seekers'),
    t('Akkodis', 'Tech contract + perm', 'https://www.akkodis.com/en-us/jobs'),
    t('Humanix', 'Spokane-based staffing firm', 'https://www.humanix.com/'),
    t('Express Employment', 'Local branch placement', 'https://www.expresspros.com/'),
    t('Orion Talent', 'Military-to-civilian recruiters', 'https://www.oriontalent.com/'),
    t('Hire Heroes USA', 'Free vet career coaching + intros', 'https://www.hireheroesusa.org/'),
    t('ClearanceJobs Profile', 'Build a profile — cleared recruiters find you', 'https://www.clearancejobs.com/'),
  ]},
  { id: 'veteran', label: 'Veteran', tiles: [
    t('RecruitMilitary', 'Vet-focused IT roles', 'https://recruitmilitary.com/jobs?keywords=help%20desk'),
    t('Hiring Our Heroes', 'Fellowships + jobs', 'https://www.hiringourheroes.org/'),
    t('Military.com Jobs', 'Broad vet board', 'https://www.military.com/veteran-jobs'),
    t('VetJobs', 'Placement + coaching', 'https://vetjobs.org/'),
  ]},
  { id: 'skillup', label: 'Skill-Up', tiles: [
    t('Onward to Opportunity', 'Free online IT/cyber + cert', 'https://ivmf.syracuse.edu/programs/career-training/o2o-admission/onward-to-opportunity-application/'),
    t('Apprenti · Assessment', 'Take the test to join the pool', 'https://apprenticareers.org/career-seeker/'),
    t('CompTIA A+', 'Unlocks help-desk filters (do this first)', 'https://www.comptia.org/certifications/a'),
    t('CompTIA Security+', 'Gates cleared 8570 desks', 'https://www.comptia.org/certifications/security'),
    t('Professor Messer', 'Free A+/Network+/Security+ training', 'https://www.professormesser.com/'),
    t('Google IT Support Cert', 'Job-ready help-desk foundation', 'https://www.coursera.org/professional-certificates/google-it-support'),
    t('ISC2 CC', 'Entry cyber cert', 'https://www.isc2.org/certifications/cc'),
  ]},
  { id: 'tools', label: 'Tools', tiles: [
    t('Levels.fyi', 'Tech compensation data', 'https://www.levels.fyi/'),
    t('Glassdoor Salaries', 'Role + company pay ranges', 'https://www.glassdoor.com/Salaries/index.htm'),
    t('Jobscan', 'Match your resume to a job — beat filters', 'https://www.jobscan.co/'),
    t('Novoresume', 'ATS-friendly resume builder', 'https://novoresume.com/'),
    t('Big Interview', 'Practice + answer frameworks', 'https://biginterview.com/'),
  ]},
];
