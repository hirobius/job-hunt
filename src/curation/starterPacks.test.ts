import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The curation store lazily creates a Supabase client; stub it so seeding stays local + offline.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({ upsert: async () => ({}), delete: () => ({ eq: async () => ({}) }) }),
  }),
}));

import { getCurationState, replaceCurationState } from './curationStore';
import { packIdForLabel, seedPack, STARTER_PACKS, topUpFromPack } from './starterPacks';
import { DIRECTORY_BY_PACK, TARGETS_BY_PACK } from '../radar/directory';
import { readTargets, saveTarget } from '../feed/targets';
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

  it('Build your own is named after its first title, not "Build your own" (an instruction)', () => {
    const id = seedPack('blank', '', { titles: ['  Design Engineer '] });
    expect(getCurationState().categories.find((c) => c.id === id)!.label).toBe('Design Engineer');
    const bare = seedPack('blank');
    expect(getCurationState().categories.find((c) => c.id === bare)!.label).toBe('My track');
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

// #198: the design systems track carries its target companies as outreach rows too (the original 23
// from the 2026-10-12 Role Radar research), and the Staff / Principal title searches.
describe('design systems targets track (#198)', () => {
  beforeEach(() => localStorage.clear());

  it('seeds the original 23 companies as outreach targets, each with its watched board', () => {
    const id = seedPack('designsystems');
    const targets = readTargets(id);
    expect(targets).toHaveLength(23);
    expect(targets.map((t) => t.company)).toEqual(
      TARGETS_BY_PACK.designsystems.map((t) => t.company),
    );
    expect(targets[0]).toMatchObject({
      login: 'langchain',
      company: 'LangChain',
      board: { kind: 'ashby', slug: 'langchain' },
    });
    expect(targets.every((t) => !t.repo)).toBe(true);
    // Same companies as the first 23 watched boards: none invented.
    expect(TARGETS_BY_PACK.designsystems.map((t) => t.url)).toEqual(
      DIRECTORY_BY_PACK.designsystems.slice(0, 23),
    );
  });

  it('other packs seed no outreach targets', () => {
    expect(readTargets(seedPack('trades'))).toEqual([]);
    expect(readTargets(seedPack('blank'))).toEqual([]);
  });

  it('includes the Staff and Principal design systems title searches', () => {
    const id = seedPack('designsystems');
    const cat = getCurationState().categories.find((c) => c.id === id)!;
    expect(cat.titles).toEqual(
      expect.arrayContaining([
        'Design Systems Designer',
        'Design Systems Engineer',
        'Design Technologist',
        'Staff Design Systems',
        'Principal Design Systems',
      ]),
    );
    // Live postings searches the first title on open; that stays the same.
    expect(cat.titles[0]).toBe('Design Systems Engineer');
  });

  it('an existing track picks the targets up from the pack update, keeping its own', () => {
    const id = seedPack('blank');
    saveTarget(id, {
      login: 'stripe',
      company: 'My Stripe note',
      board: { kind: 'greenhouse', slug: 'stripe' },
    });
    const r = topUpFromPack(id, 'designsystems');
    expect(r.targets).toBe(22);
    const list = readTargets(id);
    expect(list).toHaveLength(23);
    expect(list.find((t) => t.login === 'stripe')!.company).toBe('My Stripe note');
    expect(topUpFromPack(id, 'designsystems').targets).toBe(0);
  });
});
