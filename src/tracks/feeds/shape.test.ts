import { describe, expect, it } from 'vitest';
import { isoDate, pick, rowsOf } from './shape';

describe('shape helpers', () => {
  it('read the first field that is there, nested too', () => {
    expect(pick({ a: '', b: { c: 'x' } }, 'a', 'b.c')).toBe('x');
    expect(rowsOf({ data: [1] }, 'jobs', 'data')).toEqual([1]);
    expect(rowsOf([2])).toEqual([2]);
    expect(rowsOf('nope', 'jobs')).toEqual([]);
    expect(isoDate('1794700800')).toBe('2026-11-15T00:00:00.000Z');
    expect(isoDate('2026-11-14')).toBe('2026-11-14T00:00:00.000Z');
    expect(isoDate('soon')).toBeUndefined();
  });
});
