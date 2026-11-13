// The theme burn's reveal front (#688). Pure and Node-safe. One fixed field is built once per
// burn: the distance from the origin (normalised to 0..1 over the box) plus a seeded multi-octave
// noise (burnt paper's outline). Each frame contours the field at one threshold t, so the edge only
// moves continuously: no re-randomising, no flicker. The hole (F < t) shows the new theme; the thin
// char band (t <= F < t + char) darkens the old one just ahead of the edge. The settings are locked
// (BURN); the cost per frame is one pass over a reused grid per contour.
import { contours, curve, noise, simplify } from '../brand/flameEngine';

export type Easing = 'inOutCubic' | 'inOutQuad' | 'inOutSine' | 'linear';
export type BurnSettings = {
  themeMs: number;
  cardMs: number;
  /** Edge roughness: noise amplitude, in units of the box's largest distance. */
  rough: number;
  /** Largest noise scale, px. */
  scale: number;
  octaves: number;
  /** Amplitude kept per octave. */
  gain: number;
  /** Char band width, px (0 = none), and its strength (opacity of the darkening). */
  char: number;
  charStrength: number;
  /** Char band on or off. */
  charOn: boolean;
  easing: Easing;
  /** Field grid cell, px. */
  cell: number;
  seed: number;
  /** Frames per second of the front's progress: each step is held 1/fps. */
  fps: number;
};

/** Locked by Adrian (2026-11-12). Do not tune here without his say. */
export const BURN: Readonly<BurnSettings> = Object.freeze({
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

export const EASE: Record<Easing, (t: number) => number> = {
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  linear: (t) => t,
};

export type BurnFrame = { hole: string; char: string };
type Pt = [number, number];

/** Build the field for a w×h box burning from (ox, oy); returns frame(p), p in 0..1 (linear time). */
export function createBurn(S: BurnSettings, w: number, h: number, ox: number, oy: number) {
  const c = S.cell;
  // Two cells of margin, forced unburnt on the rim, so every loop closes and the end covers the box.
  const W = Math.ceil(w / c) + 5,
    H = Math.ceil(h / c) + 5;
  const x0 = -2 * c,
    y0 = -2 * c;
  const D =
    Math.max(
      Math.hypot(ox, oy),
      Math.hypot(w - ox, oy),
      Math.hypot(ox, h - oy),
      Math.hypot(w - ox, h - oy),
    ) || 1;
  const F = new Float32Array(W * H);
  let norm = 0;
  for (let o = 0, a = 1; o < S.octaves; o++, a *= S.gain) norm += a;
  const amp = (S.rough * 2) / norm;
  // Per-octave frequencies and amplitudes, computed once.
  const ks: number[] = [],
    as: number[] = [];
  for (let o = 0, a = 1, k = 1 / Math.max(4, S.scale); o < S.octaves; o++, a *= S.gain, k *= 2) {
    ks.push(k);
    as.push(a);
  }
  let lo = Infinity,
    hi = -Infinity;
  for (let j = 0; j < H; j++) {
    const y = y0 + j * c,
      dy = y - oy;
    for (let i = 0; i < W; i++) {
      const x = x0 + i * c;
      let n = 0;
      for (let o = 0; o < ks.length; o++)
        n += as[o] * noise(x * ks[o], y * ks[o], o * 3.1, S.seed + o);
      const v = Math.hypot(x - ox, dy) / D + amp * n - S.rough;
      F[j * W + i] = v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  // One grid, reused by every contour; its rim stays 0 (unburnt) and is never written.
  const g = new Float32Array(W * H);
  const level = (t: number) => {
    for (let j = 1; j < H - 1; j++) {
      const r = j * W;
      for (let i = 1; i < W - 1; i++) g[r + i] = 1 + (t - F[r + i]) * 40;
    }
    let d = '';
    for (const loop of contours(g, W, H, c, x0, y0)) d += curve(simplify(loop as Pt[], 0.35), -2);
    return d;
  };
  const charOn = S.charOn && S.char > 0 && S.charStrength > 0;
  const charN = charOn ? S.char / D : 0;
  const ease = EASE[S.easing];
  return (p: number): BurnFrame => {
    const e = ease(Math.min(1, Math.max(0, p)));
    const t = lo - 0.002 + (hi - lo + charN + 0.004) * e;
    return { hole: level(t), char: charOn ? level(t + charN) : '' };
  };
}
