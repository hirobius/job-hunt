import { describe, expect, it } from 'vitest';
import { BUILTIN_PILLARS, IT_PILLAR, DESIGN_PILLAR, CROSS_CUTTING_GROUPS } from './pillars';

describe('built-in pillars', () => {
  it('exposes two well-formed pillars', () => {
    expect(BUILTIN_PILLARS).toHaveLength(2);
    for (const p of BUILTIN_PILLARS) {
      expect(p.titles.length).toBeGreaterThan(0);
      expect(p.atsRoles.length).toBeGreaterThan(0);
      expect(p.groups.length).toBeGreaterThan(0);
      expect(p.groups[0].tiles.length).toBeGreaterThan(0); // featured "Apply Now" tab
      expect(p.builtIn).toBe(true);
    }
  });

  it('IT is entry-level; Design is experienced (entry filter off)', () => {
    expect(IT_PILLAR.seniority).toBe('entry');
    expect(DESIGN_PILLAR.seniority).toBe('experienced');
  });

  it('resolves every referenced group id — pick() drops unknowns silently', () => {
    expect(IT_PILLAR.groups).toHaveLength(10); // brief + 9 IT field groups
    expect(DESIGN_PILLAR.groups).toHaveLength(3); // design-brief + designtech + aieng
    expect(CROSS_CUTTING_GROUPS).toHaveLength(5); // income, hirenow, remoteboards, tools, veteran
  });

  it('uses unique pillar ids', () => {
    const ids = BUILTIN_PILLARS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
