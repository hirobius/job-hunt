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
    ['design-systems', true],
    ['UI Systems', false],
    ['Systems Designer', false],
    ['System Design Lead', false],
    ['Ecosystem Lead', false],
    ['Design Engineer', false],
  ])('%s → %s', (s, want) => expect(saysSystem(s)).toBe(want));
});

describe('migrateSystemsOnly', () => {
  it('adds "design system" (title only) and switches off (not deletes) what never says it', () => {
    expect(migrateSystemsOnly([OLD])).toBe(1);
    const m = readMustInclude('ds1');
    expect(m.terms).toEqual(['design system']);
    expect(m.inText).toBe(false);
    expect(m.atsOff).toEqual(['design tokens', 'design engineer']);
    expect(activeAtsRoles(OLD.atsRoles, m)).toEqual([
      'design systems',
      'design system technologist',
    ]);
    const s = sweepOf('ds1', OLD.titles);
    expect(s.titles).toEqual(OLD.titles); // nothing deleted
    expect(activeTitles(s)).toEqual(['Design Systems Engineer']);
  });

  it('is idempotent: a second run moves nothing and changes nothing', () => {
    migrateSystemsOnly([OLD]);
    const before = JSON.stringify([getAllMustInclude(), getAllSweeps()]);
    expect(migrateSystemsOnly([OLD])).toBe(0);
    expect(JSON.stringify([getAllMustInclude(), getAllSweeps()])).toBe(before);
  });

  it('never touches an entry the user has: their terms stay, a cleared rule stays cleared', () => {
    setMustInclude('ds1', { terms: ['tokens'], phrase: true });
    expect(migrateSystemsOnly([OLD])).toBe(0);
    expect(readMustInclude('ds1').terms).toEqual(['tokens']);
    setMustInclude('ds1', { terms: [], phrase: true });
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
    setTitleOn('ds1', OLD.titles, 'Design Systems Engineer', true);
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

  describe('phrase move: the first move\'s bare "systems" becomes "design system"', () => {
    // The track as the first move left it (no phrase mark), plus a term of the user's own.
    const seedOld = (terms: string[]) =>
      setMustInclude('ds1', { terms, atsOff: ['design tokens'] });

    it.each([
      [['systems'], ['design system']],
      [
        ['Systems', 'tokens'],
        ['design system', 'tokens'],
      ],
      [['tokens'], ['tokens']],
      [['systems', 'design system'], ['design system']],
    ])('%j → %j, title only, once', (before, after) => {
      seedOld(before);
      migrateSystemsOnly([OLD]);
      const m = readMustInclude('ds1');
      expect(m.terms).toEqual(after);
      expect(m.inText).toBe(false);
      expect(m.phrase).toBe(true);
      expect(m.atsOff).toEqual(['design tokens']);
    });

    it('is idempotent: a second run changes nothing, a later "systems" of the user\'s stays', () => {
      seedOld(['systems']);
      expect(migrateSystemsOnly([OLD])).toBe(1);
      const once = JSON.stringify(getAllMustInclude());
      expect(migrateSystemsOnly([OLD])).toBe(0);
      expect(JSON.stringify(getAllMustInclude())).toBe(once);
      setMustInclude('ds1', { terms: ['design system', 'systems'] });
      expect(migrateSystemsOnly([OLD])).toBe(0);
      expect(readMustInclude('ds1').terms).toEqual(['design system', 'systems']);
    });

    it('a user who turned descriptions back on keeps them on', () => {
      seedOld(['systems']);
      migrateSystemsOnly([OLD]);
      setMustInclude('ds1', { inText: true });
      migrateSystemsOnly([OLD]);
      expect(readMustInclude('ds1').inText).toBeUndefined();
    });
  });
});
