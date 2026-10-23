// The one-time move of an existing Design Systems track to systems-only (Adrian 2026-10-23: "if the
// posting doesn't have 'systems' in the title or in the main description, I have zero interest").
// A track whose label belongs to the pack (packIdForLabel) and has no must-include entry yet gets
// "systems", and its sweep titles and ATS roles that never say system are switched off, not
// deleted: each can be ticked again (Calibrate, Manage track). Nothing else changes: no tile, link
// or watched company is touched. Runs after sync settles (App's SystemsOnlyMigration), so a
// second device finds the entry already synced and does nothing; an entry the user emptied stays
// empty.
import { packIdForLabel } from '../curation/starterPacks';
import type { Category } from '../curation/types';
import { termRegex } from './match';
import { hasMustInclude, setMustInclude } from './mustInclude';
import { switchOffTitles } from './sweepTitles';

export const SYSTEMS_ONLY_NOTICE =
  'Design Systems track now shows only systems roles. Change in Calibrate.';

const SYSTEM = termRegex('system')!;
export const saysSystem = (s: string) => SYSTEM.test(s);

/** Move every Design Systems track not yet moved. Returns how many it moved (0 = nothing to say). */
export function migrateSystemsOnly(
  categories: Pick<Category, 'id' | 'label' | 'titles' | 'atsRoles'>[],
): number {
  let moved = 0;
  for (const cat of categories) {
    if (packIdForLabel(cat.label) !== 'designsystems' || hasMustInclude(cat.id)) continue;
    setMustInclude(cat.id, {
      terms: ['systems'],
      atsOff: cat.atsRoles.filter((r) => !saysSystem(r)),
    });
    // The sweep's list is seeded from the track's titles, else its ATS roles (DiscoverView).
    switchOffTitles(cat.id, cat.titles.length ? cat.titles : cat.atsRoles, saysSystem);
    moved++;
  }
  return moved;
}
