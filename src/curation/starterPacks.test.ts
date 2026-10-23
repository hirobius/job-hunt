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
import { hasMustInclude, readMustInclude } from '../feed/mustInclude';
import { parseBoardUrl } from '../feed/sources/ats';
import { placeKey } from './localize';
import { CONSULTING_PACK, DESIGN_SYSTEMS_PACK, SERVICENOW_PACK, TRADES_PACK } from './packContent';

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
        'Design Systems Technologist',
        'Staff Design Systems',
        'Principal Design Systems',
      ]),
    );
    // Live postings searches the first title on open; that stays the same.
    expect(cat.titles[0]).toBe('Design Systems Engineer');
  });

  it('is systems-only (2026-10-23): every title and ATS role says system, must include is set', () => {
    const id = seedPack('designsystems');
    const cat = getCurationState().categories.find((c) => c.id === id)!;
    expect(cat.label).toBe('Design Systems');
    for (const t of [...cat.titles, ...cat.atsRoles]) expect(t).toMatch(/\bsystems?\b/i);
    for (const gone of ['Design Engineer', 'UI Engineer', 'Product Designer', 'Frontend Engineer'])
      expect(cat.titles).not.toContain(gone);
    expect(readMustInclude(id).terms).toEqual(['systems']);
    // Other packs get no rule.
    expect(hasMustInclude(seedPack('trades'))).toBe(false);
  });

  it('a track made under the old pack label still belongs to the pack', () => {
    expect(packIdForLabel('Design Systems / Design Eng')).toBe('designsystems');
    expect(packIdForLabel('design systems')).toBe('designsystems');
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

describe('starter links follow the track location (Adrian 2026-10-22)', () => {
  const tilesOf = (id: string) => {
    const s = getCurationState();
    const groups = new Set(s.groups.filter((g) => g.categoryId === id).map((g) => g.id));
    return s.tiles.filter((t) => groups.has(t.groupId));
  };
  const SEARCH_HOSTS = /indeed\.com|linkedin\.com\/jobs|ziprecruiter\.com/;

  it('with a location, every local search link uses it and none says Spokane', () => {
    for (const pack of ['trades', 'consulting']) {
      const tiles = tilesOf(seedPack(pack, 'Boise, ID'));
      const local = tiles.filter((t) => /Boise/.test(t.url));
      expect(local.length).toBeGreaterThan(0);
      tiles
        .filter((t) => SEARCH_HOSTS.test(t.url))
        .forEach((t) => {
          expect(t.url).not.toMatch(/spokane/i);
          expect(`${t.name} ${t.meta}`).not.toMatch(/spokane/i);
        });
      expect(local.map((t) => t.name).some((n) => n.includes('(Boise, ID)'))).toBe(true);
    }
  });

  it('with no location, the local search links carry no location at all', () => {
    const tiles = tilesOf(seedPack('trades', ''));
    const indeed = tiles.find((t) => t.url.includes('indeed.com/jobs?q=fabricator'))!;
    expect(new URL(indeed.url).searchParams.has('l')).toBe(false);
    expect(indeed.name).toBe('Indeed · Fabricator');
    tiles
      .filter((t) => SEARCH_HOSTS.test(t.url))
      .forEach((t) => expect(`${t.url} ${t.name} ${t.meta}`).not.toMatch(/spokane/i));
  });

  it('a remote search keeps its own location', () => {
    const tiles = tilesOf(seedPack('consulting', 'Boise, ID'));
    expect(tiles.some((t) => t.url.includes('l=Remote'))).toBe(true);
  });

  it('topping up a track whose location came back null from the database does not throw', () => {
    const id = seedPack('trades', 'Boise, ID');
    replaceCurationState({
      ...getCurationState(),
      categories: getCurationState().categories.map((c) =>
        c.id === id ? ({ ...c, location: null } as unknown as typeof c) : c,
      ),
      tiles: getCurationState().tiles.filter((t) => !/indeed/.test(t.url)),
    });
    expect(() => topUpFromPack(id, 'trades')).not.toThrow();
    expect(getCurationState().tiles.some((t) => /indeed/.test(t.url))).toBe(true);
  });

  it('topping up a track uses the track location too', () => {
    const id = seedPack('trades', 'Boise, ID');
    replaceCurationState({
      ...getCurationState(),
      tiles: getCurationState().tiles.filter((t) => !/indeed/.test(t.url)),
    });
    topUpFromPack(id, 'trades');
    const indeed = tilesOf(id).filter((t) => /indeed\.com/.test(t.url));
    expect(indeed.length).toBeGreaterThan(0);
    indeed.forEach((t) => expect(new URL(t.url).searchParams.get('l')).toBe('Boise, ID'));
  });
});

describe('top-up after the live release adds no duplicate links (review, finding 1)', () => {
  const PACKS = {
    trades: TRADES_PACK,
    consulting: CONSULTING_PACK,
    servicenow: SERVICENOW_PACK,
    designsystems: DESIGN_SYSTEMS_PACK,
  } as const;
  const urlsOf = (id: string) => {
    const s = getCurationState();
    const groups = new Set(s.groups.filter((g) => g.categoryId === id).map((g) => g.id));
    return s.tiles.filter((t) => groups.has(t.groupId)).map((t) => t.url);
  };
  // 2dd1e49 seeded the pack's links as written (Spokane), whatever the track's location.
  const asLiveRelease = (id: string, packId: keyof typeof PACKS) => {
    const s = getCurationState();
    const groups = s.groups.filter((g) => g.categoryId === id);
    replaceCurationState({
      ...s,
      tiles: s.tiles.map((t) => {
        const g = groups.find((x) => x.id === t.groupId);
        const raw = PACKS[packId].groups.find((pg) => pg.label === g?.label)?.tiles[t.sortOrder];
        return raw ? { ...t, name: raw.name, url: raw.url, meta: raw.meta } : t;
      }),
    });
  };

  for (const location of ['Spokane, WA', '', 'Seattle, WA']) {
    it(`a track seeded on the live release at "${location}" tops up with no duplicates`, () => {
      let spokaneLinks = 0;
      for (const packId of Object.keys(PACKS) as (keyof typeof PACKS)[]) {
        const id = seedPack(packId, location);
        asLiveRelease(id, packId);
        const before = urlsOf(id);
        spokaneLinks += before.filter((u) => /spokane/i.test(u)).length;
        expect(topUpFromPack(id, packId).tiles).toBe(0);
        expect(urlsOf(id)).toEqual(before);
      }
      expect(spokaneLinks).toBeGreaterThan(0);
    });
  }

  it('a track seeded with the old re-encoded localize also tops up with no duplicates', () => {
    const id = seedPack('trades', 'Seattle, WA');
    const s = getCurationState();
    replaceCurationState({
      ...s,
      tiles: s.tiles.map((t) => {
        const u = new URL(t.url);
        if (!u.searchParams.has('l')) return t;
        u.searchParams.set('l', 'Seattle, WA');
        return { ...t, url: u.toString() };
      }),
    });
    expect(topUpFromPack(id, 'trades').tiles).toBe(0);
  });

  it('no two links in a pack share a place-free key (the key never merges two searches)', () => {
    Object.values(PACKS).forEach((p) => {
      const urls = p.groups.flatMap((g) => g.tiles.map((t) => t.url));
      expect(new Set(urls.map(placeKey)).size).toBe(new Set(urls).size);
    });
  });
});
