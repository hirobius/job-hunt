import { afterEach, describe, expect, it } from 'vitest';
import {
  createPillar,
  duplicatePillar,
  updatePillar,
  removePillar,
  getPillars,
  getActivePillarId,
  setActivePillar,
} from './pillarStore';
import { BUILTIN_PILLARS } from './pillars';

afterEach(() => {
  // tear down any user pillars created during a test; reset the active selection
  getPillars()
    .filter((p) => !p.builtIn)
    .forEach((p) => removePillar(p.id));
  setActivePillar(BUILTIN_PILLARS[0].id);
});

describe('pillar registry', () => {
  it('starts with the three trades built-ins', () => {
    expect(getPillars().filter((p) => p.builtIn)).toHaveLength(3);
  });

  it('creates a user pillar and makes it active', () => {
    const id = createPillar({ label: 'QA' });
    const p = getPillars().find((x) => x.id === id)!;
    expect(p.builtIn).toBe(false);
    expect(p.label).toBe('QA');
    expect(getActivePillarId()).toBe(id);
  });

  it('duplicates a built-in into an editable copy', () => {
    const id = duplicatePillar(BUILTIN_PILLARS[1].id); // Welding & Machining
    const p = getPillars().find((x) => x.id === id)!;
    expect(p.builtIn).toBe(false);
    expect(p.titles).toEqual(BUILTIN_PILLARS[1].titles);
  });

  it('updates user pillars but never built-ins', () => {
    updatePillar(BUILTIN_PILLARS[0].id, { label: 'HACKED' });
    expect(getPillars()[0].label).toBe(BUILTIN_PILLARS[0].label); // unchanged
    const id = createPillar({ label: 'X' });
    updatePillar(id, { label: 'Y' });
    expect(getPillars().find((p) => p.id === id)!.label).toBe('Y');
  });

  it('removing the active pillar falls back to a built-in', () => {
    const id = createPillar();
    expect(getActivePillarId()).toBe(id);
    removePillar(id);
    expect(getActivePillarId()).toBe(BUILTIN_PILLARS[0].id);
    expect(getPillars().some((p) => p.id === id)).toBe(false);
  });
});
