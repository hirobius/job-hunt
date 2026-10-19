import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteFilter,
  FILTERS_KEY,
  MAX_FILTERS_PER_TRACK,
  readFilters,
  saveFilter,
  sanitizeFilters,
  type SavedFilter,
} from './savedFilters';

const f = (name: string, o: Partial<SavedFilter> = {}): SavedFilter => ({
  name,
  term: 'design systems',
  where: 'Austin, TX',
  mode: 'hybrid',
  exclude: ['manager'],
  seniority: 'experienced',
  salaryFloor: 120000,
  salaryOnly: true,
  contractOnly: false,
  ...o,
});

beforeEach(() => localStorage.clear());

describe('saved filters', () => {
  it('round-trips through storage, per track', () => {
    saveFilter('t1', f('Austin contract', { contractOnly: true }));
    saveFilter('t2', f('Other'));
    expect(readFilters('t1')).toEqual([f('Austin contract', { contractOnly: true })]);
    expect(readFilters('t2').map((x) => x.name)).toEqual(['Other']);
    expect(readFilters('nope')).toEqual([]);
  });

  it('saving under an existing name replaces it, in place', () => {
    saveFilter('t1', f('A'));
    saveFilter('t1', f('B'));
    saveFilter('t1', f('a', { term: 'design engineer' }));
    expect(readFilters('t1').map((x) => [x.name, x.term])).toEqual([
      ['a', 'design engineer'],
      ['B', 'design systems'],
    ]);
  });

  it('keeps at most a dozen, dropping the oldest', () => {
    for (let i = 0; i < MAX_FILTERS_PER_TRACK + 3; i++) saveFilter('t1', f(`F${i}`));
    const names = readFilters('t1').map((x) => x.name);
    expect(names).toHaveLength(MAX_FILTERS_PER_TRACK);
    expect(names).not.toContain('F0');
    expect(names).toContain(`F${MAX_FILTERS_PER_TRACK + 2}`);
  });

  it('deletes by name', () => {
    saveFilter('t1', f('A'));
    saveFilter('t1', f('B'));
    deleteFilter('t1', 'A');
    expect(readFilters('t1').map((x) => x.name)).toEqual(['B']);
  });

  it('ignores a blank name', () => {
    saveFilter('t1', f('   '));
    expect(readFilters('t1')).toEqual([]);
  });

  describe('corrupt storage renders defaults', () => {
    it.each([
      ['not json', '{oops'],
      ['an array', '[1,2]'],
      ['a string', '"x"'],
      ['wrong types', JSON.stringify({ t1: 'nope' })],
    ])('%s', (_n, raw) => {
      localStorage.setItem(FILTERS_KEY, raw);
      expect(readFilters('t1')).toEqual([]);
      saveFilter('t1', f('A')); // and writing recovers
      expect(readFilters('t1')).toHaveLength(1);
    });

    it('keeps good entries and repairs bad fields', () => {
      const out = sanitizeFilters({
        t1: [
          {
            name: 'ok',
            term: 'x',
            mode: 'weird',
            seniority: 'huh',
            exclude: ['a', 5, ''],
            salaryFloor: -4,
          },
          { term: 'no name' },
          null,
        ],
      });
      expect(out.t1).toEqual([
        {
          name: 'ok',
          term: 'x',
          where: '',
          mode: 'any',
          exclude: ['a'],
          seniority: 'any',
          salaryFloor: undefined,
          salaryOnly: false,
          contractOnly: false,
        },
      ]);
    });
  });

  it('survives storage being unavailable', () => {
    const real = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(readFilters('t1')).toEqual([]);
    } finally {
      Storage.prototype.getItem = real;
    }
  });
});
