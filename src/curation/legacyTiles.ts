// The one-time fold of legacy "user tiles" (links pasted into the first, retired curated board,
// once stored under rjb_user_tiles and in the v3 sync blob) into the curation model (#99).
// Pure: (state, tiles) → state. Tiles land in a "My links" group placed LAST in the first track,
// so it never becomes a track's featured first group; URLs already on the board are skipped,
// which makes re-running the fold a no-op.
import { prettyTitle } from '../store';
import type { Category, CurationState, Group, Tile } from './types';

/** The shape the retired userTiles store persisted. */
export interface LegacyTile {
  name: string;
  meta: string;
  url: string;
}

export const MY_LINKS = 'My links';

interface FoldOptions {
  newId: () => string;
  now: string;
}

export function foldLegacyTiles(
  state: CurationState,
  legacy: readonly LegacyTile[],
  { newId, now }: FoldOptions,
): CurationState {
  const have = new Set(state.tiles.map((t) => t.url));
  const fresh: LegacyTile[] = [];
  for (const t of legacy) {
    if (!t?.url || have.has(t.url)) continue;
    have.add(t.url);
    fresh.push(t);
  }
  if (!fresh.length) return state;

  const categories = [...state.categories];
  const groups = [...state.groups];
  let cat = [...categories].sort((a, b) => a.sortOrder - b.sortOrder)[0];
  if (!cat) {
    cat = {
      id: newId(),
      label: MY_LINKS,
      titles: [],
      atsRoles: [],
      seniority: 'any',
      location: '',
      tailorRole: null,
      sortOrder: 0,
      archived: false,
      createdAt: now,
      updatedAt: now,
    } satisfies Category;
    categories.push(cat);
  }
  const inCat = groups.filter((g) => g.categoryId === cat.id);
  let group = inCat.find((g) => g.label === MY_LINKS);
  if (!group) {
    group = {
      id: newId(),
      categoryId: cat.id,
      label: MY_LINKS,
      sortOrder: inCat.reduce((m, g) => Math.max(m, g.sortOrder), -1) + 1,
      archived: false,
      createdAt: now,
    } satisfies Group;
    groups.push(group);
  }
  const gid = group.id;
  let sort = state.tiles
    .filter((t) => t.groupId === gid)
    .reduce((m, t) => Math.max(m, t.sortOrder), -1);
  const added: Tile[] = fresh.map((t) => ({
    id: newId(),
    groupId: gid,
    name: t.name || prettyTitle(t.url),
    url: t.url,
    meta: t.meta || '',
    sortOrder: ++sort,
    createdAt: now,
  }));
  return { categories, groups, tiles: [...state.tiles, ...added] };
}
