import { describe, expect, it } from 'vitest';
import { mergeByKey } from './mergeByKey';

interface Item {
  id: string;
  val: string;
}

const getKey = (item: Item) => item?.id || '';

describe('mergeByKey', () => {
  it('rule 1: keeps local order', () => {
    const local: Item[] = [
      { id: 'a', val: 'local-a' },
      { id: 'b', val: 'local-b' },
      { id: 'c', val: 'local-c' },
    ];
    const cloud: Item[] = [];

    const result = mergeByKey(getKey, cloud, local);

    expect(result.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(result).toEqual(local);
  });

  it('rule 2: cloud wins on shared keys (replacing value while maintaining local position)', () => {
    const local: Item[] = [
      { id: 'a', val: 'local-a' },
      { id: 'b', val: 'local-b' },
      { id: 'c', val: 'local-c' },
    ];
    const cloud: Item[] = [
      { id: 'b', val: 'cloud-b' },
      { id: 'a', val: 'cloud-a' },
    ];

    const result = mergeByKey(getKey, cloud, local);

    expect(result.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(result).toEqual([
      { id: 'a', val: 'cloud-a' },
      { id: 'b', val: 'cloud-b' },
      { id: 'c', val: 'local-c' },
    ]);
  });

  it('rule 3: appends cloud-only items after local items', () => {
    const local: Item[] = [
      { id: 'a', val: 'local-a' },
      { id: 'b', val: 'local-b' },
    ];
    const cloud: Item[] = [
      { id: 'c', val: 'cloud-c' },
      { id: 'd', val: 'cloud-d' },
    ];

    const result = mergeByKey(getKey, cloud, local);

    expect(result.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(result).toEqual([
      { id: 'a', val: 'local-a' },
      { id: 'b', val: 'local-b' },
      { id: 'c', val: 'cloud-c' },
      { id: 'd', val: 'cloud-d' },
    ]);
  });

  it('rule 4: skips empty keys and falsy items', () => {
    const local = [
      { id: 'a', val: 'local-a' },
      null as unknown as Item,
      { id: '', val: 'empty-key' },
      undefined as unknown as Item,
    ];
    const cloud = [
      { id: 'b', val: 'cloud-b' },
      { id: '', val: 'cloud-empty-key' },
      null as unknown as Item,
    ];

    const result = mergeByKey(getKey, cloud, local);

    expect(result).toEqual([
      { id: 'a', val: 'local-a' },
      { id: 'b', val: 'cloud-b' },
    ]);
  });

  it('rule 5: allows null or undefined cloud/local inputs', () => {
    const items: Item[] = [{ id: 'a', val: 'val-a' }];

    expect(mergeByKey(getKey, null, items)).toEqual(items);
    expect(mergeByKey(getKey, undefined as unknown as Item[], items)).toEqual(items);
    expect(mergeByKey(getKey, items, null as unknown as Item[])).toEqual(items);
    expect(mergeByKey(getKey, null, null as unknown as Item[])).toEqual([]);
  });
});
