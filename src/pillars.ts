// Career pillars — a pillar is a named trade the user is job-hunting in, with its own
// search terms, seniority stance, and curated Discover groups. The app ships built-in
// trades pillars (sheet metal leads); users can curate their own. Discover reads the
// active pillar (see pillarStore.ts).
import { GROUPS, TITLES, ATS_ROLES, type Group } from './jobsData';

export type Seniority = 'entry' | 'experienced' | 'any';

export interface Pillar {
  id: string;
  label: string;
  /** Title-search chips. */
  titles: string[];
  /** ATS hidden-jobs search terms. */
  atsRoles: string[];
  /** Drives entry-level filtering and the ATS junior/associate clause. */
  seniority: Seniority;
  /** Default search location label (e.g. "Spokane, WA", "Remote"). */
  location: string;
  /** Reserved: default target role for AI tailoring (wired in a later chunk). */
  tailorRole?: string;
  /** Curated Discover groups; groups[0] is the pillar's "Apply Now" featured tab. */
  groups: Group[];
  /** Shipped with the app (vs a user-created pillar). */
  builtIn?: boolean;
}

const byId: Record<string, Group> = Object.fromEntries(GROUPS.map((g) => [g.id, g]));
const pick = (...ids: string[]): Group[] => ids.map((id) => byId[id]).filter(Boolean);

// Cross-cutting groups shown in EVERY pillar: survival income + universal job tools.
export const CROSS_CUTTING_GROUPS: Group[] = pick('income', 'hirenow', 'veteran', 'tools');

// ---- Sheet Metal & Fab (the front-and-center default) ----
export const SHEET_METAL_PILLAR: Pillar = {
  id: 'sheetmetal',
  label: 'Sheet Metal & Fab',
  titles: TITLES, // sheet-metal / fab / welder titles live in jobsData
  atsRoles: ATS_ROLES,
  seniority: 'entry',
  location: 'Spokane, WA',
  tailorRole: 'Sheet Metal Fabricator',
  groups: pick('sm-brief', 'smshops', 'machineshops'),
  builtIn: true,
};

const WELDING_TITLES = [
  'Welder',
  'MIG Welder',
  'TIG Welder',
  'Combo Welder',
  'Welder-Fabricator',
  'CNC Machinist',
  'CNC Operator',
  'Machinist',
  'Machine Operator',
  'Maintenance Technician',
];
const WELDING_ATS_ROLES = ['welder', 'CNC machinist', 'machinist', 'machine operator', 'fabricator'];

// ---- Welding & Machining ----
export const WELDING_PILLAR: Pillar = {
  id: 'welding',
  label: 'Welding & Machining',
  titles: WELDING_TITLES,
  atsRoles: WELDING_ATS_ROLES,
  seniority: 'entry',
  location: 'Spokane, WA',
  tailorRole: 'Welder-Fabricator',
  groups: pick('weld-brief', 'machineshops', 'concrete'),
  builtIn: true,
};

const CONSTRUCTION_TITLES = [
  'Apprentice',
  'Ironworker',
  'Carpenter Apprentice',
  'Cement Mason',
  'Concrete Finisher',
  'HVAC Installer',
  'Heavy Equipment Operator',
  'Construction Laborer',
  'Boilermaker',
  'Plumber Apprentice',
];
const CONSTRUCTION_ATS_ROLES = ['apprentice', 'laborer', 'HVAC installer', 'concrete finisher', 'ironworker'];

// ---- Construction Trades (union JATCs + non-union portals) ----
export const CONSTRUCTION_PILLAR: Pillar = {
  id: 'construction',
  label: 'Construction Trades',
  titles: CONSTRUCTION_TITLES,
  atsRoles: CONSTRUCTION_ATS_ROLES,
  seniority: 'entry',
  location: 'Spokane, WA',
  tailorRole: 'Construction Apprentice',
  groups: pick('const-brief', 'unions', 'concrete'),
  builtIn: true,
};

export const BUILTIN_PILLARS: Pillar[] = [
  SHEET_METAL_PILLAR,
  WELDING_PILLAR,
  CONSTRUCTION_PILLAR,
];
