// Sync-on-login merge for the curation tables — pure, table-driven, no I/O.
// Reuses the fleet-wide by-identity merge (mergeByKey): local order is kept, cloud wins on a
// shared id, cloud-only rows are appended. Local-only rows therefore survive the merge AND are
// reported separately by `localOnlyCuration` so the sync layer can upload them (a fresh device
// keeps everything; a returning device defers to the cloud on conflicts).
import { mergeByKey } from '../mergeByKey';
import { EMPTY_CURATION, type Category, type Group, type Tile, type CurationState } from './types';

const id = <T extends { id: string }>(x: T) => x.id;

/** Merge cloud + local by id per table (local order kept, cloud wins on conflict). */
export function mergeCuration(cloud: CurationState | null, local: CurationState): CurationState {
  return {
    categories: mergeByKey<Category>(id, cloud?.categories ?? null, local.categories),
    groups: mergeByKey<Group>(id, cloud?.groups ?? null, local.groups),
    tiles: mergeByKey<Tile>(id, cloud?.tiles ?? null, local.tiles),
  };
}

const notIn = <T extends { id: string }>(cloud: T[] | undefined | null, local: T[]): T[] => {
  const have = new Set((cloud ?? []).map((x) => x.id));
  return local.filter((x) => !have.has(x.id));
};

/** Rows present locally but absent from the cloud — the set to upload after a merge. */
export function localOnlyCuration(
  cloud: CurationState | null,
  local: CurationState,
): CurationState {
  if (!cloud) return { ...local };
  return {
    categories: notIn(cloud.categories, local.categories),
    groups: notIn(cloud.groups, local.groups),
    tiles: notIn(cloud.tiles, local.tiles),
  };
}

export { EMPTY_CURATION };

/**
 * Sign-in / focus reconcile (#99 review): like mergeCuration, but a row that exists ONLY locally is
 * ambiguous — created here and not yet uploaded, or deleted on another device. `syncedAt` (the last
 * successful sync on this device) decides: a local-only row created after it (or when this device
 * never synced) is new → kept + uploaded; an older one was deleted elsewhere → dropped. Children
 * whose parent didn't survive are dropped too, so no FK orphan is ever uploaded.
 */
export function reconcileCuration(
  cloud: CurationState,
  local: CurationState,
  syncedAt: string | null,
): { next: CurationState; upload: CurationState } {
  const isNew = (x: { createdAt: string }) => syncedAt == null || x.createdAt > syncedAt;
  const only = localOnlyCuration(cloud, local);
  const keepCats = new Set(only.categories.filter(isNew).map(id));
  const dropCats = new Set(only.categories.filter((c) => !keepCats.has(c.id)).map(id));
  const merged = mergeCuration(cloud, local);
  const categories = merged.categories.filter((c) => !dropCats.has(c.id));
  const catIds = new Set(categories.map(id));
  const onlyGroupIds = new Set(only.groups.map(id));
  const groups = merged.groups.filter(
    (g) => catIds.has(g.categoryId) && (!onlyGroupIds.has(g.id) || isNew(g)),
  );
  const groupIds = new Set(groups.map(id));
  const onlyTileIds = new Set(only.tiles.map(id));
  const tiles = merged.tiles.filter(
    (t) => groupIds.has(t.groupId) && (!onlyTileIds.has(t.id) || isNew(t)),
  );
  const next = { categories, groups, tiles };
  return { next, upload: localOnlyCuration(cloud, next) };
}
