import { describe, expect, it } from 'vitest';
import { mergeCuration, localOnlyCuration, reconcileCuration } from './merge';
import type { Category, CurationState, Group, Tile } from './types';

// Minimal fixtures — id is all the merge cares about; other fields just prove which copy won.
const cat = (id: string, label: string): Category => ({
  id,
  label,
  titles: [],
  atsRoles: [],
  seniority: 'any',
  location: 'Remote',
  tailorRole: null,
  sortOrder: 0,
  archived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});
const grp = (id: string, label: string): Group => ({
  id,
  categoryId: 'c1',
  label,
  sortOrder: 0,
  archived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
});
const tile = (id: string, name: string): Tile => ({
  id,
  groupId: 'g1',
  name,
  url: 'https://x.example',
  meta: '',
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const state = (over: Partial<CurationState>): CurationState => ({
  categories: [],
  groups: [],
  tiles: [],
  ...over,
});

describe('mergeCuration', () => {
  const cases: {
    name: string;
    cloud: CurationState | null;
    local: CurationState;
    expectLabels: string[];
  }[] = [
    {
      name: 'cloud wins on a shared id',
      cloud: state({ categories: [cat('a', 'cloud')] }),
      local: state({ categories: [cat('a', 'local')] }),
      expectLabels: ['cloud'],
    },
    {
      name: 'local-only rows survive',
      cloud: state({ categories: [cat('a', 'cloud')] }),
      local: state({ categories: [cat('a', 'local'), cat('b', 'local-only')] }),
      expectLabels: ['cloud', 'local-only'],
    },
    {
      name: 'cloud-only rows are appended after local',
      cloud: state({ categories: [cat('z', 'cloud-only')] }),
      local: state({ categories: [cat('a', 'local')] }),
      expectLabels: ['local', 'cloud-only'],
    },
    {
      name: 'null cloud keeps local as-is',
      cloud: null,
      local: state({ categories: [cat('a', 'local')] }),
      expectLabels: ['local'],
    },
  ];

  cases.forEach(({ name, cloud, local, expectLabels }) => {
    it(name, () => {
      expect(mergeCuration(cloud, local).categories.map((c) => c.label)).toEqual(expectLabels);
    });
  });

  it('merges all three tables independently', () => {
    const cloud = state({
      categories: [cat('a', 'cloud')],
      groups: [grp('g', 'cloud')],
      tiles: [tile('t', 'cloud')],
    });
    const local = state({
      categories: [cat('a', 'local'), cat('b', 'keep')],
      groups: [grp('g2', 'keep')],
      tiles: [tile('t', 'local')],
    });
    const merged = mergeCuration(cloud, local);
    expect(merged.categories.map((c) => c.label)).toEqual(['cloud', 'keep']);
    expect(merged.groups.map((g) => g.label)).toEqual(['keep', 'cloud']);
    expect(merged.tiles.map((t) => t.name)).toEqual(['cloud']);
  });
});

describe('localOnlyCuration', () => {
  it('returns rows present locally but absent from the cloud', () => {
    const cloud = state({ categories: [cat('a', 'cloud')] });
    const local = state({ categories: [cat('a', 'local'), cat('b', 'new')] });
    expect(localOnlyCuration(cloud, local).categories.map((c) => c.id)).toEqual(['b']);
  });

  it('treats the whole local state as local-only when cloud is null', () => {
    const local = state({ categories: [cat('a', 'x')], tiles: [tile('t', 'y')] });
    const out = localOnlyCuration(null, local);
    expect(out.categories.map((c) => c.id)).toEqual(['a']);
    expect(out.tiles.map((t) => t.id)).toEqual(['t']);
  });

  it('returns nothing to upload when cloud already has every id', () => {
    const cloud = state({ groups: [grp('g', 'c')] });
    const local = state({ groups: [grp('g', 'l')] });
    expect(localOnlyCuration(cloud, local).groups).toEqual([]);
  });
});

describe('reconcileCuration — deletions elsewhere stay deleted', () => {
  const T0 = '2026-01-01T00:00:00.000Z'; // fixtures' createdAt
  const BEFORE = '2025-12-31T00:00:00.000Z';
  const AFTER = '2026-02-01T00:00:00.000Z';
  const state = (c: Category[], g: Group[] = [], t: Tile[] = []): CurationState => ({
    categories: c,
    groups: g,
    tiles: t,
  });

  it('never synced on this device → keep + upload every local-only row', () => {
    const r = reconcileCuration(state([]), state([cat('c1', 'Mine')]), null);
    expect(r.next.categories.map((c) => c.id)).toEqual(['c1']);
    expect(r.upload.categories.map((c) => c.id)).toEqual(['c1']);
  });

  it('a local-only row older than the last sync was deleted elsewhere → dropped, not re-uploaded', () => {
    const r = reconcileCuration(state([]), state([cat('c1', 'Deleted on B')]), AFTER);
    expect(r.next.categories).toEqual([]);
    expect(r.upload.categories).toEqual([]);
  });

  it('a local-only row created after the last sync is new here → kept + uploaded', () => {
    const r = reconcileCuration(state([]), state([cat('c1', 'New')]), BEFORE);
    expect(r.upload.categories.map((c) => c.id)).toEqual(['c1']);
  });

  it('cloud wins on shared ids and cloud-only rows arrive', () => {
    const r = reconcileCuration(
      state([cat('c1', 'cloud'), cat('c2', 'only-cloud')]),
      state([cat('c1', 'local')]),
      AFTER,
    );
    expect(r.next.categories.map((c) => c.label)).toEqual(['cloud', 'only-cloud']);
    expect(r.upload.categories).toEqual([]);
  });

  it('children of a dropped parent are dropped too (no FK orphans uploaded)', () => {
    const newTile = { ...tile('t1', 'x'), createdAt: AFTER };
    const r = reconcileCuration(
      state([]),
      state([cat('c1', 'gone')], [grp('g1', 'gone')], [newTile]),
      AFTER,
    );
    expect(r.next).toEqual(state([], [], []));
    expect(r.upload).toEqual(state([], [], []));
    expect(T0 < AFTER).toBe(true);
  });
});
