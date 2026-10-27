import { describe, expect, it } from 'vitest';
import { DEFAULT_NAICS, cleanNaics, stateCodeFor } from './sam';

describe('stateCodeFor', () => {
  it.each([
    ['Spokane, WA', 'WA'],
    ['Spokane, wa', 'WA'],
    ['Spokane, Washington', 'WA'],
    ['Texas', 'TX'],
    ['Washington, DC', 'DC'],
    ['Portland, OR 97201', undefined],
    ['', undefined],
    ['Remote', undefined],
    ['London, UK', undefined],
  ])('%s → %s', (where, code) => expect(stateCodeFor(where)).toBe(code));
});

describe('cleanNaics', () => {
  it('keeps valid codes once, in order, capped at 10', () => {
    expect(cleanNaics([' 332322', '332322', 'abc', '1', '1234567', 541511, '54'])).toEqual([
      '332322',
      '54',
    ]);
    expect(cleanNaics(Array.from({ length: 12 }, (_, i) => String(330000 + i)))).toHaveLength(10);
    expect(cleanNaics('332322')).toEqual([]);
  });

  it('the defaults are sheet metal / fab then software / design', () => {
    expect(DEFAULT_NAICS).toEqual(['332322', '332312', '541511', '541512', '541430']);
  });
});
