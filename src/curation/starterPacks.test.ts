import { afterEach, describe, expect, it, vi } from 'vitest';

// The curation store lazily creates a Supabase client; stub it so seeding stays local + offline.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({ upsert: async () => ({}), delete: () => ({ eq: async () => ({}) }) }),
  }),
}));

import { getCurationState, replaceCurationState } from './curationStore';
import { seedPack, STARTER_PACKS } from './starterPacks';

afterEach(() => replaceCurationState({ categories: [], groups: [], tiles: [] }));

describe('seedPack', () => {
  it('seeds a pillar-backed pack as a category with groups + tiles; location overrides', () => {
    const id = seedPack('consulting', 'Denver, CO');
    const s = getCurationState();
    const cat = s.categories.find((c) => c.id === id)!;
    expect(cat.label).toBe('Implementation Consulting');
    expect(cat.titles.length).toBeGreaterThan(0);
    expect(cat.atsRoles.length).toBeGreaterThan(0);
    expect(cat.location).toBe('Denver, CO');
    expect(s.groups.filter((g) => g.categoryId === id).length).toBeGreaterThan(0);
    expect(s.tiles.length).toBeGreaterThan(0);
  });

  it('a blank pack seeds an empty category (no titles, no groups)', () => {
    const id = seedPack('blank');
    const s = getCurationState();
    const cat = s.categories.find((c) => c.id === id)!;
    expect(cat.titles).toEqual([]);
    expect(s.groups.filter((g) => g.categoryId === id)).toEqual([]);
  });

  it('every advertised pack id is seedable without throwing', () => {
    STARTER_PACKS.forEach((p) => expect(() => seedPack(p.id)).not.toThrow());
  });
});
