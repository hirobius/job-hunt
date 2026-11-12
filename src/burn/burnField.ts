// Prototype (proto/theme-burn): the reveal front for the theme switch and card burns. Pure and
// Node-safe. One fixed field is built once per burn: the distance from the origin (normalised to
// 0..1 over the box) plus a seeded multi-octave noise (burnt paper's outline). Each frame contours
// the field at one threshold t, so the edge only ever moves continuously: no stepping, no
// re-randomising, no flicker. The hole (F < t) shows the new surface; the thin char band
// (t <= F < t + char) darkens the old surface just ahead of the edge. Tune only through BURN (the
// Burn tuner page writes these numbers). Uses the flame engine's noise and marching squares.
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
  easing: Easing;
  /** Field grid cell, px. */
  cell: number;
  seed: number;
};

export const BURN: BurnSettings = {
  themeMs: 1000,
  cardMs: 450,
  rough: 0.32,
  scale: 180,
  octaves: 5,
  gain: 0.52,
  char: 10,
  charStrength: 0.35,
  easing: 'inOutCubic',
  cell: 4,
  seed: 7,
};

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
  const D = Math.max(Math.hypot(ox, oy), Math.hypot(w - ox, oy), Math.hypot(ox, h - oy), Math.hypot(w - ox, h - oy)) || 1;
  const F = new Float32Array(W * H);
  let norm = 0;
  for (let o = 0, a = 1; o < S.octaves; o++, a *= S.gain) norm += a;
  let lo = Infinity,
    hi = -Infinity;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const x = x0 + i * c,
        y = y0 + j * c;
      let n = 0;
      for (let o = 0, a = 1, k = 1 / Math.max(4, S.scale); o < S.octaves; o++, a *= S.gain, k *= 2)
        n += a * noise(x * k, y * k, o * 3.1, S.seed + o);
      const v = Math.hypot(x - ox, y - oy) / D + S.rough * (n / norm - 0.5) * 2;
      F[j * W + i] = v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  const rim = (i: number, j: number) => i === 0 || j === 0 || i === W - 1 || j === H - 1;
  const g = new Float32Array(W * H);
  const level = (t: number) => {
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) g[j * W + i] = rim(i, j) ? 0 : 1 + (t - F[j * W + i]) * 40;
    let d = '';
    for (const loop of contours(g, W, H, c, x0, y0)) d += curve(simplify(loop as Pt[], 0.35), -2);
    return d;
  };
  const charN = S.char / D;
  const ease = EASE[S.easing];
  return (p: number): BurnFrame => {
    const e = ease(Math.min(1, Math.max(0, p)));
    const t = lo - 0.002 + (hi - lo + charN + 0.004) * e;
    const hole = level(t);
    return { hole, char: S.char > 0 && S.charStrength > 0 ? level(t + charN) : '' };
  };
}
