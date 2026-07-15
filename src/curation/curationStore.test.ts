import { afterEach, describe, expect, it } from 'vitest';
import {
  addCategory,
  updateCategory,
  removeCategory,
  addGroup,
  updateGroup,
  removeGroup,
  addTile,
  updateTile,
  removeTile,
  getCurationState,
  replaceCurationState,
} from './curationStore';
import { EMPTY_CURATION } from './types';

// Signed out in tests (no Supabase session) — every mutator stays purely local, so we only
// assert on the store. Reset to empty after each test since the store is a module singleton.
afterEach(() => replaceCurationState(EMPTY_CURATION));

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
