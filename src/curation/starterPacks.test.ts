import { afterEach, describe, expect, it, vi } from 'vitest';

// The curation store lazily creates a Supabase client; stub it so seeding stays local + offline.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({ upsert: async () => ({}), delete: () => ({ eq: async () => ({}) }) }),
  }),
}));

import { getCurationState, replaceCurationState } from './curationStore';
import { packIdForLabel, seedPack, STARTER_PACKS } from './starterPacks';
import { DIRECTORY_BY_PACK } from '../radar/directory';
import { parseBoardUrl } from '../feed/sources/ats';

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

  it('optional titles replace the pack titles (Build your own needs a first title)', () => {
    const id = seedPack('blank', '', { titles: ['Design Engineer'] });
    expect(getCurationState().categories.find((c) => c.id === id)!.titles).toEqual([
      'Design Engineer',
    ]);
  });

  it('every advertised pack id is seedable without throwing', () => {
    STARTER_PACKS.forEach((p) => expect(() => seedPack(p.id)).not.toThrow());
  });
});

describe('per-track watched boards', () => {
  const watched = (id: string) => {
    const s = getCurationState();
    const g = s.groups.find((x) => x.categoryId === id && x.label === 'Watched companies');
    return g ? s.tiles.filter((t) => t.groupId === g.id).map((t) => t.url) : [];
  };

  it('a design systems track starts with its watched boards', () => {
    const id = seedPack('designsystems');
    // The pack's own curated Watched companies group takes the boards too: one group, no repeats.
    const have = watched(id);
    const key = (u: string) => {
      const b = parseBoardUrl(u)!;
      return `${b.kind}:${b.slug.toLowerCase()}`;
    };
    const haveKeys = have.map(key);
    DIRECTORY_BY_PACK.designsystems.forEach((u) => expect(haveKeys).toContain(key(u)));
    expect(new Set(haveKeys).size).toBe(haveKeys.length);
    expect(have.length).toBeGreaterThan(100);
    const s = getCurationState();
    expect(
      s.groups.filter((g) => g.categoryId === id && g.label === 'Watched companies'),
    ).toHaveLength(1);
  });

  it('a trades track starts with only trades boards, none of the design systems ones', () => {
    const id = seedPack('trades');
    expect(watched(id)).toEqual(DIRECTORY_BY_PACK.trades);
    expect(watched(id).some((u) => DIRECTORY_BY_PACK.designsystems.includes(u))).toBe(false);
  });

  it('a blank track has none', () => {
    expect(watched(seedPack('blank'))).toEqual([]);
  });

  it('the watched group is never the featured Apply Now group', () => {
    const id = seedPack('designsystems');
    const g = getCurationState().groups.filter((x) => x.categoryId === id);
    expect(g.map((x) => x.label)).toContain('Watched companies');
  });

  it.each([
    ['Design Systems', 'designsystems'],
    ['design systems / design eng', 'designsystems'],
    ['Skilled Trades', 'trades'],
    ['Sheet Metal & Fab', 'trades'],
    ['ServiceNow', 'servicenow'],
    ['Implementation Consulting', 'consulting'],
    ['My own thing', undefined],
    ['', undefined],
  ])('packIdForLabel(%s) is %s', (label, id) => {
    expect(packIdForLabel(label)).toBe(id);
  });
});
