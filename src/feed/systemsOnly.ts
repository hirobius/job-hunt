// The one-time move of an existing Design Systems track to systems-only (Adrian 2026-10-23: "if the
// posting doesn't have 'systems' in the title or in the main description, I have zero interest").
// A track whose label belongs to the pack (packIdForLabel) and has no must-include entry yet gets
// "systems", and its sweep titles and ATS roles that never say system are switched off, not
// deleted: each can be ticked again (Calibrate, Manage track). Nothing else changes: no tile, link
// or watched company is touched. Runs after sync settles (App's SystemsOnlyMigration), so a
// second device finds the entry already synced and does nothing; an entry the user emptied stays
// empty.
// Phrase move (2026-10-23, "'design system' needs to be worded exactly that way"): the bare
// "systems" this move added becomes the phrase "design system", once per track (marked `phrase`),
// leaving every other term alone, and it matches in the title only (Adrian: "roles that have
// 'design system' in the title"; the description is an opt-in toggle). New moves do the same.
import { packIdForLabel } from '../curation/starterPacks';
import type { Category } from '../curation/types';
import { getAllMustInclude, hasMustInclude, saysDesignSystem, setMustInclude } from './mustInclude';
import { switchOffTitles } from './sweepTitles';

export const SYSTEMS_ONLY_NOTICE =
  'Design Systems track now shows only roles that say "design system". Change in Calibrate.';

export const DESIGN_SYSTEM = 'design system';
export const saysSystem = saysDesignSystem;

/** Swap the bare "systems" the first move added for "design system". True when it changed one. */
function movePhrase(categoryId: string): boolean {
  const m = getAllMustInclude()[categoryId];
  if (!m || m.phrase) return false;
  const had = m.terms.some((t) => t.toLowerCase() === 'systems');
  const terms = m.terms.flatMap((t) => (t.toLowerCase() === 'systems' ? [DESIGN_SYSTEM] : [t]));
  setMustInclude(categoryId, { terms, phrase: true, inText: false });
  return had;
}

/** Move every Design Systems track not yet moved. Returns how many it moved (0 = nothing to say). */
export function migrateSystemsOnly(
  categories: Pick<Category, 'id' | 'label' | 'titles' | 'atsRoles'>[],
): number {
  let moved = 0;
  for (const cat of categories) {
    if (packIdForLabel(cat.label) !== 'designsystems') continue;
    if (hasMustInclude(cat.id)) {
      if (movePhrase(cat.id)) moved++;
      continue;
    }
    setMustInclude(cat.id, {
      terms: [DESIGN_SYSTEM],
      phrase: true,
      inText: false,
      atsOff: cat.atsRoles.filter((r) => !saysSystem(r)),
    });
    // The sweep's list is seeded from the track's titles, else its ATS roles (DiscoverView).
    switchOffTitles(cat.id, cat.titles.length ? cat.titles : cat.atsRoles, saysSystem);
    moved++;
  }
  return moved;
}
