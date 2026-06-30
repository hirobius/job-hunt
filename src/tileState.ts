// The tile-board view rule, in one pure place: given a list of tiles and the current triage,
// split into the VISIBLE set (set-aside removed, pinned floated to the top, order otherwise
// preserved) and the SET-ASIDE list. Previously this filter/sort lived inline in the views.
import { useMemo } from 'react';
import type { Tile } from './jobsData';
import { useTileTriage, type Triage } from './tileTriage';

export function partitionTiles(tiles: Tile[], triage: Triage): { visible: Tile[]; aside: Tile[] } {
  const pinned = new Set(triage.pinned);
  const dismissed = new Set(triage.dismissed);
  const visible = tiles
    .filter((t) => !dismissed.has(t.url))
    .slice()
    .sort((a, b) => (pinned.has(a.url) ? 0 : 1) - (pinned.has(b.url) ? 0 : 1));
  const aside = tiles.filter((t) => dismissed.has(t.url));
  return { visible, aside };
}

/** Hook form: partition a tile list against the live triage state, memoized. */
export function useTileState(tiles: Tile[]): { visible: Tile[]; aside: Tile[] } {
  const triage = useTileTriage();
  return useMemo(() => partitionTiles(tiles, triage), [tiles, triage]);
}
