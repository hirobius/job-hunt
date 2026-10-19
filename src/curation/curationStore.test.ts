import { afterEach, describe, expect, it, vi } from 'vitest';

// The store module constructs a live Supabase client at import time; stub it so these tests
// never depend on ambient (jsdom-absent) session state and never touch the real project — the
// seam is explicit here rather than accidental. `vi.hoisted` lets the spies + mutable session
// exist before `vi.mock`'s factory (itself hoisted above all imports) closes over them.
const cloud = vi.hoisted(() => ({
  upsertSpy: vi.fn(async (_row: unknown) => ({ data: null, error: null })),
  deleteEqSpy: vi.fn(async () => ({ data: null, error: null })),
  session: null as { user: { id: string } } | null,
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: cloud.session } }),
    },
    from: () => ({
      upsert: cloud.upsertSpy,
      delete: () => ({ eq: cloud.deleteEqSpy }),
    }),
  }),
}));

import {
  addCategory,
  updateCategory,
  removeCategory,
  addGroup,
  updateGroup,
  removeGroup,
  addTile,
  addTiles,
  TILE_CHUNK,
  updateTile,
  removeTile,
  getCurationState,
  replaceCurationState,
} from './curationStore';
import { EMPTY_CURATION } from './types';
import { clearAllPending, getPending } from './pending';
import { onCurationWriteFailed } from './syncStatus';

// Reset to empty + signed-out after each test since the store and mock client are module
// singletons shared across tests.
afterEach(() => {
  replaceCurationState(EMPTY_CURATION);
  cloud.session = null;
  cloud.upsertSpy.mockClear();
  cloud.deleteEqSpy.mockClear();
});

describe('categories', () => {
  it('adds with a real id, defaults, and an incrementing sortOrder', () => {
    const a = addCategory({ label: 'Welding' });
    const b = addCategory({ label: 'Fab' });
    const cats = getCurationState().categories;
    expect(cats).toHaveLength(2);
    expect(a).not.toBe(b);
    expect(cats[0]).toMatchObject({ id: a, label: 'Welding', sortOrder: 0, archived: false });
    expect(cats[1]).toMatchObject({ id: b, sortOrder: 1 });
    expect(cats[0].tailorRole).toBeNull();
    expect(cats[0].createdAt).toEqual(cats[0].updatedAt);
  });

  it('updates immutably and protects the id, bumping updatedAt', () => {
    const id = addCategory({ label: 'X' });
    const before = getCurationState();
    updateCategory(id, { label: 'Y', id: 'HACK' as unknown as string });
    const after = getCurationState();
    expect(after).not.toBe(before); // new state object
    const c = after.categories.find((x) => x.id === id)!;
    expect(c.label).toBe('Y');
    expect(c.id).toBe(id);
    expect(after.categories.some((x) => x.id === 'HACK')).toBe(false);
  });

  it('removes only the targeted category', () => {
    const a = addCategory();
    const b = addCategory();
    removeCategory(a);
    expect(getCurationState().categories.map((c) => c.id)).toEqual([b]);
  });
});

describe('groups', () => {
  it('adds under a category and pins categoryId even against a stray patch', () => {
    const cat = addCategory();
    const g = addGroup(cat, { label: 'Shops', categoryId: 'WRONG' });
    const group = getCurationState().groups.find((x) => x.id === g)!;
    expect(group.categoryId).toBe(cat);
    expect(group.label).toBe('Shops');
  });

  it('scopes sortOrder per category', () => {
    const c1 = addCategory();
    const c2 = addCategory();
    addGroup(c1);
    const g2 = addGroup(c1);
    const g3 = addGroup(c2); // first in c2 → back to 0
    const groups = getCurationState().groups;
    expect(groups.find((x) => x.id === g2)!.sortOrder).toBe(1);
    expect(groups.find((x) => x.id === g3)!.sortOrder).toBe(0);
  });

  it('updates and removes groups', () => {
    const cat = addCategory();
    const g = addGroup(cat);
    updateGroup(g, { label: 'Renamed' });
    expect(getCurationState().groups[0].label).toBe('Renamed');
    removeGroup(g);
    expect(getCurationState().groups).toHaveLength(0);
  });
});

describe('tiles', () => {
  it('adds under a group with scoped sortOrder', () => {
    const cat = addCategory();
    const g1 = addGroup(cat);
    const g2 = addGroup(cat);
    addTile(g1, { name: 'A', url: 'https://a.example' });
    const t2 = addTile(g1, { name: 'B', url: 'https://b.example' });
    const t3 = addTile(g2, { name: 'C', url: 'https://c.example' });
    const tiles = getCurationState().tiles;
    expect(tiles.find((x) => x.id === t2)!.sortOrder).toBe(1);
    expect(tiles.find((x) => x.id === t3)!.sortOrder).toBe(0);
    expect(tiles.find((x) => x.id === t3)!.groupId).toBe(g2);
  });

  it('updates and removes tiles', () => {
    const cat = addCategory();
    const g = addGroup(cat);
    const t = addTile(g, { name: 'A', url: 'https://a.example' });
    updateTile(t, { meta: 'Direct apply' });
    expect(getCurationState().tiles[0].meta).toBe('Direct apply');
    removeTile(t);
    expect(getCurationState().tiles).toHaveLength(0);
  });
});

