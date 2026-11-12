// Prototype (proto/theme-burn): the burn front as a flame. Pure and Node-safe, built from the flame
// engine's own primitives (noise, swirling air, lick tongues, marching squares, sharp-corner curves),
// not a copy of it. A heat field grows from the front (radial from a point, or rising from the
// bottom), roughened by a fixed multi-octave noise (the paper's grain) and a flicker, plus lick
// particles shed along the front (buoyancy, swirl, wander, drag; launched up and outward). Each tick
// contours three levels: the hole (new surface), the middle band (flame layer 2) and the outer band
// (flame layer 1). Tune only through BURN (the burn tuner page writes these numbers).
import {
  FLAME,
  air,
  contours,
  curve,
  lickAxis,
  lickHeat,
  lickRadius,
  noise,
  rng,
  simplify,
  type FlameSettings,
  type Lick,
} from '../brand/flameEngine';

export type BurnSettings = {
  /** Contour ticks a second (the logo's 10: a hand-drawn step). */
  fps: number;
  themeMs: number;
  cardMs: number;
  /** Grid cell, px. */
  cell: number;
  smooth: number;
  corner: number;
  /** px of distance per unit of heat at the front (higher = softer reach of the noise). */
  ramp: number;
  /** Grain: amplitude (heat units), the largest scale (px), octaves, gain per octave. */
  grain: number;
  grainSize: number;
  octaves: number;
  gain: number;
  /** Flicker: a moving fine noise, amplitude and size (px). */
  flicker: number;
  flickerSize: number;
  /** Band widths in heat units: outer (layer 1) and middle (layer 2). */
  outer: number;
  middle: number;
  /** Licks: per 100px of front per tick, size scale (px per flame unit), heat gain. */
  rate: number;
  lickScale: number;
  lickGain: number;
  /** Engine settings for the licks and the air (birth speeds, life, buoyancy, swirl…). */
  launchUp: [number, number];
  launchOut: number;
  size: [number, number];
  life: [number, number];
  buoyancy: number;
  drag: number;
  swirl: number;
  swirlSize: number;
  swirlSpeed: number;
  wander: number;
  stretch: number;
  head: number;
  cool: number;
};

/** Adrian's look: the Flame tuner's numbers where they apply. */
export const BURN: BurnSettings = {
  fps: 10,
  themeMs: 900,
  cardMs: 500,
  cell: 2.25,
  smooth: 0.8,
  corner: -0.32,
  ramp: 26,
  grain: 2.2,
  grainSize: 220,
  octaves: 5,
  gain: 0.55,
  flicker: 0.35,
  flickerSize: 14,
  outer: 0.9,
  middle: 0.42,
  rate: 3,
  lickScale: 0.9,
  lickGain: 1.6,
  launchUp: [2.2, 3.5],
  launchOut: 2.4,
  size: [14, 22],
  life: [6, 14],
  buoyancy: FLAME.buoyancy,
  drag: FLAME.drag,
  swirl: FLAME.swirl,
  swirlSize: FLAME.swirlSize,
  swirlSpeed: FLAME.swirlSpeed,
  wander: FLAME.wander,
  stretch: FLAME.stretch,
  head: FLAME.head,
  cool: FLAME.cool,
};

