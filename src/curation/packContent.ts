// Starter-pack content — the search terms + curated groups each onboarding pack seeds (#59).
// Owned by the curation layer (moved out of the retired pillars module, #98/#99): a pack is just
// data that `seedPack` forks into the user's own editable Category/Group/Tile rows.
import { GROUPS, TITLES, ATS_ROLES, type Group } from '../jobsData';
import { DIRECTORY_BY_PACK, TARGETS_BY_PACK, type PackCompany } from '../radar/directory';
import type { Seniority } from './types';

export interface PackContent {
  id: string;
  label: string;
  /** Title-search chips. */
  titles: string[];
  /** ATS hidden-jobs search terms. */
  atsRoles: string[];
  seniority: Seniority;
  /** Curated groups seeded into the new track, in order. */
  groups: Group[];
  /** Company board urls seeded as the track's "Watched companies" (src/radar/directory.ts). */
  boards: readonly string[];
  /** Target companies seeded as the track's outreach targets (#198); most packs have none. */
  targets?: readonly PackCompany[];
  /** The track's must-include terms (feed/mustInclude.ts), set when it is seeded. */
  mustInclude?: readonly string[];
  /** Must include looks in the title only (the description toggle starts off). */
  mustIncludeTitleOnly?: boolean;
}

const byId: Record<string, Group> = Object.fromEntries(GROUPS.map((g) => [g.id, g]));
const pick = (...ids: string[]): Group[] => ids.map((id) => byId[id]).filter(Boolean);

// ---- Skilled Trades (sheet metal / welding / fab; entry-level) ----
export const TRADES_PACK: PackContent = {
  id: 'sheetmetal',
  label: 'Sheet Metal & Fab',
  titles: TITLES, // sheet-metal / fab / welder titles live in jobsData
  atsRoles: ATS_ROLES,
  seniority: 'entry',
  groups: pick('sm-brief', 'smshops', 'machineshops'),
  boards: DIRECTORY_BY_PACK.trades,
};

// ---- Contracts (#275): federal solicitations from SAM.gov, by NAICS code, not by title ----
// No titles, ATS roles, sections or boards: Live postings reads SAM.gov through /api/sam with the
// track's NAICS codes (feed/mustInclude.ts `naics`, DEFAULT_NAICS until edited) and location.
export const CONTRACTS_PACK: PackContent = {
  id: 'contracts',
  label: 'Contracts',
  titles: [],
  atsRoles: [],
  seniority: 'any',
  groups: [],
  boards: [],
};

// Titles first: the Live postings feed searches the first title on open. Systems-only (Adrian
// 2026-10-23: "if the posting doesn't have 'systems' in the title or the main description, I have
// zero interest"): no generic Design Engineer, UX Engineer, Product Designer or Frontend titles,
// and the pack's must-include rule hides any posting that never says the phrase "design system(s)"
// (2026-10-23: no "UI Systems" either). ATS queries quote each role (jobsData.titleClause).
const DESIGN_SYSTEMS_TITLES = [
  'Design Systems Engineer',
  'Design Systems Designer',
  'Design Systems Lead',
  'Design Systems Manager',
  'Design Systems Architect',
  'Design Systems Technologist',
  // #198: the senior searches, phrase-matched so they catch designer and engineer titles alike.
  'Staff Design Systems',
  'Principal Design Systems',
];
const DESIGN_SYSTEMS_ATS_ROLES = [
  'design systems',
  'design systems designer',
  'design systems engineer',
  'design systems lead',
  'design systems manager',
  'design system technologist',
];

// ---- Design Systems (remote, experienced; systems roles only) ----
export const DESIGN_SYSTEMS_PACK: PackContent = {
  id: 'designsystems',
  label: 'Design Systems',
  titles: DESIGN_SYSTEMS_TITLES,
  atsRoles: DESIGN_SYSTEMS_ATS_ROLES,
  seniority: 'experienced',
  groups: pick('ds-brief', 'ds-watch'),
  boards: DIRECTORY_BY_PACK.designsystems,
  targets: TARGETS_BY_PACK.designsystems,
  mustInclude: ['design system'],
  mustIncludeTitleOnly: true,
};

const CONSULTING_TITLES = [
  'Implementation Consultant',
  'Implementation Specialist',
  'Implementation Manager',
  'Onboarding Specialist',
  'Solutions Consultant',
  'Professional Services Consultant',
  'Technical Consultant',
  'Deployment Engineer',
  'Application Consultant',
  'Customer Onboarding Manager',
];
const CONSULTING_ATS_ROLES = [
  'implementation consultant',
  'implementation specialist',
  'onboarding specialist',
  'solutions consultant',
  'professional services',
  'technical consultant',
];

// ---- Implementation Consulting (software implementation / onboarding / pro services) ----
export const CONSULTING_PACK: PackContent = {
  id: 'consulting',
  label: 'Implementation Consulting',
  titles: CONSULTING_TITLES,
  atsRoles: CONSULTING_ATS_ROLES,
  seniority: 'experienced',
  groups: pick('ic-brief'),
  boards: DIRECTORY_BY_PACK.consulting,
};

const SERVICENOW_TITLES = [
  'ServiceNow Developer',
  'ServiceNow Administrator',
  'ServiceNow Implementation Consultant',
  'ServiceNow Technical Consultant',
  'ServiceNow Business Analyst',
  'ServiceNow Architect',
  'ServiceNow Consultant',
  'ServiceNow Engineer',
  'ITSM Consultant',
  'ServiceNow Platform Owner',
];
const SERVICENOW_ATS_ROLES = [
  'servicenow developer',
  'servicenow administrator',
  'servicenow consultant',
  'servicenow implementation',
  'servicenow architect',
  'ITSM',
];

// ---- ServiceNow (platform-specific; any seniority so it doesn't over-filter the ladder) ----
export const SERVICENOW_PACK: PackContent = {
  id: 'servicenow',
  label: 'ServiceNow',
  titles: SERVICENOW_TITLES,
  atsRoles: SERVICENOW_ATS_ROLES,
  seniority: 'any',
  groups: pick('sn-brief'),
  boards: DIRECTORY_BY_PACK.servicenow,
};
