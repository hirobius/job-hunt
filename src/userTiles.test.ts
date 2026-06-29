import { afterEach, describe, expect, it } from 'vitest';
import { addUserTilesFromText, removeUserTile, replaceUserTiles, getUserTiles } from './userTiles';

afterEach(() => {
  replaceUserTiles([]);
});

describe('user tiles — paste in', () => {
  it('parses one tile per URL found and derives a name', () => {
    const n = addUserTilesFromText(
      'check these:\nhttps://jobs.lever.co/acme/medical-assistant-apprentice and https://example.com/program',
    );
    expect(n).toBe(2);
    const tiles = getUserTiles();
    expect(tiles).toHaveLength(2);
    expect(tiles.map((t) => t.url)).toContain(
      'https://jobs.lever.co/acme/medical-assistant-apprentice',
    );
    expect(tiles[0].name).toBeTruthy();
  });

  it('dedupes URLs already added', () => {
    addUserTilesFromText('https://x.com/a');
    const added = addUserTilesFromText('https://x.com/a https://x.com/b');
    expect(added).toBe(1); // only the new one
    expect(getUserTiles()).toHaveLength(2);
  });

  it('ignores text with no URLs', () => {
    expect(addUserTilesFromText('no links here')).toBe(0);
    expect(getUserTiles()).toHaveLength(0);
  });

  it('removes a tile by url', () => {
    addUserTilesFromText('https://x.com/a https://x.com/b');
    removeUserTile('https://x.com/a');
    expect(getUserTiles().map((t) => t.url)).toEqual(['https://x.com/b']);
  });

  it('replaceUserTiles fills missing names and drops malformed entries', () => {
    replaceUserTiles([
      { name: '', meta: '', url: 'https://x.com/c' },
      { name: 'keep', meta: 'm', url: '' } as never,
    ]);
    const tiles = getUserTiles();
    expect(tiles).toHaveLength(1);
    expect(tiles[0].name).toBeTruthy();
  });
});
