// The flame, drawn in code as a small physical system (Adrian 2026-11-10; it replaced the Visuals
// Lab's "Version E"). Pure and Node-safe (no DOM, no Vite imports): the app animates with it
// (flameMotion.ts, RoleFlame.tsx, and bootFlame.ts on the boot splash), and `npm run icons` writes its still frame to flame.svg, the static mark every
// icon derives from. Tune only through FLAME (the flame tuner page writes these numbers).
//
// LAYERS  Three colours (outer, middle, core). Each is its own heat field: its own body (an
//         ellipse with a width, a height above its centre, a height below, and a drop), and its
//         own share of the licks' heat (and for how many frames of a lick's life it takes it).
//         A layer is drawn where its heat is 1 or more.
// LICKS   Each lick is a particle: position, velocity, size, life. Born on the body, it rises
//         (buoyancy), is pushed by swirling air, wanders, slows (drag) and cools (shrinks).
//         It is drawn as a tongue along its own velocity: wide tail, pointed head.
export type Layer = {
  on: boolean;
  w: number;
  up: number;
  down: number;
  drop: number;
  share: number;
  hot: number;
  /** Shape and life of this layer's own body: a pointed top (0 = round), a top that leans from
   *  side to side, a size that pulses, how fast both move, and how wide licks are in this colour. */
  point: number;
  sway: number;
  breathe: number;
  pace: number;
  lickW: number;
};
export type FlameSettings = {
  fps: number;
  speed: number;
  seed: number;
  cx: number;
  foot: number;
  layers: [Layer, Layer, Layer];
  /** How far a body's heat reaches past its edge: higher fuses licks to the body sooner. */
  fuse: number;
  // Birth
  rate: number;
  burst: number;
  emitW: number;
  emitY: number;
  arc: number;
  launchUp: [number, number];
  launchOut: number;
  launchJitter: number;
  // Lick
  size: [number, number];
  life: [number, number];
  stretch: number;
  taper: number;
  head: number;
  cool: number;
  grow: number;
  // Air
  buoyancy: number;
  drag: number;
  swirl: number;
  swirlSize: number;
  swirlSpeed: number;
  fine: number;
  wander: number;
  wanderRate: number;
  gust: number;
  pull: number;
  lift: number;
  // Drawing
  cell: number;
  smooth: number;
  corner: number;
  /** The wordmark's letters flicker with the flame (flameMotion.ts). */
  tOn: 'off' | 'letters';
  tShake: number;
  tSkew: number;
  tFade: number;
  tEvery: number;
  /** Percent of the letters that move on each frame; the others hold their pose. */
  tPct: number;
};
/** Adrian's settings, 2026-11-10, as copied out of the flame tuner. Tune only here. */
export const FLAME: FlameSettings = {
  fps: 10,
  speed: 1,
  seed: 11,
  cx: 57.5,
  foot: 94.5,
  layers: [
    {
      on: true,
      w: 29.5,
      up: 37,
      down: 28.5,
      drop: -11,
      share: 0.7,
      hot: 40,
      point: 0,
      sway: 9.5,
      breathe: 0,
      pace: 0.41,
      lickW: 1.22,
    },
    {
      on: true,
      w: 22,
      up: 17,
      down: 25,
      drop: -10,
      share: 1.11,
      hot: 20,
      point: 0.9,
      sway: 11.5,
      breathe: 0.02,
      pace: 0.2,
      lickW: 0.64,
    },
    {
      on: false,
      w: 11,
      up: 24,
      down: 9,
      drop: 10.5,
      share: 1.86,
      hot: 6,
      point: 0,
      sway: 4,
      breathe: 0.08,
      pace: 0.25,
      lickW: 0.8,
    },
  ],
  fuse: 0.2,
  rate: 5.2,
  burst: 0.6,
  emitW: 18,
  emitY: 16,
  arc: 1.15,
  launchUp: [2.2, 3.5],
  launchOut: 2.4,
  launchJitter: 0.75,
  size: [14, 22],
  life: [12, 24],
  stretch: 2.6,
  taper: 1,
  head: 0.43,
  cool: 0.46,
  grow: 2,
  buoyancy: 0.81,
  drag: 0.855,
  swirl: 1.75,
  swirlSize: 15.5,
  swirlSpeed: 0.29,
  fine: 0.91,
  wander: 0.49,
  wanderRate: 0.47,
  gust: 0.12,
  pull: 0.033,
  lift: 0.65,
  cell: 2.25,
  smooth: 0.8,
  corner: -0.32,
  // The letters stand still (Adrian 2026-11-10: the shimmer bent the f and l). The rest is kept
  // so it can be tried again: a lean of 1 degree at most, no fade, a third of the letters a frame.
  tOn: 'off',
  tShake: 0,
  tSkew: 1,
  tFade: 0,
  tEvery: 1,
  tPct: 33,
};
type Pt = [number, number];
export function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(x: number, y: number, z: number, s: number) {
  let h =
    Math.imul(x, 374761393) ^
    Math.imul(y, 668265263) ^
    Math.imul(z, 2147483647) ^
    Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const sm = (t: number) => t * t * (3 - 2 * t);
export function noise(x: number, y: number, z: number, s: number) {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    zi = Math.floor(z);
  const xf = sm(x - xi),
    yf = sm(y - yi),
    zf = sm(z - zi);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz, s);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), xf), l(c(0, 1, 0), c(1, 1, 0), xf), yf),
    l(l(c(0, 0, 1), c(1, 0, 1), xf), l(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf,
  );
}
/** `noise` on one fixed z plane and seed, for a caller that samples it many times (the theme burn's
 *  field, #688): the z cell and its smoothed fraction are worked out once, and no closures are made
 *  per sample. The same sums in the same order as `noise`, so the values are identical. */
