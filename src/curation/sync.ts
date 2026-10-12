// Sign-in sync for the curation tables (categories/groups/tiles) — the network half, called by
// CloudSync on sign-in and on focus (#99). Order: pull cloud → local-first merge (merge.ts) →
// replace the store → upload the rows that existed only locally. Unlike the per-mutator mirror
// in curationStore, this reports failure: every Supabase `{ error }` is checked, the outcome
// lands in syncStatus (which Onboarding reads), and the caller gets a boolean.
import { curationClient, getCurationState, replaceCurationState } from './curationStore';
import { mergeCuration, localOnlyCuration } from './merge';
import { foldLegacyTiles, type LegacyTile } from './legacyTiles';
import { setCurationSyncStatus } from './syncStatus';
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

type Res = { data?: unknown; error?: { message: string } | null };
const check = <T extends Res>(r: T): T => {
  if (r.error) throw new Error(r.error.message);
  return r;
};

/** Read every curation row for a user (RLS also scopes this). Throws on any `{ error }`. */
export async function pullAll(userId: string): Promise<CurationState> {
  const [cats, groups, tiles] = await Promise.all([
    curationClient.from('categories').select('*').eq('user_id', userId),
    curationClient.from('groups').select('*').eq('user_id', userId),
    curationClient.from('tiles').select('*').eq('user_id', userId),
  ]);
  return {
    categories: ((check(cats).data ?? []) as CategoryRow[]).map(categoryFromRow),
    groups: ((check(groups).data ?? []) as GroupRow[]).map(groupFromRow),
    tiles: ((check(tiles).data ?? []) as TileRow[]).map(tileFromRow),
  };
}

/** Upload the local-only rows, parents before children (FKs). Throws on any `{ error }`. */
async function uploadLocalOnly(userId: string, localOnly: CurationState): Promise<void> {
  if (localOnly.categories.length)
    check(
      await curationClient
        .from('categories')
        .upsert(localOnly.categories.map((c) => categoryToRow(c, userId))),
    );
  if (localOnly.groups.length)
    check(
      await curationClient
        .from('groups')
        .upsert(localOnly.groups.map((g) => groupToRow(g, userId))),
    );
  if (localOnly.tiles.length)
    check(
      await curationClient.from('tiles').upsert(localOnly.tiles.map((t) => tileToRow(t, userId))),
    );
}

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'c-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Fold legacy user tiles into the local store (no-op when there are none / all present). */
export function foldIntoStore(legacy: readonly LegacyTile[]) {
  const s = getCurationState();
  const next = foldLegacyTiles(s, legacy, { newId, now: new Date().toISOString() });
  if (next !== s) replaceCurationState(next);
}

const LEGACY_KEY = 'rjb_user_tiles';

/** One-time, per device: move the retired userTiles store's links into "My links". */
export function migrateLocalLegacyTiles() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw == null) return;
    const list = JSON.parse(raw);
    if (Array.isArray(list)) foldIntoStore(list.filter((t) => t && typeof t.url === 'string'));
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* unreadable legacy data — leave it */
  }
}

/** Pull → merge with local → replace store → upload local-only rows. Returns success. */
export async function syncOnLogin(userId: string): Promise<boolean> {
  setCurationSyncStatus('syncing');
  try {
    const cloud = await pullAll(userId);
    const local = getCurationState();
    replaceCurationState(mergeCuration(cloud, local));
    await uploadLocalOnly(userId, localOnlyCuration(cloud, local));
    setCurationSyncStatus('done');
    return true;
  } catch {
    setCurationSyncStatus('error');
    return false;
  }
}

export { EMPTY_CURATION };
