// The tile-board view rule, in one pure place: given a list of tiles and the current triage,
// split into the VISIBLE set, the SET-ASIDE list, and the SAVED list.
//   - SAVED (already in the queue) tiles are REMOVED from the board entirely (issue #57): once
//     you're pursuing a posting, the browse surface's job for it is done. Returned as `saved`
//     so callers can show a "N saved → in your Queue" note. This also gives cross-track dedup
//     for free — a job saved under one track can't resurface under another.
//   - SET-ASIDE (dismissed) tiles drop into `aside`; the rest keep their order.
import type { Tile } from './jobsData';
import type { Triage } from './tileTriage';

export function partitionTiles(
  tiles: Tile[],
  triage: Triage,
  saved?: ReadonlySet<string>,
): { visible: Tile[]; aside: Tile[]; saved: Tile[] } {
  const dismissed = new Set(triage.dismissed);
  const savedTiles: Tile[] = [];
  const rest: Tile[] = [];
  for (const t of tiles) {
    if (saved?.has(t.url)) savedTiles.push(t);
    else rest.push(t);
  }
  const visible = rest.filter((t) => !dismissed.has(t.url));
  const aside = rest.filter((t) => dismissed.has(t.url));
  return { visible, aside, saved: savedTiles };
}