export function noisePlane(z: number, s: number) {
  const zi = Math.floor(z),
    zf = sm(z - zi),
    z1 = zi + 1;
  return (x: number, y: number) => {
    const xi = Math.floor(x),
      yi = Math.floor(y);
    const xf = sm(x - xi),
      yf = sm(y - yi);
    const x1 = xi + 1,
      y1 = yi + 1;
    const a0 = hash(xi, yi, zi, s),
      b0 = hash(x1, yi, zi, s),
      c0 = hash(xi, y1, zi, s),
      d0 = hash(x1, y1, zi, s);
    const a1 = hash(xi, yi, z1, s),
      b1 = hash(x1, yi, z1, s),
      c1 = hash(xi, y1, z1, s),
      d1 = hash(x1, y1, z1, s);
    const p0 = a0 + (b0 - a0) * xf,
      q0 = c0 + (d0 - c0) * xf;
    const r0 = p0 + (q0 - p0) * yf;
    const p1 = a1 + (b1 - a1) * xf,
      q1 = c1 + (d1 - c1) * xf;
    const r1 = p1 + (q1 - p1) * yf;
    return r0 + (r1 - r0) * zf;
  };
}
/** Marching squares at one level, segments joined into closed loops. */
/** Marching squares at heat 1 over a W x H grid (row-major), segments joined into closed loops. */
export function contours(
  g: Float32Array,
  W: number,
  H: number,
  c: number,
  ox: number,
  oy: number,
): Pt[][] {
  const f = (a: number, b: number) => (1 - a) / (b - a);
  // Each crossing sits on one grid edge: key it by that edge (even = the edge to the right of a
  // grid point, odd = the edge below it), so loops join exactly.
  const next = new Map<number, number>();
  const at = new Map<number, Pt>();
  // Which two cell edges each case joins, as T R B L = 0 1 2 3 (two pairs for a saddle).
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
  for (let j = 0; j < H - 1; j++)
    for (let i = 0; i < W - 1; i++) {
      const n = j * W + i;
      const a = g[n],
        b = g[n + 1],
        d = g[n + W + 1],
        e = g[n + W];
      const idx = (a > 1 ? 8 : 0) | (b > 1 ? 4 : 0) | (d > 1 ? 2 : 0) | (e > 1 ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const x = ox + i * c,
        y = oy + j * c;
      const key = [n * 2, (n + 1) * 2 + 1, (n + W) * 2, n * 2 + 1];
      const pt = (s: number): Pt =>
        s === 0
          ? [x + c * f(a, b), y]
          : s === 1
            ? [x + c, y + c * f(b, d)]
            : s === 2
              ? [x + c * f(e, d), y + c]
              : [x, y + c * f(a, e)];
      const t = TBL[idx];
      for (let k = 0; k < t.length; k += 2) {
        next.set(key[t[k]], key[t[k + 1]]);
        at.set(key[t[k]], pt(t[k]));
        at.set(key[t[k + 1]], pt(t[k + 1]));
      }
    }
  const loops: Pt[][] = [],
    seen = new Set<number>();
  for (const k0 of next.keys()) {
    if (seen.has(k0)) continue;
    const loop: Pt[] = [];
    let k: number | undefined = k0;
    while (k !== undefined && !seen.has(k)) {
      seen.add(k);
      loop.push(at.get(k)!);
      k = next.get(k);
    }
    if (loop.length > 5) loops.push(loop);
  }
  return loops;
}
export function simplify(p: Pt[], tol: number): Pt[] {
  if (p.length < 4) return p;
  const dp = (pts: Pt[]): Pt[] => {
    if (pts.length < 3) return pts;
    const [a, b] = [pts[0], pts[pts.length - 1]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let mi = 0,
      md = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d =
        Math.abs((b[0] - a[0]) * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * (b[1] - a[1])) / len;
      if (d > md) {
        md = d;
        mi = i;
      }
    }
    return md > tol
      ? dp(pts.slice(0, mi + 1))
          .slice(0, -1)
          .concat(dp(pts.slice(mi)))
      : [a, b];
  };
  // Split the loop at its top point (the tip) and the point farthest from it, so both survive
  // as vertices and neither half is a closed curve (which would collapse to a line).
  let top = 0;
  p.forEach((v, i) => {
    if (v[1] < p[top][1]) top = i;
  });
  let far = top,
    fd = -1;
  p.forEach((v, i) => {
    const d = Math.hypot(v[0] - p[top][0], v[1] - p[top][1]);
    if (d > fd) {
      fd = d;
      far = i;
    }
  });
  const [i0, i1] = top < far ? [top, far] : [far, top];
  const h1 = p.slice(i0, i1 + 1),
    h2 = p.slice(i1).concat(p.slice(0, i0 + 1));
  return dp(h1).slice(0, -1).concat(dp(h2).slice(0, -1));
}
/** A closed path through the points: sharp where the outline turns hard (a tip, a notch), a
 *  smooth curve everywhere else, so edges sweep and points stay points. */
export function curve(p: Pt[], corner: number): string {
  const n = p.length;
  if (n < 4) return '';
  const f = (v: Pt) => v[0].toFixed(1) + ',' + v[1].toFixed(1);
  const sharp = p.map((v, i) => {
    const a = p[(i + n - 1) % n],
      b = p[(i + 1) % n];
    const ux = v[0] - a[0],
      uy = v[1] - a[1],
      wx = b[0] - v[0],
      wy = b[1] - v[1];
    const c = (ux * wx + uy * wy) / ((Math.hypot(ux, uy) || 1) * (Math.hypot(wx, wy) || 1));
    return c < corner;
  });
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  // Start at a sharp point if there is one, else at an edge midpoint.
  const s0 = Math.max(0, sharp.indexOf(true));
  const q = p.slice(s0).concat(p.slice(0, s0)),
    sh = sharp.slice(s0).concat(sharp.slice(0, s0));
  let d = 'M' + f(sh[0] ? q[0] : mid(q[n - 1], q[0]));
  for (let i = sh[0] ? 1 : 0; i < n; i++) {
    const nx = q[(i + 1) % n],
      nsh = sh[(i + 1) % n];
    if (sh[i]) d += 'L' + f(q[i]);
    else d += 'Q' + f(q[i]) + ' ' + f(nsh ? nx : mid(q[i], nx));
  }
  return d + 'Z';
}

export type FlameFrame = [string, string, string];
export type Lick = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r0: number;
  age: number;
  life: number;
  w: number;
};

