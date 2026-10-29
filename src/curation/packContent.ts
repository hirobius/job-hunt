// Starter-pack content — the search terms + curated groups the pack seeds (#59). Design systems
// only (Adrian 2026-10-29; src/dsOnly.test.ts).
// Owned by the curation layer (moved out of the retired pillars module, #98/#99): a pack is just
// data that `seedPack` forks into the user's own editable Category/Group/Tile rows.
import { GROUPS, type Group } from '../jobsData';
import { DIRECTORY_BY_PACK, TARGETS_BY_PACK, type PackCompany } from '../radar/directory';
import type { Seniority } from './types';
import { DESIGN_SYSTEMS_ATS_ROLES, DESIGN_SYSTEMS_TITLES } from '../searchDefaults';

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
  /** Target companies seeded as the track's outreach targets (#198). */
  targets?: readonly PackCompany[];
  /** The track's must-include terms (feed/mustInclude.ts), set when it is seeded. */
  mustInclude?: readonly string[];
  /** Must include looks in the title only (the description toggle starts off). */
  mustIncludeTitleOnly?: boolean;
}

const byId: Record<string, Group> = Object.fromEntries(GROUPS.map((g) => [g.id, g]));
const pick = (...ids: string[]): Group[] => ids.map((id) => byId[id]).filter(Boolean);

// Titles first: the Live postings feed searches the first title on open. Systems-only (Adrian
// 2026-10-23: "if the posting doesn't have 'systems' in the title or the main description, I have
// zero interest"): no generic Design Engineer, UX Engineer, Product Designer or Frontend titles,
// and the pack's must-include rule hides any posting that never says the phrase "design system(s)"
// (2026-10-23: no "UI Systems" either). ATS queries quote each role (jobsData.titleClause).

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
