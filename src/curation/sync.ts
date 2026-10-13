// Sign-in sync for the curation tables (categories/groups/tiles) — the network half, called by
// CloudSync on sign-in and on focus (#99). Order: pull cloud → reconcile with local (merge.ts) →
// replace the store → upload the rows that are new on this device. Unlike the per-mutator mirror
// in curationStore, this reports failure: every Supabase `{ error }` is checked, the outcome
// lands in syncStatus (which Onboarding reads), and the caller gets a boolean.
import { curationClient, getCurationState, replaceCurationState } from './curationStore';
import { reconcileCuration } from './merge';
import { foldLegacyTiles, type LegacyTile } from './legacyTiles';
import { getCurationSyncedAt, setCurationSyncStatus, setCurationSyncedAt } from './syncStatus';
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

/** Read-and-clear the retired userTiles store's links (once per device). The caller folds them —
 *  after the sign-in pull when signed in, so the fold sees the cloud's tracks and URLs. */
export function takeLocalLegacyTiles(): LegacyTile[] {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw == null) return [];
    localStorage.removeItem(LEGACY_KEY);
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((t) => t && typeof t.url === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Pull → reconcile with local (merge.ts: cloud wins; local-only rows kept + uploaded only if new
 * since this device's last sync, so deletions made elsewhere stay deleted) → upload. Returns
 * success. Only an EMPTY local board shows 'syncing' (that's when Onboarding must wait); a
 * background re-sync of a populated board never swaps the UI out.
 */
export async function syncOnLogin(userId: string): Promise<boolean> {
  const startedAt = new Date().toISOString();
  if (getCurationState().categories.length === 0) setCurationSyncStatus('syncing');
  try {
    const cloud = await pullAll(userId);
    const { next, upload } = reconcileCuration(cloud, getCurationState(), getCurationSyncedAt());
    replaceCurationState(next);
    await uploadLocalOnly(userId, upload);
    setCurationSyncedAt(startedAt);
    setCurationSyncStatus('done');
    return true;
  } catch {
    setCurationSyncStatus('error');
    return false;
  }
}

/**
 * Mirror a restored board to the cloud (backup restore). 'replace' first deletes this user's rows
 * (child → parent) so the cloud matches the restore exactly; 'merge' upserts every local row.
 * Signed out → nothing to do. Returns success.
 */
export async function pushRestoredCuration(mode: 'merge' | 'replace'): Promise<boolean> {
  try {
    const { data } = await curationClient.auth.getSession();
    const uid = data.session?.user?.id;
    if (!uid) return true;
    const startedAt = new Date().toISOString();
    if (mode === 'replace')
      for (const table of ['tiles', 'groups', 'categories'] as const)
        check(await curationClient.from(table).delete().eq('user_id', uid));
    await uploadLocalOnly(uid, getCurationState());
    setCurationSyncedAt(startedAt);
    return true;
  } catch {
    return false;
  }
}

export { EMPTY_CURATION };
