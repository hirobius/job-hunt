// The tile-board view rule, in one pure place: given a list of tiles and the current triage,
// split into the VISIBLE set (set-aside removed, floated tiles to the top, order otherwise
// preserved) and the SET-ASIDE list. Floating = SAVED to the queue (issue #13 consolidated
// the old explicit pin into Save: one "I care" gesture) — legacy pins still float so nobody's
// old triage silently un-floats.
import { useMemo } from 'react';
import type { Tile } from './jobsData';
import { useTileTriage, type Triage } from './tileTriage';

export function partitionTiles(
  tiles: Tile[],
  triage: Triage,
  saved?: ReadonlySet<string>,
): { visible: Tile[]; aside: Tile[] } {
  const pinned = new Set(triage.pinned);
  const dismissed = new Set(triage.dismissed);
  const floats = (t: Tile) => pinned.has(t.url) || !!saved?.has(t.url);
  const visible = tiles
    .filter((t) => !dismissed.has(t.url))
    .slice()
    .sort((a, b) => (floats(a) ? 0 : 1) - (floats(b) ? 0 : 1));
  const aside = tiles.filter((t) => dismissed.has(t.url));
  return { visible, aside };
}

/** Hook form: partition a tile list against the live triage state, memoized. */
export function useTileState(tiles: Tile[]): { visible: Tile[]; aside: Tile[] } {
  const triage = useTileTriage();
  return useMemo(() => partitionTiles(tiles, triage), [tiles, triage]);
}
