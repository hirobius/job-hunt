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
