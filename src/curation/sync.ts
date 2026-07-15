// Sync-on-login for the curation tables — the network half, modelled on CloudSync.adopt() but
// for categories/groups/tiles instead of the tracker blob. Two exports, no store mutation beyond
// the documented replace:
//   pullAll(userId)     → read all three tables (RLS-scoped) into a CurationState.
//   syncOnLogin(userId) → pull cloud, merge with local (merge.ts), replace the store with the
//                          result, then upload the rows that existed only locally.
// All I/O is best-effort: a cloud error leaves the local store untouched. Does NOT touch
// CloudSync.tsx — a later phase decides how the two sync loops compose.
import {
  curationClient,
  getCurationState,
  replaceCurationState,
} from './curationStore';
import { mergeCuration, localOnlyCuration } from './merge';
import {
  categoryFromRow,
  groupFromRow,
  tileFromRow,
  categoryToRow,
  groupToRow,
  tileToRow,
  type CategoryRow,
  type GroupRow,
  type TileRow,
} from './map';
import { EMPTY_CURATION, type CurationState } from './types';

/** Read every curation row for a user (RLS also scopes this). Missing tables → empty arrays. */
export async function pullAll(userId: string): Promise<CurationState> {
  const [cats, groups, tiles] = await Promise.all([
    curationClient.from('categories').select('*').eq('user_id', userId),
    curationClient.from('groups').select('*').eq('user_id', userId),
    curationClient.from('tiles').select('*').eq('user_id', userId),
  ]);
  return {
    categories: ((cats.data ?? []) as CategoryRow[]).map(categoryFromRow),
    groups: ((groups.data ?? []) as GroupRow[]).map(groupFromRow),
    tiles: ((tiles.data ?? []) as TileRow[]).map(tileFromRow),
  };
}

/** Upload the local-only rows (cloud wins on conflict, so these are new to the cloud). */
async function uploadLocalOnly(userId: string, localOnly: CurationState): Promise<void> {
  const tasks: PromiseLike<unknown>[] = [];
  if (localOnly.categories.length)
    tasks.push(
      curationClient
        .from('categories')
        .upsert(localOnly.categories.map((c) => categoryToRow(c, userId))),
    );
  if (localOnly.groups.length)
    tasks.push(
      curationClient.from('groups').upsert(localOnly.groups.map((g) => groupToRow(g, userId))),
    );
  if (localOnly.tiles.length)
    tasks.push(
      curationClient.from('tiles').upsert(localOnly.tiles.map((t) => tileToRow(t, userId))),
    );
  await Promise.all(tasks);
}

/** Pull → merge with local → replace store → upload local-only rows. Best-effort. */
export async function syncOnLogin(userId: string): Promise<void> {
  try {
    const cloud = await pullAll(userId);
    const local = getCurationState();
    replaceCurationState(mergeCuration(cloud, local));
    await uploadLocalOnly(userId, localOnlyCuration(cloud, local));
  } catch {
    /* swallow — local store is the source of truth, cloud is best-effort */
  }
}

export { EMPTY_CURATION };
