// The theme burn's reveal front (#688). Pure and Node-safe. One fixed field is built once per
// burn: the distance from the origin (normalised to 0..1 over the box) plus a seeded multi-octave
// noise (burnt paper's outline). Each frame contours the field at one threshold t, so the edge only
// moves continuously: no re-randomising, no flicker. The hole (F < t) shows the new theme; the thin
// char band (t <= F < t + char) darkens the old one just ahead of the edge. The settings are locked
// (BURN); the cost per frame is one pass over a reused grid per contour.
import { curve, noise, simplify } from '../brand/flameEngine';

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
  // The rim is forced unburnt, just above each frame's cut (as the flame engine's 0-heat rim reads),
  // so every loop closes inside the grid.
  const rim = (v: number) => {
    for (let i = 0; i < W; i++) F[i] = F[(H - 1) * W + i] = v;
    for (let j = 0; j < H; j++) F[j * W] = F[j * W + W - 1] = v;
  };
  const march = marcher(F, W, H, c, x0, y0);
  const level = (t: number) => {
    rim(t + 1 / 40);
    let d = '';
    for (const loop of march(t)) d += curve(simplify(loop, 0.35), -2);
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

// Which two cell edges each case joins, as T R B L = 0 1 2 3 (two pairs for a saddle): the flame
// engine's table, so the burn's outline is the same shape its contours gave.
const TBL = [
  [],
  [3, 2],
  [2, 1],
  [3, 1],
  [1, 0],
  [3, 0, 1, 2],
  [2, 0],
  [3, 0],
  [0, 3],
  [0, 2],
  [0, 1, 2, 3],
  [0, 1],
  [1, 3],
  [1, 2],
  [2, 3],
  [],
];

/** Marching squares over the fixed field F at threshold t (inside = F < t), loops of points. The
 *  same cut as the flame engine's `contours`, without its Maps: every edge key indexes typed
 *  arrays allocated once per burn, so a frame allocates only its points (perf check, #688). */
function marcher(F: Float32Array, W: number, H: number, c: number, ox: number, oy: number) {
  const N = 2 * W * H;
  const next = new Int32Array(N);
  const px = new Float32Array(N),
    py = new Float32Array(N);
  const stamp = new Uint32Array(N); // a key's point is set in this frame when stamp === frame
  const used = new Uint32Array(N);
  const starts = new Int32Array(N);
  let frame = 0;
  return (t: number): Pt[][] => {
    frame++;
    let ns = 0;
    const f = (a: number, b: number) => (a - t) / (a - b);
    for (let j = 0; j < H - 1; j++)
      for (let i = 0; i < W - 1; i++) {
        const n = j * W + i;
        const a = F[n],
          b = F[n + 1],
          d = F[n + W + 1],
          e = F[n + W];
        const idx = (a < t ? 8 : 0) | (b < t ? 4 : 0) | (d < t ? 2 : 0) | (e < t ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const x = ox + i * c,
          y = oy + j * c;
        const tb = TBL[idx];
        for (let k = 0; k < tb.length; k++) {
          const s = tb[k];
          const key =
            s === 0 ? n * 2 : s === 1 ? (n + 1) * 2 + 1 : s === 2 ? (n + W) * 2 : n * 2 + 1;
          if (stamp[key] !== frame) {
            stamp[key] = frame;
            if (s === 0) ((px[key] = x + c * f(a, b)), (py[key] = y));
            else if (s === 1) ((px[key] = x + c), (py[key] = y + c * f(b, d)));
            else if (s === 2) ((px[key] = x + c * f(e, d)), (py[key] = y + c));
            else ((px[key] = x), (py[key] = y + c * f(a, e)));
          }
          if ((k & 1) === 0) {
            const s2 = tb[k + 1];
            next[key] =
              s2 === 0 ? n * 2 : s2 === 1 ? (n + 1) * 2 + 1 : s2 === 2 ? (n + W) * 2 : n * 2 + 1;
            starts[ns++] = key;
          }
        }
      }
    const loops: Pt[][] = [];
    for (let q = 0; q < ns; q++) {
      let k = starts[q];
      if (used[k] === frame) continue;
      const loop: Pt[] = [];
      while (used[k] !== frame) {
        used[k] = frame;
        loop.push([px[k], py[k]]);
        k = next[k];
      }
      if (loop.length > 5) loops.push(loop);
    }
    return loops;
  };
}
