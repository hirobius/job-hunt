import { afterEach, describe, expect, it, vi } from 'vitest';

// Same seam as curationStore.test.ts: stub the Supabase client so this stays a pure, offline
// unit test of the mapping — signed-out by construction, so no upsert ever fires.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({
      upsert: async () => ({ data: null, error: null }),
      delete: () => ({ eq: async () => ({ data: null, error: null }) }),
    }),
  }),
}));

import { importStarterContent } from './importStarter';
import { getCurationState, replaceCurationState } from './curationStore';
import { EMPTY_CURATION } from './types';
import { BUILTIN_PILLARS } from '../pillars';
import { APPRENTICESHIP_GROUPS } from '../apprenticeships';

const sumGroupsAndTiles = (groupsList: { tiles: unknown[] }[][]) =>
  groupsList.reduce(
    (acc, groups) => {
      acc.groups += groups.length;
      acc.tiles += groups.reduce((n, g) => n + g.tiles.length, 0);
      return acc;
    },
    { groups: 0, tiles: 0 },
  );

afterEach(() => {
  replaceCurationState(EMPTY_CURATION);
});

describe('importStarterContent', () => {
  it('maps every BUILTIN_PILLARS entry to a Category, its groups to Groups, and their tiles to Tiles', () => {
    const result = importStarterContent();
    const state = getCurationState();

    expect(result.status).toBe('imported');

    // One category per pillar, plus one for the Apprenticeships board.
    expect(state.categories).toHaveLength(BUILTIN_PILLARS.length + 1);
    expect(result.categories).toBe(BUILTIN_PILLARS.length + 1);

    const expected = sumGroupsAndTiles([
      ...BUILTIN_PILLARS.map((p) => p.groups),
      APPRENTICESHIP_GROUPS,
    ]);
    expect(state.groups).toHaveLength(expected.groups);
    expect(state.tiles).toHaveLength(expected.tiles);
    expect(result.groups).toBe(expected.groups);
    expect(result.tiles).toBe(expected.tiles);

    // Spot-check one pillar's mapping: fields carry over, tailorRole stays unset, sortOrder
    // is sequential from 0.
    const sheetMetal = BUILTIN_PILLARS[0];
    const cat = state.categories.find((c) => c.label === sheetMetal.label)!;
    expect(cat).toMatchObject({
      titles: sheetMetal.titles,
      atsRoles: sheetMetal.atsRoles,
      seniority: sheetMetal.seniority,
      location: sheetMetal.location,
      tailorRole: null,
      sortOrder: 0,
    });

    const firstGroup = state.groups.find((g) => g.categoryId === cat.id && g.sortOrder === 0)!;
    expect(firstGroup.label).toBe(sheetMetal.groups[0].label);

    const firstTile = state.tiles.find((t) => t.groupId === firstGroup.id && t.sortOrder === 0)!;
    expect(firstTile).toMatchObject({
      name: sheetMetal.groups[0].tiles[0].name,
      url: sheetMetal.groups[0].tiles[0].url,
      meta: sheetMetal.groups[0].tiles[0].meta,
    });

    // The apprenticeships board lands in its own extra category, archived flags preserved.
    const appr = state.categories.find((c) => c.label === 'Spokane Apprenticeships')!;
    expect(appr).toBeTruthy();
    const archivedSourceGroup = APPRENTICESHIP_GROUPS.find((g) => g.archived)!;
    const archivedGroup = state.groups.find(
      (g) => g.categoryId === appr.id && g.label === archivedSourceGroup.label,
    )!;
    expect(archivedGroup.archived).toBe(true);
  });

  it('is idempotent — a second call no-ops once categories already exist', () => {
    importStarterContent();
    const after1 = getCurationState();

    const second = importStarterContent();

    expect(second).toEqual({ status: 'already-imported', categories: 0, groups: 0, tiles: 0 });
    expect(getCurationState()).toEqual(after1);
  });

  it('reports already-imported if any category exists, even one unrelated to the import', () => {
    replaceCurationState({
      categories: [
        {
          id: 'x',
          label: 'User category',
          titles: [],
          atsRoles: [],
          seniority: 'any',
          location: 'Remote',
          tailorRole: null,
          sortOrder: 0,
          archived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      groups: [],
      tiles: [],
    });

    const result = importStarterContent();
    expect(result.status).toBe('already-imported');
    expect(getCurationState().categories).toHaveLength(1);
  });
});
