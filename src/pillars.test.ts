import { describe, expect, it } from 'vitest';
import {
  BUILTIN_PILLARS,
  SHEET_METAL_PILLAR,
  WELDING_PILLAR,
  CONSTRUCTION_PILLAR,
  CROSS_CUTTING_GROUPS,
} from './pillars';

describe('built-in pillars', () => {
  it('exposes three well-formed trades pillars', () => {
    expect(BUILTIN_PILLARS).toHaveLength(3);
    for (const p of BUILTIN_PILLARS) {
      expect(p.titles.length).toBeGreaterThan(0);
      expect(p.atsRoles.length).toBeGreaterThan(0);
      expect(p.groups.length).toBeGreaterThan(0);
      expect(p.groups[0].tiles.length).toBeGreaterThan(0); // featured "Apply Now" tab
      expect(p.builtIn).toBe(true);
    }
  });

  it('leads with Sheet Metal & Fab and every trade defaults to entry-level, Spokane', () => {
    expect(BUILTIN_PILLARS[0]).toBe(SHEET_METAL_PILLAR);
    for (const p of BUILTIN_PILLARS) {
      expect(p.seniority).toBe('entry');
      expect(p.location).toContain('Spokane');
    }
  });

  it('resolves every referenced group id — pick() drops unknowns silently', () => {
    expect(SHEET_METAL_PILLAR.groups).toHaveLength(3); // sm-brief + smshops + machineshops
    expect(WELDING_PILLAR.groups).toHaveLength(3); // weld-brief + machineshops + concrete
    expect(CONSTRUCTION_PILLAR.groups).toHaveLength(3); // const-brief + unions + concrete
    expect(CROSS_CUTTING_GROUPS).toHaveLength(4); // income, hirenow, veteran, tools
  });

  it('uses unique pillar ids', () => {
    const ids = BUILTIN_PILLARS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
