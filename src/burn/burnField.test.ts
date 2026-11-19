import { describe, expect, it } from 'vitest';
import { BURN, VARY, createBurn, pickVariant } from './burnField';

const SEEDED = { ...BURN, seed: 7 };

describe('theme burn (#688)', () => {
  it('keeps the locked settings', () => {
    expect({ ...BURN }).toEqual({
      themeMs: 1770,
      cardMs: 330,
      rough: 1,
      scale: 140,
      octaves: 7,
      gain: 0.47,
      char: 25,
      charStrength: 1,
      easing: 'linear',
      cell: 2,
      seed: null,
      fps: 22,
      charOn: true,
      edgeColor: 'cobalt',
      edgeOpacity: 1,
    });
    expect(Object.isFrozen(BURN)).toBe(true);
  });

  it('starts with no hole, ends covering the box, and is the same field every run with a seed', () => {
    const a = createBurn(SEEDED, 120, 80, 100, 10);
    const b = createBurn(SEEDED, 120, 80, 100, 10);
    expect(a(0).hole).toBe('');
    const mid = a(0.5);
    expect(mid.hole.length).toBeGreaterThan(0);
    expect(mid.char.length).toBeGreaterThan(0);
    expect(b(0.5)).toEqual(mid);
    // At the end the hole is one loop round the whole box (and its margin).
    expect(a(1).hole.match(/M/g)?.length).toBe(1);
  });

  it('picks a fresh shape per burn when the seed is null, fixed within the burn', () => {
    const a = createBurn(BURN, 120, 80, 100, 10);
    const b = createBurn(BURN, 120, 80, 100, 10);
    expect(a(0.5)).not.toEqual(b(0.5));
    // Within one burn the field is fixed: the same p gives the same frame.
    expect(a(0.5)).toEqual(a(0.5));
  });

  it("keeps the per-burn variation in range, also at the random source's extremes", () => {
    for (const rand of [() => 0, () => 0.999999, () => 1.5, () => -1, Math.random]) {
      for (let i = 0; i < 50; i++) {
        const v = pickVariant(BURN, rand);
        expect(Number.isInteger(v.seed)).toBe(true);
        expect(v.scaleK).toBeGreaterThanOrEqual(1 - VARY);
        expect(v.scaleK).toBeLessThanOrEqual(1 + VARY);
        expect(v.gainK).toBeGreaterThanOrEqual(1 - VARY);
        expect(v.gainK).toBeLessThanOrEqual(1 + VARY);
        expect(v.rot).toBeGreaterThanOrEqual(0);
        expect(v.rot).toBeLessThanOrEqual(2 * Math.PI);
      }
    }
    expect(pickVariant(SEEDED)).toEqual({ seed: 7, dx: 0, dy: 0, rot: 0, scaleK: 1, gainK: 1 });
  });

  it('always ends covering the box, whatever the variation', () => {
    for (const rand of [() => 0, () => 0.999999, Math.random, Math.random, Math.random]) {
      for (const [ox, oy] of [
        [0, 0],
        [120, 80],
        [60, 40],
      ]) {
        const f = createBurn(BURN, 120, 80, ox, oy, pickVariant(BURN, rand));
        expect(f(0).hole).toBe('');
        expect(f(1).hole.match(/M/g)?.length).toBe(1);
      }
    }
  });
});
