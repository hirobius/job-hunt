// Starter links follow the track's location (Adrian 2026-10-22). The pack data (jobsData GROUPS)
// was written for Spokane: its local searches put the place in a query parameter (Indeed `l`,
// LinkedIn / ZipRecruiter `location`) and name it "(Spokane)". Seeding swaps in the track's
// location, or drops both when it is blank (blank = anywhere). Other places (`l=Remote`, "United
// States") and employer pages are left as they are.
import type { Tile } from '../jobsData';

const PLACE_PARAMS = ['l', 'location'];
const PACK_PLACE = /spokane/i;
const PACK_PLACE_NAME = /\s*\(Spokane\)/;

/** The tile with its pack place (Spokane) replaced by `location`, or removed when it is blank. */
export function localizeTile(tile: Tile, location: string): Tile {
  const loc = location.trim();
  let url: URL;
  try {
    url = new URL(tile.url);
  } catch {
    return tile;
  }
  const params = PLACE_PARAMS.filter((p) => PACK_PLACE.test(url.searchParams.get(p) ?? ''));
  if (!params.length) return tile;
  params.forEach((p) => (loc ? url.searchParams.set(p, loc) : url.searchParams.delete(p)));
  return {
    ...tile,
    url: url.toString(),
    name: tile.name.replace(PACK_PLACE_NAME, loc ? ` (${loc})` : ''),
  };
}
