// Per-account curated content store — the shared external store for categories/groups/tiles.
// Built on the shared createStore factory + local-first localStorage persistence.
// Signed out: purely local. Signed in: every mutator ALSO mirrors the change to Supabase
// (upsert on add/update, delete on remove) as thin fire-and-forget I/O through the anon client
// under RLS — errors are swallowed, so the local store is always the source of truth and the
// cloud is best-effort. The sign-in pull lives in sync.ts.
import { createStore } from '../createStore';
import { loadPersisted, savePersisted } from '../persisted';
import { supabase } from '../supabase';
import { EMPTY_CURATION, type Category, type Group, type Tile, type CurationState } from './types';
import {
  categoryToRow,
  groupToRow,
  tileToRow,
  type CategoryRow,
  type GroupRow,
  type TileRow,
} from './map';

import { reportCurationWriteFailed } from './syncStatus';

const KEY = 'rjb_curation';

/** The app's shared anon client (RLS-scoped), re-exported under its historical name. */
export const curationClient = supabase;

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'c-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

const store = createStore<CurationState>(loadPersisted<CurationState>(KEY, EMPTY_CURATION), {
  onSet: (next) => savePersisted(KEY, next),
});

// ---- thin cloud I/O (fire-and-forget; local stays the source of truth) ----
// getSession reads local storage only (no network), so signed-out callers — and tests —
// short-circuit before any request and never throw.
async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await curationClient.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}
/** The three curation tables — a closed union so `upsert`/`remove` can't be called with a typo'd
 *  or arbitrary table name, and so the row type pins itself to the table (no cast needed). */
type CurationTable = 'categories' | 'groups' | 'tiles';
type RowForTable<T extends CurationTable> = T extends 'categories'
  ? CategoryRow
  : T extends 'groups'
    ? GroupRow
    : TileRow;

// supabase-js reports a refused write (RLS, constraint, network) as `{ error }`, not a throw, so
// both are checked. A failure keeps the local change and is reported, never swallowed: the
// account menu offers Retry sync, and the next sync uploads what didn't make it.
function mirror(write: (uid: string) => PromiseLike<{ error: unknown }>) {
  void (async () => {
    try {
      const uid = await currentUserId();
      if (!uid) return;
      const { error } = await write(uid);
      if (error) reportCurationWriteFailed();
    } catch {
      reportCurationWriteFailed();
    }
  })();
}
function upsert<T extends CurationTable>(table: T, buildRow: (uid: string) => RowForTable<T>) {
  mirror((uid) => curationClient.from(table).upsert(buildRow(uid)));
}
function remove(table: CurationTable, rowId: string) {
  mirror(() => curationClient.from(table).delete().eq('id', rowId));
}

// ---- sortOrder helpers (append to the end of the relevant scope) ----
const nextSort = (items: { sortOrder: number }[]) =>
  items.reduce((m, x) => Math.max(m, x.sortOrder), -1) + 1;

// ---- categories ----
export function addCategory(partial: Partial<Category> = {}): string {
  const s = store.get();
  const now = new Date().toISOString();
  const c: Category = {
    id: newId(),
    label: 'New category',
    titles: [],
    atsRoles: [],
    seniority: 'any',
    location: 'Remote',
    tailorRole: null,
    sortOrder: nextSort(s.categories),
    archived: false,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
  store.set({ ...s, categories: [...s.categories, c] });
  upsert('categories', (uid) => categoryToRow(c, uid));
  return c.id;
}

export function updateCategory(id: string, patch: Partial<Category>) {
  const s = store.get();
  let updated: Category | undefined;
  const categories = s.categories.map((c) => {
    if (c.id !== id) return c;
    updated = { ...c, ...patch, id: c.id, updatedAt: new Date().toISOString() };
    return updated;
  });
  if (!updated) return;
  store.set({ ...s, categories });
  const row = updated;
  upsert('categories', (uid) => categoryToRow(row, uid));
}

export function removeCategory(id: string) {
  const s = store.get();
  if (!s.categories.some((c) => c.id === id)) return;
  store.set({ ...s, categories: s.categories.filter((c) => c.id !== id) });
  remove('categories', id);
}

// ---- groups ----
export function addGroup(categoryId: string, partial: Partial<Group> = {}): string {
  const s = store.get();
  const g: Group = {
    id: newId(),
    categoryId,
    label: 'New group',
    sortOrder: nextSort(s.groups.filter((x) => x.categoryId === categoryId)),
    archived: false,
    createdAt: new Date().toISOString(),
    ...partial,
  };
  // categoryId is intrinsic to the group — a patch must never reroute it.
  g.categoryId = categoryId;
  store.set({ ...s, groups: [...s.groups, g] });
  upsert('groups', (uid) => groupToRow(g, uid));
  return g.id;
}

export function updateGroup(id: string, patch: Partial<Group>) {
  const s = store.get();
  let updated: Group | undefined;
  const groups = s.groups.map((g) => {
    if (g.id !== id) return g;
    updated = { ...g, ...patch, id: g.id };
    return updated;
  });
  if (!updated) return;
  store.set({ ...s, groups });
  const row = updated;
  upsert('groups', (uid) => groupToRow(row, uid));
}

export function removeGroup(id: string) {
  const s = store.get();
  if (!s.groups.some((g) => g.id === id)) return;
  store.set({ ...s, groups: s.groups.filter((g) => g.id !== id) });
  remove('groups', id);
}

// ---- tiles ----
export function addTile(groupId: string, partial: Partial<Tile> = {}): string {
  const s = store.get();
  const t: Tile = {
    id: newId(),
    groupId,
    name: '',
    url: '',
    meta: '',
    sortOrder: nextSort(s.tiles.filter((x) => x.groupId === groupId)),
    createdAt: new Date().toISOString(),
    ...partial,
  };
  t.groupId = groupId;
  store.set({ ...s, tiles: [...s.tiles, t] });
  upsert('tiles', (uid) => tileToRow(t, uid));
  return t.id;
}

export function updateTile(id: string, patch: Partial<Tile>) {
  const s = store.get();
  let updated: Tile | undefined;
  const tiles = s.tiles.map((t) => {
    if (t.id !== id) return t;
    updated = { ...t, ...patch, id: t.id };
    return updated;
  });
  if (!updated) return;
  store.set({ ...s, tiles });
  const row = updated;
  upsert('tiles', (uid) => tileToRow(row, uid));
}

export function removeTile(id: string) {
  const s = store.get();
  if (!s.tiles.some((t) => t.id === id)) return;
  store.set({ ...s, tiles: s.tiles.filter((t) => t.id !== id) });
  remove('tiles', id);
}

// ---- whole-state access (used by the sync layer) ----
export function getCurationState(): CurationState {
  return store.get();
}
export function replaceCurationState(next: CurationState) {
  store.set({
    categories: next.categories ?? [],
    groups: next.groups ?? [],
    tiles: next.tiles ?? [],
  });
}

// ---- reads ----
export function useCategories(): Category[] {
  return store.use().categories;
}
export function useGroups(): Group[] {
  return store.use().groups;
}
export function useTiles(): Tile[] {
  return store.use().tiles;
}
