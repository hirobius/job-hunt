// The flame's motion is Adrian's "Version E · final" (Visuals Lab, 2026-10-29): the "family" engine
// (squash / stretch / pinch keyframes, three layers, embers) in endless mode. These pin the settings
// as he locked them, that the engine draws sane frames, and that flame.svg (the static mark every
// icon derives from) is the engine's still frame, so the logo and its motion never drift apart.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  FLAME_E,
  FLAME_FRAMES,
  endlessFrames,
  flameViewBox,
  loopFrames,
  stillFrame,
} from './flameEngine';

const subpaths = (d: string) => d.match(/M/g)?.length ?? 0;
const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe('Version E settings', () => {
  it('are the ones Adrian locked in', () => {
    expect(FLAME_E).toEqual({
      fps: 10,
      intensity: 0.2,
      lock: 1.5,
      embers: 2,
      emberSize: 1.4,
      width: 1.36,
      height: 1,
      motion: 0.7,
      bulge: 0.04,
      sharp: 0.7,
      rand: 1.4,
      lag: 3,
      evar: 2.5,
      anim: 'endless',
      l1x: -3,
      l1y: 10,
      l1s: 1.12,
      l1p: 1,
      l1c: 0,
      l2x: 2.5,
      l2y: 3,
      l2s: 1.16,
      l2p: 1,
      l2c: 0,
      l3x: 4.5,
      l3y: 0,
      l3s: 1.42,
      l3p: 1,
      l3c: 0,
      l2m: 'fill',
      l3m: 'fill',
      fx: 0,
      fy: 13,
      fs: 1,
      tOn: 'letters',
      tShake: 0,
      tSkew: 2.5,
      tFade: 0.05,
      tEvery: 1,
      seed: 11,
      eDist: 16,
      eGap: 16.5,
      eLife: 4,
      eDrift: 7.5,
      eScatX: 25,
      eScatY: 19.5,
      eVarW: 0.6,
      eVarH: 0.65,
      eTilt: 0.3,
    });
  });
});

describe('the engine', () => {
  it('draws a loop of FLAME_FRAMES frames, three closed layers each, the same every time', () => {
    const a = loopFrames(FLAME_E);
    expect(a).toHaveLength(FLAME_FRAMES);
    for (const f of a) {
      expect(f).toHaveLength(3);
      for (const d of f) expect(d).toMatch(/^M[-\d.,LMZ]+Z$/);
    }
    expect(loopFrames(FLAME_E)).toEqual(a);
    expect(new Set(a.map((f) => f[0])).size).toBe(FLAME_FRAMES);
  });

  it('the still frame is the loop’s first body with no embers', () => {
    const still = stillFrame();
    expect(subpaths(still[0])).toBe(1);
    const first = loopFrames(FLAME_E)[0];
    expect(first[0].startsWith(still[0])).toBe(true);
    expect(first.slice(1)).toEqual(still.slice(1));
  });

  it('endless never repeats, never draws a NaN, and throws embers', () => {
    const next = endlessFrames(FLAME_E, 42);
    const frames = Array.from({ length: 40 }, () => next());
    expect(new Set(frames.map((f) => f.join())).size).toBe(40);
    for (const f of frames) for (const d of f) expect(numbers(d).every(Number.isFinite)).toBe(true);
    expect(frames.some((f) => subpaths(f[0]) > 1)).toBe(true);
  });

  it('endless stays near the still frame (no runaway growth)', () => {
    const [x, y, w, h] = flameViewBox();
    const next = endlessFrames(FLAME_E, 7);
    for (let i = 0; i < 200; i++) {
      const [body] = next()[0].split('Z');
      const n = numbers(body);
      const xs = n.filter((_, j) => j % 2 === 0);
      const ys = n.filter((_, j) => j % 2 === 1);
      expect(Math.min(...xs)).toBeGreaterThan(x - w * 0.5);
      expect(Math.max(...xs)).toBeLessThan(x + w * 1.5);
      expect(Math.min(...ys)).toBeGreaterThan(y - h * 0.5);
      expect(Math.max(...ys)).toBeLessThan(y + h * 1.2);
    }
  });
});

describe('flame.svg is the still frame (else run `npm run icons`)', () => {
  const svg = readFileSync('src/brand/flame.svg', 'utf8');
  const d = (cls: string) => new RegExp(`class="${cls}"[^>]*\\sd="([^"]+)"`).exec(svg)?.[1];

  it('its three layers are the engine’s', () => {
    expect([d('flame-1'), d('flame-2'), d('flame-3')]).toEqual(stillFrame());
  });

  it('its viewBox is the still frame’s box', () => {
    expect(/viewBox="([^"]+)"/.exec(svg)?.[1]).toBe(flameViewBox().join(' '));
  });
});
