// The flame sits on the logo's centre line (Adrian 2026-11-10: it sat ~8px right of the name on the
// sign-in screen, because the tuned centre, FLAME.cx, is not the box's middle).
import { describe, expect, it } from 'vitest';
import { FLAME, logoViewBox, stillFrame } from './flameEngine';

describe('the logo box', () => {
  it('is 94 x 146 and centred on the flame', () => {
    const [x, , w, h] = logoViewBox().split(' ').map(Number);
    expect([w, h]).toEqual([94, 146]);
    expect(x + w / 2).toBe(FLAME.cx);
  });

  it('the still flame’s body is within a unit of the box centre', () => {
    const n = (stillFrame()[0].match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    const xs = n.filter((_, i) => i % 2 === 0);
    const [x, , w] = logoViewBox().split(' ').map(Number);
    expect(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - (x + w / 2))).toBeLessThan(4);
  });
});