/** The air: which way it pushes at (x, y) at time t. A large swirl, a fine one, a gust. */
function air(S: FlameSettings, x: number, y: number, t: number): Pt {
  const k = 1 / Math.max(2, S.swirlSize);
  const a = noise(x * k, y * k - t * S.swirlSpeed, t * S.swirlSpeed * 0.9, S.seed + 1) - 0.5;
  const b =
    noise(
      x * k * 1.6 + 9,
      y * k * 1.6 - t * S.swirlSpeed * 1.7,
      t * S.swirlSpeed * 1.9,
      S.seed + 2,
    ) - 0.5;
  const c = noise(x * k * 0.7 + 4, y * k * 0.7, t * S.swirlSpeed, S.seed + 5) - 0.5;
  const high = Math.max(0, (S.foot - y) / 90);
  const gust = (noise(t * 0.09, 0, 0, S.seed + 3) - 0.5) * 2 * S.gust * (0.3 + high * 0.6);
  return [(a * 1.6 + b * 1.6 * S.fine) * S.swirl + gust, c * S.swirl * S.lift];
}

/** A lick's radius now: it grows in over its first frames, then cools to nothing. */
export function lickRadius(S: FlameSettings, l: Lick): number {
  const k = l.age / l.life;
  return l.r0 * (1 - k) ** S.cool * Math.min(1, S.grow <= 0 ? 1 : (l.age + 1) / (S.grow + 1));
}
/** A lick's tongue: tail point, head point. */
export function lickAxis(S: FlameSettings, l: Lick): [number, number, number, number] {
  const r = lickRadius(S, l),
    sp = Math.hypot(l.vx, l.vy) || 1;
  const len = Math.max(r * 0.9, sp * S.stretch);
  const ux = l.vx / sp,
    uy = l.vy / sp;
  return [
    l.x - ux * len * (1 - S.head),
    l.y - uy * len * (1 - S.head),
    l.x + ux * len * S.head,
    l.y + uy * len * S.head,
  ];
}
function lickHeat(
  S: FlameSettings,
  r: number,
  ax: [number, number, number, number],
  x: number,
  y: number,
  wide = 1,
): number {
  const ex = ax[2] - ax[0],
    ey = ax[3] - ax[1],
    L2 = ex * ex + ey * ey || 1;
  let h = ((x - ax[0]) * ex + (y - ax[1]) * ey) / L2;
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  const dx = x - (ax[0] + ex * h),
    dy = y - (ax[1] + ey * h);
  // Squared distances, so most cells (outside the lick) cost no square root.
  const R = (r * (S.taper === 1 ? 1 - h : (1 - h) ** S.taper) + 0.6) * wide;
  const q2 = (dx * dx + dy * dy) / (R * R);
  return q2 >= 1 ? 0 : (1 - q2) * (1 - q2);
}

