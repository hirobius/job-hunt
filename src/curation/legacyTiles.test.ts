import { describe, expect, it } from 'vitest';
import { foldLegacyTiles, MY_LINKS } from './legacyTiles';
import { EMPTY_CURATION, type CurationState } from './types';

const NOW = '2026-10-12T00:00:00.000Z';
let n = 0;
const opts = { newId: () => `id${n++}`, now: NOW };
const tile = (url: string, name = '') => ({ name, meta: 'Added by you', url });

const withTrack = (): CurationState => ({
  categories: [
    {
      id: 'c1',
      label: 'Design',
      titles: [],
      atsRoles: [],
      seniority: 'any',
      location: '',
      tailorRole: null,
      sortOrder: 0,
      archived: false,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  groups: [
    {
      id: 'g1',
      categoryId: 'c1',
      label: 'Apply now',
      sortOrder: 0,
      archived: false,
      createdAt: NOW,
    },
    { id: 'g2', categoryId: 'c1', label: 'Boards', sortOrder: 5, archived: false, createdAt: NOW },
  ],
  tiles: [
    {
      id: 't1',
      groupId: 'g1',
      name: 'Have',
      url: 'https://have.example',
      meta: '',
      sortOrder: 0,
      createdAt: NOW,
    },
  ],
});

describe('foldLegacyTiles', () => {
  it('no legacy tiles → same state object', () => {
    const s = withTrack();
    expect(foldLegacyTiles(s, [], opts)).toBe(s);
  });

  it('appends a "My links" group LAST in the first track (never the featured first group)', () => {
    const out = foldLegacyTiles(withTrack(), [tile('https://a.example', 'A')], opts);
    const g = out.groups.find((x) => x.label === MY_LINKS)!;
    expect(g.categoryId).toBe('c1');
    expect(g.sortOrder).toBe(6);
    const t = out.tiles.filter((x) => x.groupId === g.id);
    expect(t.map((x) => [x.name, x.url])).toEqual([['A', 'https://a.example']]);
  });

  it('skips URLs the board already has and duplicates within the input', () => {
    const out = foldLegacyTiles(
      withTrack(),
      [tile('https://have.example'), tile('https://b.example'), tile('https://b.example')],
      opts,
    );
    expect(out.tiles.map((t) => t.url)).toEqual(['https://have.example', 'https://b.example']);
  });

  it('names a nameless tile from its URL', () => {
    const out = foldLegacyTiles(withTrack(), [tile('https://www.acme.com/careers')], opts);
    expect(out.tiles[out.tiles.length - 1].name).toMatch(/^Acme/);
  });

  it('creates a "My links" track when there are no tracks', () => {
    const out = foldLegacyTiles(EMPTY_CURATION, [tile('https://a.example')], opts);
    expect(out.categories.map((c) => c.label)).toEqual([MY_LINKS]);
    expect(out.groups).toHaveLength(1);
    expect(out.tiles).toHaveLength(1);
  });

  it('is idempotent: re-folding the same tiles is a no-op', () => {
    const once = foldLegacyTiles(withTrack(), [tile('https://a.example')], opts);
    expect(foldLegacyTiles(once, [tile('https://a.example')], opts)).toBe(once);
  });

  it('reuses an existing "My links" group', () => {
    const once = foldLegacyTiles(withTrack(), [tile('https://a.example')], opts);
    const twice = foldLegacyTiles(once, [tile('https://c.example')], opts);
    expect(twice.groups.filter((g) => g.label === MY_LINKS)).toHaveLength(1);
    expect(twice.tiles).toHaveLength(3);
  });
});
