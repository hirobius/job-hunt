// TEMPORARY, ONE-TIME TOOL (epic #30, issue #33) — seeds the app's current hardcoded curated
// content (BUILTIN_PILLARS in ../pillars.ts + the Apprenticeships board in ../apprenticeships.ts)
// into the SIGNED-IN caller's account via the curation data layer's own mutators
// (addCategory/addGroup/addTile — see ./curationStore.ts), which persist locally AND upsert to
// Supabase for a signed-in user. Once that content becomes real DB rows for every account that
// needs it, this file (and its trigger in App.tsx) gets deleted in the PR that strips the
// pillars.ts / apprenticeships.ts constants themselves. Self-contained: no other module depends
// on this one.
import { BUILTIN_PILLARS } from '../pillars';
import { APPRENTICESHIP_GROUPS } from '../apprenticeships';
import type { Group as SourceGroup } from '../jobsData';
import { addCategory, addGroup, addTile, getCurationState } from './curationStore';

/** Label for the one extra category the standalone Apprenticeships board imports into. */
const APPRENTICESHIPS_CATEGORY_LABEL = 'Spokane Apprenticeships';

export interface ImportStarterResult {
  status: 'imported' | 'already-imported';
  categories: number;
  groups: number;
  tiles: number;
}

/** Maps one source Group[] (a pillar's curated groups, or the apprenticeships board) into
 *  curation Groups + Tiles under `categoryId`, preserving source order via sortOrder. Mutates
 *  the passed counters object so the caller gets one running total across every category. */
function importGroups(
  categoryId: string,
  sourceGroups: SourceGroup[],
  counts: { groups: number; tiles: number },
): void {
  sourceGroups.forEach((g, groupIndex) => {
    const groupId = addGroup(categoryId, {
      label: g.label,
      sortOrder: groupIndex,
      archived: !!g.archived,
    });
    counts.groups++;
    g.tiles.forEach((t, tileIndex) => {
      addTile(groupId, {
        name: t.name,
        url: t.url,
        meta: t.meta,
        sortOrder: tileIndex,
      });
      counts.tiles++;
    });
  });
}

/**
 * Seeds BUILTIN_PILLARS (each → a Category, its groups → Groups/Tiles) plus the Apprenticeships
 * board (→ one more Category) into the curation store. Idempotent: if the store already holds
 * any categories — from a prior import, or real user curation — this no-ops and reports
 * 'already-imported' rather than risk a double-import.
 */
export function importStarterContent(): ImportStarterResult {
  if (getCurationState().categories.length > 0) {
    return { status: 'already-imported', categories: 0, groups: 0, tiles: 0 };
  }

  const counts = { groups: 0, tiles: 0 };
  let categories = 0;
  let sortOrder = 0;

  for (const pillar of BUILTIN_PILLARS) {
    const categoryId = addCategory({
      label: pillar.label,
      titles: pillar.titles,
      atsRoles: pillar.atsRoles,
      seniority: pillar.seniority,
      location: pillar.location,
      tailorRole: null,
      sortOrder: sortOrder++,
    });
    categories++;
    importGroups(categoryId, pillar.groups, counts);
  }

  const apprenticeshipsCategoryId = addCategory({
    label: APPRENTICESHIPS_CATEGORY_LABEL,
    titles: [],
    atsRoles: [],
    seniority: 'entry',
    location: 'Spokane, WA',
    tailorRole: null,
    sortOrder,
  });
  categories++;
  importGroups(apprenticeshipsCategoryId, APPRENTICESHIP_GROUPS, counts);

  return { status: 'imported', categories, groups: counts.groups, tiles: counts.tiles };
}
