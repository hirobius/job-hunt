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
    t('Numerica Credit Union', 'IT Specialist 1 · $28–43/hr · qualify now', 'https://www.numericacu.com/careers'),
    t('Maximus', 'Help Desk (CMS) · ~$18–20/hr · Public Trust', 'https://maximus.avature.net/careers/Job-Search'),
    t('Ellumen', 'JOMIS Service Desk · no IT exp required', 'https://www.ellumen.com/careers'),
    t('SAIC', 'IT Service Desk Analyst · up to $40k · Public Trust', 'https://jobs.saic.com/jobs/17740015-it-service-desk-analyst'),
    t('SAIC · FAA', 'Service Desk Agent · able to obtain Public Trust', 'https://jobs.saic.com/jobs/17637953-service-desk-agent'),
    t('Koniag (KTIS)', 'Tier 1 · 3rd shift · able to obtain Public Trust', 'https://www.clearancejobs.com/jobs/8766398'),
    t('Computer Performance Unltd', 'Help Desk Tier 1 (MSP) · ~$19–26/hr', 'https://www.google.com/search?q=Computer+Performance+Unlimited+Spokane+Help+Desk+Tier+1+careers'),
    t('Amazon OTS', 'IT Support · $23–37/hr · Spokane onsite', 'https://www.amazon.jobs/en/search?base_query=IT+Support&loc_query=Spokane%2C+WA'),
    t('Amazon Apprenticeship', 'Technical Apprenticeship · ≥$51k · veterans', 'https://www.amazon.jobs/en/search?base_query=military+technical+apprenticeship'),
    t('Concentrix', 'Tech Support Rep · ~$18–20/hr · trains from scratch', 'https://jobs.concentrix.com'),
    t('City of Spokane', 'IT classifications · onsite · veteran preference', 'https://www.governmentjobs.com/careers/spokanecity'),
    t('Spokane County', 'IT Support / Specialist · onsite', 'https://www.spokanecounty.gov/Jobs.aspx'),
    t('Goodwill INW', 'IT Support Technician · verify still open', 'https://discovergoodwill.applicantpro.com/jobs/'),
    t('Conduent', 'Technical Helpdesk Analyst I · confirm WA', 'https://careers.conduent.com/us/en'),
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
    t('Indeed · Help Desk', 'Entry, work-from-home', 'https://www.indeed.com/jobs?q=help+desk+entry+level&l=Remote'),
    t('Indeed · IT Support', 'Entry support tech', 'https://www.indeed.com/jobs?q=IT+support+entry+level&l=Remote'),
    t('LinkedIn · Help Desk', 'Entry + remote filtered', 'https://www.linkedin.com/jobs/search/?keywords=IT%20help%20desk&f_E=2&f_WT=2'),
    t('ZipRecruiter · IT Support', '1-click apply', 'https://www.ziprecruiter.com/Jobs/Entry-Level-Remote-It-Support'),
    t('Dice · Help Desk', 'Tech-focused board', 'https://www.dice.com/jobs?q=help%20desk&location=Remote&filters.workplaceTypes=Remote'),
  ]},
  { id: 'grc', label: 'Cyber / GRC', tiles: [
    t('Indeed · GRC Analyst', 'Entry-level GRC', 'https://www.indeed.com/jobs?q=GRC+analyst+entry+level&l=Remote'),
    t('Indeed · SOC Analyst I', 'Tier-1 security ops', 'https://www.indeed.com/jobs?q=SOC+analyst+tier+1&l=Remote'),
    t('LinkedIn · GRC', 'Entry + remote filtered', 'https://www.linkedin.com/jobs/search/?keywords=GRC%20analyst&f_E=2&f_WT=2'),
    t('A-LIGN', 'FedRAMP/SOC 2 — associate roles', 'https://www.a-lign.com/careers'),
    t('Coalfire', 'Associate consultant track', 'https://coalfire.com/company/careers'),
    t('Schellman', 'Associate IT auditor', 'https://www.schellman.com/careers'),
    t('ClearanceJobs · ISSO', 'ISSO / security support', 'https://www.clearancejobs.com/jobs?keywords=ISSO'),
  ]},
  { id: 'govcon', label: 'Govcon', tiles: [
    t('ClearanceJobs', 'Cleared / clearable roles', 'https://www.clearancejobs.com/jobs?keywords=help%20desk'),
    t('USAJOBS · Federal', 'IT Specialist 2210; vet preference', 'https://www.usajobs.gov/Search/Results?k=help+desk'),
    t('GDIT', 'Large service-desk hirer', 'https://gdit.com/careers/'),
    t('SAIC', 'Help Desk Agent I & up', 'https://jobs.saic.com/'),
    t('CACI', 'Support + RMF-adjacent', 'https://careers.caci.com/'),
    t('Leidos', 'Service desk + security', 'https://careers.leidos.com/'),
    t('Peraton', 'Federal service desk', 'https://careers.peraton.com/'),
    t('Booz Allen', 'Support → security tracks', 'https://careers.boozallen.com/'),
  ]},
  { id: 'spokane', label: 'Spokane', tiles: [
    t('Indeed · Spokane Help Desk', '~50+ local listings', 'https://www.indeed.com/jobs?q=help+desk&l=Spokane%2C+WA'),
    t('ZipRecruiter · Spokane', '1-click apply, local', 'https://www.ziprecruiter.com/Jobs/Help-Desk-Technician/-in-Spokane,WA'),
    t('LinkedIn · Spokane', 'Entry-level, local', 'https://www.linkedin.com/jobs/search/?keywords=IT%20support&location=Spokane%2C%20Washington&f_E=2'),
    t('F5 (Spokane office)', 'Desktop Support roles', 'https://careers.f5.com/'),
    t('CHAS Health', 'Service Desk Technician', 'https://www.google.com/search?q=CHAS+Health+Spokane+service+desk+IT+careers'),
    t('Kalispel Tribe', 'IT Client Support', 'https://www.google.com/search?q=Kalispel+Tribe+Airway+Heights+IT+client+support+careers'),
    t('Local MSPs', 'Executech · ISOutsource · K2', 'https://www.google.com/search?q=Executech+ISOutsource+K2+Spokane+help+desk+technician+careers'),
  ]},
  { id: 'saas', label: 'SaaS Support', tiles: [
    t('LinkedIn · Support Assoc.', 'SaaS support, entry', 'https://www.linkedin.com/jobs/search/?keywords=associate%20technical%20support&f_E=2&f_WT=2'),
    t('Veeva Systems', 'Tech Customer Service Assoc.', 'https://careers.veeva.com/'),
    t('Panopto', 'Support Analyst I', 'https://www.panopto.com/about/careers/'),
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