describe('replaceCurationState', () => {
  it('replaces wholesale and tolerates partial input', () => {
    addCategory();
    replaceCurationState({ categories: [], groups: [], tiles: [] });
    expect(getCurationState()).toEqual(EMPTY_CURATION);
  });
});

describe('cloud sync seam', () => {
  it('never calls the cloud when signed out', async () => {
    cloud.session = null;
    const id = addCategory({ label: 'X' });
    updateCategory(id, { label: 'Y' });
    removeCategory(id);
    // Give the fire-and-forget async IIFEs a chance to run; there is nothing to wait *for*
    // (no call should ever land), so a short flush is the correct shape here.
    await new Promise((r) => setTimeout(r, 20));
    expect(cloud.upsertSpy).not.toHaveBeenCalled();
    expect(cloud.deleteEqSpy).not.toHaveBeenCalled();
  });

  it('calls upsert and delete once a stubbed session is signed in', async () => {
    cloud.session = { user: { id: 'user-1' } };
    const id = addCategory({ label: 'Welding' });
    await vi.waitFor(() => expect(cloud.upsertSpy).toHaveBeenCalledTimes(1));
    expect(cloud.upsertSpy.mock.calls[0][0]).toMatchObject({
      id,
      user_id: 'user-1',
      label: 'Welding',
    });

    removeCategory(id);
    await vi.waitFor(() => expect(cloud.deleteEqSpy).toHaveBeenCalledTimes(1));
    expect(cloud.deleteEqSpy).toHaveBeenCalledWith('id', id);
  });
});

// A starter pack files ~120 board tiles at once (#178): they go up as a few bulk upserts, not
// one call per row, and a refused chunk leaves exactly its own rows journalled as failed.
describe('addTiles (bulk)', () => {
  afterEach(() => clearAllPending());

  const partials = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ name: `Co ${i}`, url: `https://x.test/${i}` }));

  it('adds every tile in one store write and sends them in chunks', async () => {
    cloud.session = { user: { id: 'user-1' } };
    const ids = addTiles('g1', partials(120));
    expect(ids).toHaveLength(120);
    expect(getCurationState().tiles.map((t) => t.id)).toEqual(ids);
    await vi.waitFor(() => expect(cloud.upsertSpy).toHaveBeenCalledTimes(3));
    const sizes = cloud.upsertSpy.mock.calls.map((c) => (c[0] as unknown[]).length);
    expect(sizes).toEqual([TILE_CHUNK, TILE_CHUNK, 120 - 2 * TILE_CHUNK]);
    await vi.waitFor(() => expect(getPending()).toEqual([]));
  });

  it('keeps only a refused chunk in the journal, marked failed, and reports once', async () => {
    cloud.session = { user: { id: 'user-1' } };
    const reported = vi.fn();
    const off = onCurationWriteFailed(reported);
    cloud.upsertSpy
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'rls' } } as never)
      .mockResolvedValueOnce({ data: null, error: null });
    const ids = addTiles('g1', partials(120));
    // Journalled before anything is sent: sign-out would ask.
    expect(getPending()).toHaveLength(120);
    await vi.waitFor(() => expect(cloud.upsertSpy).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(getPending()).toHaveLength(TILE_CHUNK));
    const pending = getPending();
    expect(pending.every((p) => p.failed && p.table === 'tiles' && p.op === 'upsert')).toBe(true);
    expect(pending.map((p) => p.id).sort()).toEqual(ids.slice(TILE_CHUNK, 2 * TILE_CHUNK).sort());
    expect(reported).toHaveBeenCalledTimes(1);
    off();
  });

  it('treats a chunk that throws like a refused one: its rows stay failed, the rest clear', async () => {
    cloud.session = { user: { id: 'user-1' } };
    const reported = vi.fn();
    const off = onCurationWriteFailed(reported);
    cloud.upsertSpy
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockRejectedValueOnce(new Error('network'));
    const ids = addTiles('g1', partials(120));
    await vi.waitFor(() => expect(cloud.upsertSpy).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(getPending()).toHaveLength(120 - 2 * TILE_CHUNK));
    const pending = getPending();
    expect(pending.every((p) => p.failed)).toBe(true);
    expect(pending.map((p) => p.id).sort()).toEqual(ids.slice(2 * TILE_CHUNK).sort());
    expect(reported).toHaveBeenCalledTimes(1);
    off();
  });

  it('journals nothing when signed out', async () => {
    addTiles('g1', partials(3));
    await vi.waitFor(() => expect(getPending()).toEqual([]));
    expect(cloud.upsertSpy).not.toHaveBeenCalled();
  });
});

describe('new tracks start with no place (#58)', () => {
  it('addCategory() with no location leaves location empty', () => {
    const id = addCategory();
    expect(getCurationState().categories.find((c) => c.id === id)?.location).toBe('');
  });
});