function draw(S: FlameSettings, licks: Lick[], t = 0): FlameFrame {
  const c = Math.max(1, S.cell),
    ox = -30,
    oy = -70,
    W = Math.ceil(154 / c) + 1,
    H = Math.ceil(212 / c) + 1;
  const on = [0, 1, 2].filter((k) => S.layers[k].on);
  const sum = S.layers.map((Ly) => (Ly.on ? new Float32Array(W * H) : null));
  const wide = S.layers.map((Ly) => Math.max(0.05, Ly.lickW));
  const widest = Math.max(1, ...on.map((k) => wide[k]));
  // Each lick adds its heat to the cells under it only (its own box), in each colour that takes it.
  for (const l of licks) {
    const r = lickRadius(S, l);
    if (r < 1) continue;
    const ax = lickAxis(S, l),
      pad = r * widest + 1;
    const i0 = Math.max(1, Math.ceil((Math.min(ax[0], ax[2]) - pad - ox) / c)),
      i1 = Math.min(W - 2, Math.floor((Math.max(ax[0], ax[2]) + pad - ox) / c));
    const j0 = Math.max(1, Math.ceil((Math.min(ax[1], ax[3]) - pad - oy) / c)),
      j1 = Math.min(H - 2, Math.floor((Math.max(ax[1], ax[3]) + pad - oy) / c));
    const fade = 1 - 0.25 * (l.age / l.life);
    const wt = S.layers.map(
      (Ly) => (Ly.hot >= 40 ? 1 : Math.max(0, 1 - l.age / Math.max(1, Ly.hot))) * fade * Ly.share,
    );
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = ox + i * c,
          y = oy + j * c;
        let same = -1,
          last = 0;
        for (const k of on) {
          if (wt[k] <= 0) continue;
          const h = wide[k] === same ? last : lickHeat(S, r, ax, x, y, wide[k]);
          same = wide[k];
          last = h;
          if (h > 0) sum[k]![j * W + i] += h * wt[k];
        }
      }
  }
  return S.layers.map((Ly, k) => {
    const g = sum[k];
    if (!g) return '';
    // This layer's own motion this frame: where its top leans and how big it is.
    const lean0 = Ly.sway * 2 * (noise(t * Ly.pace, k * 7.3, 0, S.seed + 21) - 0.5);
    const size =
      1 + Ly.breathe * 2 * (noise(t * Ly.pace * 1.7 + 50, k * 3.1, 0, S.seed + 22) - 0.5);
    const cy = S.foot + Ly.drop,
      up = Math.max(1, Ly.up * size),
      w = Math.max(1, Ly.w * size),
      down = Math.max(1, Ly.down * size);
    const slope = (1 / Math.max(0.05, S.fuse)) * 1.6;
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const n = j * W + i;
        // The frame's edge is cold, so every loop closes.
        if (i === 0 || j === 0 || i === W - 1 || j === H - 1) {
          g[n] = -1;
          continue;
        }
        const x = ox + i * c,
          y = oy + j * c;
        // The layer's body: exactly this ellipse when no lick is near (heat 1 on its edge).
        // Above the centre, tt is 0 at the centre and 1 at the top: the top can lean (sway) and
        // close to a point. Below the centre it is a plain half ellipse.
        const tt = y < cy ? (cy - y) / up : 0;
        const narrow =
          Ly.point > 0 && tt > 0 ? Math.max(0.02, 1 - Math.min(1, tt)) ** (Ly.point * 0.7) : 1;
        const bx = (x - S.cx - lean0 * tt ** 1.5) / (w * narrow),
          by = y < cy ? tt : (y - cy) / down;
        const q = Math.sqrt(bx * bx + by * by);
        if (q <= 1 + S.fuse) g[n] += Math.max(0, 1 + (1 - q) * slope);
      }
    return contours(g, W, H, c, ox, oy)
      .map((l) => curve(simplify(l, S.smooth), S.corner))
      .join('');
  }) as FlameFrame;
}

