import { describe, expect, it } from 'vitest';
import { chunkMeta, itemsInLine, MAX_META_ITEMS, metaLines } from './metaLines';

describe('metaLines (#192)', () => {
  it('puts at most two items on a line and the rest on their own', () => {
    expect(metaLines(['Acme Cloud', 'Remote', 'Applied 3 days ago'])).toEqual([
      'Acme Cloud · Remote',
      'Applied 3 days ago',
    ]);
  });
  it('drops empty items and keeps one line for one or two', () => {
    expect(metaLines(['', 'Acme', null, false])).toEqual(['Acme']);
    expect(metaLines(['A', 'B'])).toEqual(['A · B']);
    expect(metaLines([])).toEqual([]);
  });
  it('bites: every line it builds holds at most the limit, and the counter sees a bad line', () => {
    for (const n of [1, 2, 3, 4, 5, 7])
      for (const line of metaLines(Array.from({ length: n }, (_, i) => `item ${i}`)))
        expect(itemsInLine(line)).toBeLessThanOrEqual(MAX_META_ITEMS);
    expect(itemsInLine('Acme Cloud · Remote · Applied 3 days ago')).toBe(3);
    expect(chunkMeta([1, 2, 3])).toEqual([[1, 2], [3]]);
  });
});
