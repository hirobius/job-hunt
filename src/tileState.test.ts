import { describe, expect, it } from 'vitest';
import { partitionTiles } from './tileState';
import type { Tile } from './jobsData';

const tile = (url: string): Tile => ({ name: url, meta: '', url });
const urls = (ts: Tile[]) => ts.map((t) => t.url);

describe('partitionTiles', () => {
  const tiles = [tile('a'), tile('b'), tile('c'), tile('d')];

  it('returns all tiles visible, order preserved, when nothing is triaged', () => {
    const { visible, aside } = partitionTiles(tiles, { pinned: [], dismissed: [] });
    expect(urls(visible)).toEqual(['a', 'b', 'c', 'd']);
    expect(aside).toEqual([]);
  });

  it('drops set-aside tiles into aside, out of visible', () => {
    const { visible, aside } = partitionTiles(tiles, { pinned: [], dismissed: ['b'] });
    expect(urls(visible)).toEqual(['a', 'c', 'd']);
    expect(urls(aside)).toEqual(['b']);
  });

  it('floats pinned tiles to the top, preserving relative order otherwise', () => {
    const { visible } = partitionTiles(tiles, { pinned: ['c'], dismissed: [] });
    expect(urls(visible)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('saved tiles float like pins (issue #13 — save is the one "I care" gesture)', () => {
    const { visible } = partitionTiles(tiles, { pinned: [], dismissed: [] }, new Set(['d']));
    expect(urls(visible)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('a pinned + set-aside tile is set aside (not visible)', () => {
    const { visible, aside } = partitionTiles(tiles, { pinned: ['b'], dismissed: ['b'] });
    expect(urls(visible)).not.toContain('b');
    expect(urls(aside)).toContain('b');
  });
});
