import { describe, expect, it } from 'vitest';
import { BURN, createBurn } from './burnField';

describe('theme burn (#688)', () => {
  it('keeps the locked settings', () => {
    expect({ ...BURN }).toEqual({
      themeMs: 2000,
      cardMs: 450,
      rough: 0.7,
      scale: 140,
      octaves: 5,
      gain: 0.67,
      char: 35,
      charStrength: 0.35,
      easing: 'inOutSine',
      cell: 2,
      seed: 7,
      fps: 11,
      charOn: true,
    });
    expect(Object.isFrozen(BURN)).toBe(true);
  });

  it('starts with no hole, ends covering the box, and is the same field every run', () => {
    const a = createBurn(BURN, 120, 80, 100, 10);
    const b = createBurn(BURN, 120, 80, 100, 10);
    expect(a(0).hole).toBe('');
    const mid = a(0.5);
    expect(mid.hole.length).toBeGreaterThan(0);
    expect(mid.char.length).toBeGreaterThan(0);
    expect(b(0.5)).toEqual(mid);
    // At the end the hole is one loop round the whole box (and its margin).
    expect(a(1).hole.match(/M/g)?.length).toBe(1);
  });
});
