import { describe, expect, it } from 'vitest';
import {
  BUILTIN_PILLARS,
  SHEET_METAL_PILLAR,
  WELDING_PILLAR,
  CONSTRUCTION_PILLAR,
  DESIGN_SYSTEMS_PILLAR,
  CONSULTING_PILLAR,
  CROSS_CUTTING_GROUPS,
} from './pillars';

describe('built-in pillars', () => {
  it('exposes five well-formed pillars', () => {
    expect(BUILTIN_PILLARS).toHaveLength(5);
    for (const p of BUILTIN_PILLARS) {
      expect(p.titles.length).toBeGreaterThan(0);
      expect(p.atsRoles.length).toBeGreaterThan(0);
      expect(p.groups.length).toBeGreaterThan(0);
      expect(p.groups[0].tiles.length).toBeGreaterThan(0); // featured "Apply Now" tab
      expect(p.builtIn).toBe(true);
    }
  });

  it('leads with Sheet Metal & Fab; the three trades default to entry-level Spokane', () => {
    expect(BUILTIN_PILLARS[0]).toBe(SHEET_METAL_PILLAR);
    for (const p of [SHEET_METAL_PILLAR, WELDING_PILLAR, CONSTRUCTION_PILLAR]) {
      expect(p.seniority).toBe('entry');
      expect(p.location).toContain('Spokane');
    }
  });

  it('adds a Design Systems track that is remote + experienced (the parallel non-trades pillar)', () => {
    expect(BUILTIN_PILLARS).toContain(DESIGN_SYSTEMS_PILLAR);
    expect(DESIGN_SYSTEMS_PILLAR.seniority).toBe('experienced');
    expect(DESIGN_SYSTEMS_PILLAR.location).toBe('Remote');
    expect(DESIGN_SYSTEMS_PILLAR.groups[0].id).toBe('ds-brief');
  });

  it('adds an Implementation Consulting track that is remote+Spokane + experienced', () => {
    expect(BUILTIN_PILLARS).toContain(CONSULTING_PILLAR);
    expect(CONSULTING_PILLAR.seniority).toBe('experienced');
    expect(CONSULTING_PILLAR.location).toContain('Remote');
    expect(CONSULTING_PILLAR.location).toContain('Spokane');
    expect(CONSULTING_PILLAR.groups[0].id).toBe('ic-brief');
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
