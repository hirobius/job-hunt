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
  /** Default search location label (onboarding can override it). */
  location: string;
  /** Curated groups seeded into the new track, in order. */
  groups: Group[];
  /** Company board urls seeded as the track's "Watched companies" (src/radar/directory.ts). */
  boards: readonly string[];
  /** Target companies seeded as the track's outreach targets (#198); most packs have none. */
  targets?: readonly PackCompany[];
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
  location: '',
  groups: pick('sm-brief', 'smshops', 'machineshops'),
  boards: DIRECTORY_BY_PACK.trades,
};

// Titles first: the Live postings feed searches the first title on open. The token / design-
// technologist titles come from Adrian's 2026-10 search (AI-ready tokens + MCP angle).
const DESIGN_SYSTEMS_TITLES = [
  'Design Systems Engineer',
  'Design Systems Lead',
  'Design Technologist',
  'Design System Technologist',
  'Design Systems Designer',
  'Design Systems Architect',
  'Token Architect',
  'Design Engineer',
  'Staff Design Engineer',
  'Design Systems Manager',
  'UI Platform Engineer',
  'Frontend Platform Engineer',
  'Design Infrastructure Engineer',
  'UI Engineer',
  'Component Library Engineer',
  'Frontend Engineer',
  'Staff Frontend Engineer',
  'Product Designer',
  // #198: the senior searches, phrase-matched so they catch designer and engineer titles alike.
  'Staff Design Systems',
  'Principal Design Systems',
];
const DESIGN_SYSTEMS_ATS_ROLES = [
  'design systems',
  'design systems lead',
  'design system technologist',
  'design technologist',
  'design tokens',
  'token architect',
  'design engineer',
  'UI platform',
  'design infrastructure',
  'component library',
  'frontend engineer',
  'UI engineer',
];

// ---- Design Systems / Design Eng (remote, experienced) ----
export const DESIGN_SYSTEMS_PACK: PackContent = {
  id: 'designsystems',
  label: 'Design Systems',
  titles: DESIGN_SYSTEMS_TITLES,
  atsRoles: DESIGN_SYSTEMS_ATS_ROLES,
  seniority: 'experienced',
  location: 'Remote',
  groups: pick('ds-brief', 'ds-watch'),
  boards: DIRECTORY_BY_PACK.designsystems,
  targets: TARGETS_BY_PACK.designsystems,
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
  location: 'Remote',
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
  location: 'Remote',
  groups: pick('sn-brief'),
  boards: DIRECTORY_BY_PACK.servicenow,
};
