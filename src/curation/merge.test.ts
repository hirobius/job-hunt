import { describe, expect, it } from 'vitest';
import { mergeCuration, localOnlyCuration } from './merge';
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
