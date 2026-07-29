// The tile-board view rule, in one pure place: given a list of tiles and the current triage,
// split into the VISIBLE set, the SET-ASIDE list, and the SAVED list.
//   - SAVED (already in the queue) tiles are REMOVED from the board entirely (issue #57): once
//     you're pursuing a posting, the browse surface's job for it is done. Returned as `saved`
//     so callers can show a "N saved → in your Queue" note. This also gives cross-track dedup
//     for free — a job saved under one track can't resurface under another.
//   - SET-ASIDE (dismissed) tiles drop into `aside`.
//   - Legacy pins still float to the top of what remains, so nobody's old triage un-floats
//     (the pin UI is retired — issue #13; the data path is issue #19).
import { useMemo } from 'react';
import type { Tile } from './jobsData';
import { useTileTriage, type Triage } from './tileTriage';

export function partitionTiles(
  tiles: Tile[],
  triage: Triage,
  saved?: ReadonlySet<string>,
): { visible: Tile[]; aside: Tile[]; saved: Tile[] } {
  const pinned = new Set(triage.pinned);
  const dismissed = new Set(triage.dismissed);
  const savedTiles: Tile[] = [];
  const rest: Tile[] = [];
  for (const t of tiles) {
    if (saved?.has(t.url)) savedTiles.push(t);
    else rest.push(t);
  }
  const visible = rest
    .filter((t) => !dismissed.has(t.url))
    .slice()
    .sort((a, b) => (pinned.has(a.url) ? 0 : 1) - (pinned.has(b.url) ? 0 : 1));
  const aside = rest.filter((t) => dismissed.has(t.url));
  return { visible, aside, saved: savedTiles };
}

/** Hook form: partition a tile list against the live triage state, memoized. */
export function useTileState(tiles: Tile[]): { visible: Tile[]; aside: Tile[]; saved: Tile[] } {
  const triage = useTileTriage();
  return useMemo(() => partitionTiles(tiles, triage), [tiles, triage]);
}
