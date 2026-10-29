import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The curation store lazily creates a Supabase client; stub it so seeding stays local + offline.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({ upsert: async () => ({}), delete: () => ({ eq: async () => ({}) }) }),
  }),
}));

import { addCategory, getCurationState, replaceCurationState } from './curationStore';
import { packIdForLabel, seedPack, STARTER_PACKS, topUpFromPack } from './starterPacks';
import { DIRECTORY_BY_PACK, TARGETS_BY_PACK } from '../radar/directory';
import { readTargets, saveTarget } from '../feed/targets';
import { readMustInclude, saysDesignSystem } from '../feed/mustInclude';
import { parseBoardUrl } from '../feed/sources/ats';

afterEach(() => replaceCurationState({ categories: [], groups: [], tiles: [] }));

describe('seedPack', () => {
  it('seeds the design systems pack as a category with groups + tiles; location overrides', () => {
    const id = seedPack('designsystems', 'Denver, CO');
    const s = getCurationState();
    const cat = s.categories.find((c) => c.id === id)!;
    expect(cat.label).toBe('Design Systems');
    expect(cat.titles.length).toBeGreaterThan(0);
    expect(cat.atsRoles.length).toBeGreaterThan(0);
    expect(cat.location).toBe('Denver, CO');
    expect(s.groups.filter((g) => g.categoryId === id).length).toBeGreaterThan(0);
    expect(s.tiles.length).toBeGreaterThan(0);
  });

  it('optional titles replace the pack titles; an optional label names the track', () => {
    const id = seedPack('designsystems', '', { titles: ['Design Ops Lead'], label: 'Sample' });
    const cat = getCurationState().categories.find((c) => c.id === id)!;
    expect(cat.titles).toEqual(['Design Ops Lead']);
    expect(cat.label).toBe('Sample');
  });

  it('no location means anywhere: no pack defaults to "Remote" (Adrian 2026-10-22)', () => {
    STARTER_PACKS.forEach((p) => {
      const id = seedPack(p.id, '');
      expect(getCurationState().categories.find((c) => c.id === id)!.location).toBe('');
    });
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

  it.each([
    ['Design Systems', 'designsystems'],
    ['design systems / design eng', 'designsystems'],
    ['Skilled Trades', undefined],
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

  it('includes the Staff and Principal design systems title searches', () => {
    const id = seedPack('designsystems');
    const cat = getCurationState().categories.find((c) => c.id === id)!;
    expect(cat.titles).toEqual(
      expect.arrayContaining([
        'Design Systems Designer',
        'Design Systems Engineer',
        'Design Systems Technologist',
        'Staff Design Systems',
        'Principal Design Systems',
      ]),
    );
    // Live postings searches the first title on open; that stays the same.
    expect(cat.titles[0]).toBe('Design Systems Engineer');
  });

  it('is design-system-only (2026-10-23): every title and ATS role says the phrase, title only', () => {
    const id = seedPack('designsystems');
    const cat = getCurationState().categories.find((c) => c.id === id)!;
    expect(cat.label).toBe('Design Systems');
    for (const t of [...cat.titles, ...cat.atsRoles]) expect(saysDesignSystem(t)).toBe(true);
    for (const gone of ['Design Engineer', 'UI Engineer', 'Product Designer', 'Frontend Engineer'])
      expect(cat.titles).not.toContain(gone);
    expect(readMustInclude(id)).toMatchObject({ terms: ['design system'] });
  });

  it('a track made under the old pack label still belongs to the pack', () => {
    expect(packIdForLabel('Design Systems / Design Eng')).toBe('designsystems');
    expect(packIdForLabel('design systems')).toBe('designsystems');
  });

  it('an existing track picks the targets up from the pack update, keeping its own', () => {
    const id = addCategory({ label: 'Mine', titles: [], atsRoles: [] });
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
