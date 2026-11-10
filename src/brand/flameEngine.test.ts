// The flame is a stylized anime fire (Adrian 2026-11-10): a body that squashes and stretches on
// hard cuts, licks that climb its flanks, a tip that pinches off and rises, and a round core. These
// pin the settings, that the engine draws sane frames, that pieces break off, and that flame.svg
// (the static mark every icon derives from) is the engine's still frame, so the logo and its motion
// never drift apart.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  FLAME,
  FLAME_FRAMES,
  endlessFrames,
  flameViewBox,
  loopFrames,
  stillFrame,
} from './flameEngine';

const subpaths = (d: string) => d.match(/M/g)?.length ?? 0;
const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
const top = (d: string) => Math.min(...numbers(d).filter((_, i) => i % 2 === 1));

describe('the flame settings', () => {
  it('are the ones in use (change them here and run `npm run icons`)', () => {
    expect(FLAME).toEqual({
      fps: 10,
      width: 32,
      height: 106,
      stretch: 1,
      sway: 9,
      ripple: 0.09,
      sharp: 1.15,
      licks: 3,
      lickLen: 0.27,
      pieces: 3,
      pieceSize: 1,
      rise: 13,
      drift: 3.5,
      boil: 1,
      seed: 11,
      tOn: 'letters',
      tShake: 0,
      tSkew: 2.5,
      tFade: 0.05,
      tEvery: 1,
    });
  });
});

describe('the engine', () => {
  it('draws a loop of FLAME_FRAMES frames, three closed layers each, the same every time', () => {
    const a = loopFrames(FLAME);
    expect(a).toHaveLength(FLAME_FRAMES);
    for (const f of a) {
      expect(f).toHaveLength(3);
      for (const d of f) expect(d).toMatch(/^M[-\d.,LMZ]+Z$/);
    }
    expect(loopFrames(FLAME)).toEqual(a);
    expect(new Set(a.map((f) => f[0])).size).toBe(FLAME_FRAMES);
  });

  it('the still frame is the loop’s first frame: the body and its licks, no piece in the air', () => {
    const still = stillFrame();
    expect(subpaths(still[0])).toBe(1 + FLAME.licks);
    expect(loopFrames(FLAME)[0]).toEqual(still);
  });

  it('the tip pinches off: the body stretches, then drops while a piece rises and shrinks', () => {
    const loop = loopFrames(FLAME);
    const bodyTop = loop.map((f) => top(f[0].split('Z')[0]));
    // Frame 3 is the tallest (the pinch), frame 4 the drop.
    expect(Math.min(...bodyTop)).toBe(bodyTop[3]);
    expect(bodyTop[4] - bodyTop[3]).toBeGreaterThan(20);
    const bare = loopFrames({ ...FLAME, pieces: 0 });
    const piecesOf = (k: number) => loop[k][0].slice(bare[k][0].length);
    const tops = [4, 5, 6, 7].map((k) => top(piecesOf(k)));
    // It leaves from above the dropped body and climbs every frame.
    expect(tops[0]).toBeLessThan(bodyTop[4]);
    for (let i = 1; i < tops.length; i++) expect(tops[i]).toBeLessThan(tops[i - 1]);
  });

  it('endless never repeats, never draws a NaN, and throws pieces', () => {
    const next = endlessFrames(FLAME, 42);
    const frames = Array.from({ length: 40 }, () => next());
    expect(new Set(frames.map((f) => f.join())).size).toBe(40);
    for (const f of frames) for (const d of f) expect(numbers(d).every(Number.isFinite)).toBe(true);
    expect(frames.some((f) => subpaths(f[0]) > 1 + FLAME.licks)).toBe(true);
  });

  it('endless stays near the still frame (no runaway growth)', () => {
    const [x, y, w, h] = flameViewBox();
    const next = endlessFrames(FLAME, 7);
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

describe('one engine', () => {
  it('the animated logo draws with this engine, not a copy of it', () => {
    const src = readFileSync('src/brand/RoleFlame.tsx', 'utf8');
    expect(src).toMatch(/from '\.\/flameEngine'/);
    expect(src).not.toMatch(/function (rng|toD|body|drop)\b/);
  });
});