export type BurnFrame = { hole: string; middle: string; outer: string };
export type BurnShape = { kind: 'radial'; x: number; y: number } | { kind: 'rise' };

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** A burn over a w×h box. frame(t in 0..1) gives three path sets in box px. */
export function createBurn(B: BurnSettings, w: number, h: number, shape: BurnShape, seed = (Math.random() * 1e9) | 0) {
  const S: FlameSettings = {
    ...FLAME,
    seed: seed % 997,
    launchUp: B.launchUp,
    launchOut: B.launchOut,
    size: B.size,
    life: B.life,
    buoyancy: B.buoyancy,
    drag: B.drag,
    swirl: B.swirl,
    swirlSize: B.swirlSize,
    swirlSpeed: B.swirlSpeed,
    wander: B.wander,
    stretch: B.stretch,
    head: B.head,
    cool: B.cool,
    foot: 1e4,
  };
  const R = rng(seed);
  const c = Math.max(1, B.cell),
    m = 3,
    ox = -m * c,
    oy = -m * c;
  const W = Math.ceil(w / c) + 2 * m + 1,
    H = Math.ceil(h / c) + 2 * m + 1;
  const k = B.lickScale;
  // The grain: fixed for this burn, so the edge has one shape that meanders as it moves.
  const grain = new Float32Array(W * H);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const x = ox + i * c,
        y = oy + j * c;
      let s = 0,
        a = 1,
        f = 1 / B.grainSize,
        tot = 0;
      for (let o = 0; o < B.octaves; o++) {
        s += a * (noise(x * f + o * 17.1, y * f - o * 9.3, o * 3.7, S.seed + 40 + o) - 0.5);
        tot += a;
        a *= B.gain;
        f *= 2.07;
      }
      grain[j * W + i] = (s / tot) * 2 * B.grain;
    }
  const cx = shape.kind === 'radial' ? shape.x : w / 2,
    cy = shape.kind === 'radial' ? shape.y : h;
  const far =
    shape.kind === 'radial'
      ? Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) + B.ramp * (B.grain + B.outer + 1.5)
      : h + B.ramp * (B.grain + B.outer + 1.5);
  const dist = (x: number, y: number) => (shape.kind === 'radial' ? Math.hypot(x - cx, y - cy) : h - y);
  let licks: Lick[] = [];
  let tick = 0;
  const g = new Float32Array(W * H);
  const lvl = new Float32Array(W * H);

  function shed(r: number) {
    const len = shape.kind === 'radial' ? Math.min(2 * Math.PI * r, 2 * (w + h)) : w;
    let n = (B.rate * len) / 100;
    while (n > 0 && (n >= 1 || R() < n)) {
      n--;
      let px: number, py: number, nx: number, ny: number;
      if (shape.kind === 'radial') {
        const a = R() * Math.PI * 2;
        nx = Math.cos(a);
        ny = Math.sin(a);
        px = cx + nx * r;
        py = cy + ny * r;
      } else {
        px = R() * w;
        py = h - r;
        nx = 0;
        ny = -1;
      }
      if (px < -20 || py < -20 || px > w + 20 || py > h + 20) continue;
      const up = S.launchUp[0] + R() * Math.max(0, S.launchUp[1] - S.launchUp[0]);
      licks.push({
        x: px / k,
        y: py / k,
        vx: nx * S.launchOut + (R() * 2 - 1) * 0.75,
        vy: ny * S.launchOut - up,
        r0: S.size[0] + R() * Math.max(0, S.size[1] - S.size[0]),
        age: 0,
        w: R() * 6.28,
        life: Math.max(2, S.life[0] + R() * Math.max(0, S.life[1] - S.life[0])),
      });
    }
  }
  function stepLicks() {
    for (const l of licks) {
      const [ax, ay] = air(S, l.x, l.y, tick);
      l.vx = (l.vx + ax + Math.sin(l.age * S.wanderRate + l.w) * S.wander) * S.drag;
      l.vy = (l.vy - S.buoyancy + ay) * S.drag;
      l.x += l.vx;
      l.y += l.vy;
      l.age++;
    }
    licks = licks.filter((l) => l.age < l.life);
  }
  const level = (off: number) => {
    for (let n = 0; n < g.length; n++) lvl[n] = g[n] + off;
    for (let i = 0; i < W; i++) lvl[i] = lvl[(H - 1) * W + i] = -1;
    for (let j = 0; j < H; j++) lvl[j * W] = lvl[j * W + W - 1] = -1;
    return contours(lvl, W, H, c, ox, oy)
      .map((p) => curve(simplify(p, B.smooth), B.corner))
      .join('');
  };

  return function frame(t: number): BurnFrame {
    tick++;
    const r = ease(Math.min(1, t)) * far;
    stepLicks();
    shed(r);
    const fz = tick * 0.6,
      ff = 1 / B.flickerSize;
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const x = ox + i * c,
          y = oy + j * c,
          n = j * W + i;
        const d = (r - dist(x, y)) / B.ramp;
        // Far from the front nothing changes: skip the flicker there.
        g[n] =
          1 + d + grain[n] + (Math.abs(d) < 4 ? B.flicker * 2 * (noise(x * ff, y * ff, fz, S.seed + 60) - 0.5) : 0);
      }
    for (const l of licks) {
      const lr = lickRadius(S, l);
      if (lr < 1) continue;
      const ax = lickAxis(S, l),
        pad = (lr + 1) * k;
      const i0 = Math.max(0, Math.floor((Math.min(ax[0], ax[2]) * k - pad - ox) / c)),
        i1 = Math.min(W - 1, Math.ceil((Math.max(ax[0], ax[2]) * k + pad - ox) / c));
      const j0 = Math.max(0, Math.floor((Math.min(ax[1], ax[3]) * k - pad - oy) / c)),
        j1 = Math.min(H - 1, Math.ceil((Math.max(ax[1], ax[3]) * k + pad - oy) / c));
      const wt = B.lickGain * (1 - 0.4 * (l.age / l.life));
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const hh = lickHeat(S, lr, ax, (ox + i * c) / k, (oy + j * c) / k);
          if (hh > 0) g[j * W + i] += hh * wt;
        }
    }
    return { hole: level(0), middle: level(B.middle), outer: level(B.outer) };
  };
}

/** The ring between two levels, as one evenodd path. */
export const ring = (outer: string, inner: string) => outer + inner;
