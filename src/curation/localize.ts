// Starter links follow the track's location (Adrian 2026-10-22). The pack data (jobsData GROUPS)
// was written for Spokane: its local searches put the place in a query parameter (Indeed `l`,
// LinkedIn / ZipRecruiter `location`) and name it "(Spokane)". Seeding swaps in the track's
// location, or drops both when it is blank (blank = anywhere). Other places (`l=Remote`, "United
// States") and employer pages are left as they are. Only the place parameter is rewritten: the
// rest of the URL stays byte for byte, so a link never changes (or duplicates) for nothing.
import type { Tile } from '../jobsData';

const PLACE_PARAMS = ['l', 'location'];
const PACK_PLACE = /spokane/i;
const PACK_PLACE_NAME = /\s*\(Spokane\)/;

const decode = (v: string) => {
  try {
    return decodeURIComponent(v.replace(/\+/g, ' '));
  } catch {
    return v;
  }
};

/** The URL split into the part before the query, its `&` parts and the hash; null without one. */
function splitQuery(url: string) {
  const hashAt = url.indexOf('#');
  const hash = hashAt < 0 ? '' : url.slice(hashAt);
  const rest = hashAt < 0 ? url : url.slice(0, hashAt);
  const q = rest.indexOf('?');
  if (q < 0) return null;
  return { base: rest.slice(0, q), parts: rest.slice(q + 1).split('&'), hash };
}

const keyOf = (part: string) => decode(part.split('=')[0]);
const valueOf = (part: string) => decode(part.slice(part.indexOf('=') + 1));
const isPlace = (part: string) => part.includes('=') && PLACE_PARAMS.includes(keyOf(part));

/** The tile with its pack place (Spokane) replaced by `location`, or removed when it is blank. */
export function localizeTile(tile: Tile, location: string): Tile {
  const loc = location.trim();
  const q = splitQuery(tile.url);
  if (!q) return tile;
  const local = (part: string) => isPlace(part) && PACK_PLACE.test(valueOf(part));
  if (!q.parts.some(local)) return tile;
  const parts = q.parts.flatMap((part) => {
    if (!local(part)) return [part];
    if (!loc) return [];
    // Already this place (a Spokane track): keep the pack's own bytes.
    if (valueOf(part).toLowerCase() === loc.toLowerCase()) return [part];
    return [`${part.split('=')[0]}=${encodeURIComponent(loc)}`];
  });
  return {
    ...tile,
    url: `${q.base}${parts.length ? `?${parts.join('&')}` : ''}${q.hash}`,
    name: tile.name.replace(PACK_PLACE_NAME, () => (loc ? ` (${loc})` : '')),
  };
}

/** A link's identity for "the track already has it": the URL without its place parameter and
 *  with each parameter decoded, so the pack's Spokane link, its localized form (any place, or
 *  none) and an older re-encoded copy are the same tile. */
export function placeKey(url: string): string {
  const q = splitQuery(url.trim());
  if (!q) return url.trim();
  const parts = q.parts
    .filter((p) => p && !isPlace(p))
    .map((p) => (p.includes('=') ? `${keyOf(p)}=${valueOf(p)}` : keyOf(p)));
  return `${q.base}?${parts.join('&')}${q.hash}`;
}
