import { describe, expect, it } from 'vitest';
import { partitionTiles } from './tileState';
import type { Tile } from './jobsData';
import type { Triage } from './tileTriage';

const tile = (url: string): Tile => ({ name: url, meta: '', url });
const urls = (ts: Tile[]) => ts.map((t) => t.url);

describe('partitionTiles', () => {
  const tiles = [tile('a'), tile('b'), tile('c'), tile('d')];

  it('returns all tiles visible, order preserved, when nothing is triaged', () => {
    const { visible, aside } = partitionTiles(tiles, { dismissed: [] });
    expect(urls(visible)).toEqual(['a', 'b', 'c', 'd']);
    expect(aside).toEqual([]);
  });

  it('drops set-aside tiles into aside, out of visible', () => {
    const { visible, aside } = partitionTiles(tiles, { dismissed: ['b'] });
    expect(urls(visible)).toEqual(['a', 'c', 'd']);
    expect(urls(aside)).toEqual(['b']);
  });

  it('old pin data no longer reorders the board (#19)', () => {
    const legacy = { pinned: ['c'], dismissed: [] } as unknown as Triage;
    expect(urls(partitionTiles(tiles, legacy).visible)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('removes saved tiles from the board and returns them as `saved` (issue #57)', () => {
    const { visible, saved } = partitionTiles(tiles, { dismissed: [] }, new Set(['d']));
    expect(urls(visible)).toEqual(['a', 'b', 'c']); // 'd' is gone from the board
    expect(urls(saved)).toEqual(['d']);
  });

  it('saved wins over set-aside — a saved+dismissed tile counts as saved, not aside', () => {
    const { visible, aside, saved } = partitionTiles(tiles, { dismissed: ['d'] }, new Set(['d']));
    expect(urls(visible)).toEqual(['a', 'b', 'c']);
    expect(urls(saved)).toEqual(['d']);
    expect(aside).toEqual([]);
  });
});