/** A live fire: step() advances it one frame, draw() gives the three layers, licks is the state. */
export function createFire(S: FlameSettings = FLAME, seed = 1) {
  const R = rng(S.seed * 7919 + seed);
  const fire = { licks: [] as Lick[], t: 0, step, draw: () => draw(S, fire.licks, fire.t) };
  let owed = 0;
  function step() {
    fire.t++;
    owed += S.rate * (1 - S.burst / 2 + R() * S.burst);
    while (owed >= 1) {
      owed--;
      const a = (R() * 2 - 1) * S.arc;
      fire.licks.push({
        x: S.cx + Math.sin(a) * S.emitW,
        y: S.foot - Math.cos(a) * S.emitY,
        vx: Math.sin(a) * S.launchOut + (R() * 2 - 1) * S.launchJitter,
        vy: -(S.launchUp[0] + R() * Math.max(0, S.launchUp[1] - S.launchUp[0])),
        r0: S.size[0] + R() * Math.max(0, S.size[1] - S.size[0]),
        age: 0,
        w: R() * 6.28,
        life: Math.max(2, S.life[0] + R() * Math.max(0, S.life[1] - S.life[0])),
      });
    }
    for (const l of fire.licks) {
      const [ax, ay] = air(S, l.x, l.y, fire.t);
      l.vx =
        (l.vx + ax + Math.sin(l.age * S.wanderRate + l.w) * S.wander - (l.x - S.cx) * S.pull) *
        S.drag;
      l.vy = (l.vy - S.buoyancy + ay) * S.drag;
      l.x += l.vx;
      l.y += l.vy;
      l.age++;
    }
    fire.licks = fire.licks.filter((l) => l.age < l.life && l.y > -90);
  }
  for (let i = 0; i < 24; i++) step();
  return fire;
}
/** Endless: a live fire from `seed`. Each call advances it one frame and draws it; it never repeats. */
export function endlessFrames(S: FlameSettings, seed: number): () => FlameFrame {
  const f = createFire(S, seed);
  return () => {
    for (let i = 0; i < Math.max(1, Math.round(S.speed)); i++) f.step();
    return f.draw();
  };
}

