import { beforeEach, describe, expect, it } from 'vitest';
import { migrateSystemsOnly, saysSystem } from './systemsOnly';
import {
  activeAtsRoles,
  getAllMustInclude,
  hasMustInclude,
  readMustInclude,
  setMustInclude,
} from './mustInclude';
import { activeTitles, getAllSweeps, setTitleOn, sweepFor } from './sweepTitles';

// Adrian's track as the old pack seeded it.
const OLD = {
  id: 'ds1',
  label: 'Design Systems / Design Eng',
  titles: ['Design Systems Engineer', 'Design Engineer', 'Product Designer', 'UI Systems Designer'],
  atsRoles: ['design systems', 'design tokens', 'design engineer', 'design system technologist'],
};
const sweepOf = (id: string, seed: string[]) => sweepFor(getAllSweeps(), id, seed);

beforeEach(() => localStorage.clear());

describe('saysSystem', () => {
  it.each([
    ['Design Systems Engineer', true],
    ['design system technologist', true],
    ['UI Systems', true],
    ['Systems Designer', true],
    ['Ecosystem Lead', false],
    ['Design Engineer', false],
  ])('%s → %s', (s, want) => expect(saysSystem(s)).toBe(want));
});

describe('migrateSystemsOnly', () => {
  it('adds systems and switches off (not deletes) titles and ATS roles that never say system', () => {
    expect(migrateSystemsOnly([OLD])).toBe(1);
    const m = readMustInclude('ds1');
    expect(m.terms).toEqual(['systems']);
    expect(m.atsOff).toEqual(['design tokens', 'design engineer']);
    expect(activeAtsRoles(OLD.atsRoles, m)).toEqual([
      'design systems',
      'design system technologist',
    ]);
    const s = sweepOf('ds1', OLD.titles);
    expect(s.titles).toEqual(OLD.titles); // nothing deleted
    expect(activeTitles(s)).toEqual(['Design Systems Engineer', 'UI Systems Designer']);
  });

  it('is idempotent: a second run moves nothing and changes nothing', () => {
    migrateSystemsOnly([OLD]);
    const before = JSON.stringify([getAllMustInclude(), getAllSweeps()]);
    expect(migrateSystemsOnly([OLD])).toBe(0);
    expect(JSON.stringify([getAllMustInclude(), getAllSweeps()])).toBe(before);
  });

  it('never touches an entry the user has: their terms stay, a cleared rule stays cleared', () => {
    setMustInclude('ds1', { terms: ['tokens'] });
    expect(migrateSystemsOnly([OLD])).toBe(0);
    expect(readMustInclude('ds1').terms).toEqual(['tokens']);
    setMustInclude('ds1', { terms: [] });
    expect(migrateSystemsOnly([OLD])).toBe(0);
    expect(readMustInclude('ds1').terms).toEqual([]);
    expect(hasMustInclude('ds1')).toBe(true);
  });

  it('a title switched back on after the move stays on', () => {
    migrateSystemsOnly([OLD]);
    setTitleOn('ds1', OLD.titles, 'Design Engineer', true);
    migrateSystemsOnly([OLD]);
    expect(activeTitles(sweepOf('ds1', OLD.titles))).toContain('Design Engineer');
  });

  it('keeps a sweep list the user already edited, switching off only its non-systems titles', () => {
    setTitleOn('ds1', OLD.titles, 'UI Systems Designer', false);
    migrateSystemsOnly([OLD]);
    expect(activeTitles(sweepOf('ds1', OLD.titles))).toEqual(['Design Systems Engineer']);
  });

  it('leaves other tracks alone', () => {
    const other = { ...OLD, id: 't2', label: 'Skilled Trades' };
    expect(migrateSystemsOnly([other])).toBe(0);
    expect(hasMustInclude('t2')).toBe(false);
    expect(getAllSweeps()).toEqual({});
  });

  it('matches the new pack label too', () => {
    expect(migrateSystemsOnly([{ ...OLD, label: 'Design Systems' }])).toBe(1);
  });
});
