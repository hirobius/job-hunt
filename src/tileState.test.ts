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

  it('removes saved tiles from the board and returns them as `saved` (issue #57)', () => {
    const { visible, saved } = partitionTiles(tiles, { pinned: [], dismissed: [] }, new Set(['d']));
    expect(urls(visible)).toEqual(['a', 'b', 'c']); // 'd' is gone from the board
    expect(urls(saved)).toEqual(['d']);
  });

  it('saved wins over set-aside — a saved+dismissed tile counts as saved, not aside', () => {
    const { visible, aside, saved } = partitionTiles(
      tiles,
      { pinned: [], dismissed: ['d'] },
      new Set(['d']),
    );
    expect(urls(visible)).toEqual(['a', 'b', 'c']);
    expect(urls(saved)).toEqual(['d']);
    expect(aside).toEqual([]);
  });

  it('a pinned + set-aside tile is set aside (not visible)', () => {
    const { visible, aside } = partitionTiles(tiles, { pinned: ['b'], dismissed: ['b'] });
    expect(urls(visible)).not.toContain('b');
    expect(urls(aside)).toContain('b');
  });
});