/** The fire the still mark is taken from: one seed, so the logo never changes by itself. Picked by
 *  eye (`npm run icons` writes its first frame as flame.svg). There is no fixed loop anywhere: every
 *  moving flame is the live simulation. */
export const STILL_SEED = 21;

/** The static mark: the first frame of the STILL_SEED fire. flame.svg holds it (`npm run icons`). */
export function stillFrame(S: FlameSettings = FLAME): FlameFrame {
  return endlessFrames(S, STILL_SEED)();
}

/** The animated logo's box (RoleFlame.tsx and the share image): 94 x 146, centred on the flame's
 *  own centre line (FLAME.cx), so the flame sits on the name's centre whatever cx the tuner set. */
export function logoViewBox(S: FlameSettings = FLAME): string {
  return `${S.cx - 47} 0 94 146`;
}

/** The still frame's outer layer box, padded a unit and rounded out: flame.svg's viewBox. */
export function flameViewBox(S: FlameSettings = FLAME): [number, number, number, number] {
  const n = (stillFrame(S)[0].match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const xs = n.filter((_, i) => i % 2 === 0);
  const ys = n.filter((_, i) => i % 2 === 1);
  const x = Math.floor(Math.min(...xs)) - 1;
  const y = Math.floor(Math.min(...ys)) - 1;
  return [x, y, Math.ceil(Math.max(...xs)) + 1 - x, Math.ceil(Math.max(...ys)) + 1 - y];
}

/** flame.svg's text: the still frame's three layers, one over the other (each its own heat field,
 *  so none is clipped to another), filled with the given colours (HDS primitives: `npm run icons`
 *  reads them from variables.css). The classes let the app recolour each layer (base.css) and let
 *  flameMotion find the layers it animates. */
export function flameSvgFile(fills: [string, string, string], S: FlameSettings = FLAME): string {
  const d = stillFrame(S);
  return (
    '<!-- The flame: the one source of the logo, the still frame of src/brand/flameEngine.ts.\n' +
    '     Written by `npm run icons`; change the engine or its settings, run it, commit. -->\n' +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${flameViewBox(S).join(' ')}">\n` +
    d
      .map(
        (p, i) =>
          `  <path class="flame-${i + 1}" fill="${fills[i]}" fill-rule="evenodd" d="${p}"/>\n`,
      )
      .join('') +
    '</svg>\n'
  );
}
