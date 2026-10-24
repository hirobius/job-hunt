// The brand flame engine (version E of the flame logo artifact, Adrian 2026-10-24):
// pure geometry, no DOM. Every frame is drawn fresh ("endless"); a seed makes a run repeatable.
type Pt = [number, number];
type Poly = Pt[];
type Rand = () => number;

// mulberry32: a small seeded generator, so the still frame is the same every time.
export function rng(seed: number): Rand {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toD(polys: Poly[]): string {
  return polys
    .map((p) => {
      let a = 0;
      for (let i = 0; i < p.length; i++) {
        const q = p[(i + 1) % p.length];
        a += p[i][0] * q[1] - q[0] * p[i][1];
      }
      const pts = a < 0 ? p.slice().reverse() : p;
      return 'M' + pts.map((v) => `${v[0].toFixed(1)},${v[1].toFixed(1)}`).join('L') + 'Z';
    })
    .join('');
}

function drop(cx: number, cy: number, r: number, lean: number, sx = 1, sy = 1, k = 1.3): Poly {
  const p: Poly = [];
  for (let i = 0; i < 28; i++) {
    const t = (2 * Math.PI * i) / 28;
    const x = r * sx * Math.sin(t) * Math.pow(Math.abs(Math.sin(t / 2)), 1.2);
    const y = -r * sy * Math.cos(t) * k;
    p.push([cx + x * Math.cos(lean) - y * Math.sin(lean), cy + x * Math.sin(lean) + y * Math.cos(lean)]);
  }
  return p;
}

// Version E's settings, as locked in the artifact.
export const S = {
  fps: 6, intensity: 0.95, emberSize: 1.4, width: 1.44, height: 1.12, motion: 0.4, bulge: 0,
  sharp: 0.7, rand: 2, lag: 1, evar: 1, embers: 3,
  l1x: -3, l1y: 10, l1s: 1.12, l1p: 1, l1c: 0,
  l2x: 2.5, l2y: 3, l2s: 1.06, l2p: 1, l2c: 0,
  l3x: 4.5, l3y: 0, l3s: 1.36, l3p: 2, l3c: 20,
  fx: 0, fy: 15.5, fs: 1.2,
  tSkew: 2.5, tFade: 0.05,
  eDist: 19.5, eGap: 6, eLife: 6, eDrift: 7.5, eScatX: 14, eScatY: 18.5, eVarW: 0.3, eVarH: 0.65, eTilt: 0.3,
  seed: 11,
} as const;

type Key = { W: number; H: number; lean: number; neck: number; wave: number; aL: number; aR: number; hook: number; side: [number, number, number] | null };
const K: Key[] = [
  { W: 30, H: 86, lean: 4, neck: 0, wave: 3, aL: 1.08, aR: 0.92, hook: 8, side: null },
  { W: 27, H: 106, lean: -6, neck: 0, wave: 4, aL: 0.9, aR: 1.1, hook: -10, side: [13, 30, 9] },
  { W: 23, H: 124, lean: 4, neck: 0.62, wave: 4, aL: 1.05, aR: 0.95, hook: 6, side: null },
  { W: 26, H: 100, lean: 2, neck: 0, wave: 3, aL: 0.95, aR: 1.08, hook: -6, side: null },
  { W: 32, H: 82, lean: -4, neck: 0, wave: 3, aL: 0.92, aR: 1.1, hook: -8, side: null },
  { W: 27, H: 104, lean: 6, neck: 0, wave: 4, aL: 1.1, aR: 0.9, hook: 10, side: [-13, 28, -9] },
  { W: 23, H: 120, lean: -4, neck: 0.6, wave: 4, aL: 0.95, aR: 1.05, hook: -6, side: null },
  { W: 26, H: 98, lean: -2, neck: 0, wave: 3, aL: 1.08, aR: 0.94, hook: 6, side: null },
];
const KN = K.length;
const mH = K.reduce((s, k) => s + k.H / KN, 0);
const mW = K.reduce((s, k) => s + k.W / KN, 0);
const LAYERS = [
  { sw: 1, sh: 1, dx: 0, bot: 142 },
  { sw: 0.66, sh: 0.7, dx: -4, bot: 138 },
  { sw: 0.38, sh: 0.46, dx: -6, bot: 134 },
];
const LAYER = [
  { x: S.l1x, y: S.l1y, s: S.l1s, p: S.l1p, c: S.l1c },
  { x: S.l2x, y: S.l2y, s: S.l2s, p: S.l2p, c: S.l2c },
  { x: S.l3x, y: S.l3y, s: S.l3s, p: S.l3p, c: S.l3c },
];

function body(cx: number, bot: number, W: number, H: number, lean: number, neck: number, wave: number, ph: number, aL: number, aR: number, hook: number): Poly {
  const L: Poly = [];
  const R: Poly = [];
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    let f = s < 0.42 ? Math.sqrt(Math.max(0, 1 - Math.pow(1 - s / 0.42, 2))) : Math.pow((1 - s) / 0.58, S.sharp);
    f *= 1 - neck * Math.exp(-Math.pow((s - 0.78) / 0.05, 2));
    const x = cx + lean * s * s + wave * Math.sin(Math.PI * 2 * s + ph) * s + hook * Math.pow(Math.max(0, s - 0.55), 2) * 5;
    const y = bot - H * s;
    const wl = W * f * aL * (1 + S.bulge * Math.sin(Math.PI * 3.2 * s + ph));
    const wr = W * f * aR * (1 + S.bulge * Math.sin(Math.PI * 3.2 * s + ph + 2.1));
    L.push([x - wl, y]);
    R.push([x + wr, y]);
  }
  return L.concat(R.reverse());
}

function tongue(bx: number, by: number, w: number, len: number, bend: number): Poly {
  const l: Poly = [];
  const r: Poly = [];
  for (let i = 0; i <= 14; i++) {
    const s = i / 14;
    const x = bx + bend * s * s;
    const y = by - len * s;
    const hw = w * Math.pow(1 - s, S.sharp * 0.67) * (1 + 0.3 * Math.sin(Math.PI * s));
    l.push([x - hw, y]);
    r.push([x + hw, y]);
  }
  return l.concat(r.reverse());
}

function keyframe(i: number) {
  const k = K[((i % KN) + KN) % KN];
  const I = S.intensity;
  const m = S.motion * I;
  return {
    W: (mW + (k.W - mW) * m) * 1.03,
    H: mH + (k.H - mH) * m,
    lean: k.lean * Math.min(1, m * 2) * I,
    neck: k.neck * 0.8 * Math.min(1, m * 2),
    wave: k.wave * I,
    aL: 1 + (k.aL - 1) * I,
    aR: 1 + (k.aR - 1) * I,
    hook: k.hook * I,
    side: k.side,
  };
}

type Frame = { layers: [Poly[], Poly[], Poly[]]; tip: Pt };

function frame(f: number, R: Rand): Frame {
  const layers: Poly[][] = [];
  let tip: Pt = [47, 40];
  for (let li = 0; li < 3; li++) {
    const Ly = LAYERS[li];
    const C = LAYER[li];
    const k = keyframe(f - li * S.lag);
    const jt = li ? S.rand * S.intensity : 0;
    const sw = Ly.sw * C.s * S.width;
    const sh = Ly.sh * C.s * S.height;
    let W = k.W * sw * (1 + jt * (R() * 0.16 - 0.08));
    let H = k.H * sh * (1 + jt * (R() * 0.14 - 0.07));
    let lean = k.lean * sh + jt * (R() * 6 - 3);
    let hook = k.hook * sh * (1 + jt * (R() - 0.5)) + jt * (R() * 6 - 3);
    let ph = f * 1.7 + jt * R() * 6.28;
    let aL = k.aL + jt * (R() * 0.16 - 0.08);
    let aR = k.aR + jt * (R() * 0.16 - 0.08);
    const cx = 47 + Ly.dx * S.width + C.x + jt * (R() * 3 - 1.5);
    const bot = Ly.bot - (142 - Ly.bot) * (S.height - 1) - C.y;
    // Endless: each frame varies a little from its keyframe, so it never repeats.
    const v = S.evar * S.intensity;
    W *= 1 + v * (R() * 0.12 - 0.06);
    H *= 1 + v * (R() * 0.16 - 0.08);
    lean += v * (R() * 6 - 3);
    hook += v * (R() * 8 - 4);
    ph += v * R() * 3;
    aL += v * (R() * 0.1 - 0.05);
    aR += v * (R() * 0.1 - 0.05);
    const polys: Poly[] = [body(cx, bot, W, H, lean, k.neck * (li ? 0.5 : 1), k.wave * sw, ph, aL, aR, hook)];
    if (li === 0) tip = [cx + lean + hook * 0.4, bot - H * 0.86];
    if (k.side && li < 2) polys.push(tongue(cx + k.side[0] * sw, bot - H * 0.32, 6 * sw, k.side[1] * sh, k.side[2] * sw));
    let pts = C.p - 1;
    if (R() * 100 < C.c) pts += 1;
    for (let t = 1; t <= pts; t++) {
      const side = t % 2 ? 1 : -1;
      const o = Math.ceil(t / 2);
      const len = H * (0.62 - 0.1 * o) * (0.85 + R() * 0.3);
      polys.push(tongue(cx + side * W * (0.38 + 0.12 * o), bot - H * 0.3, W * (0.34 - 0.05 * o), len, side * W * (0.25 + 0.1 * o) + (R() * 4 - 2)));
    }
    layers.push(polys);
  }
  return { layers: layers as Frame['layers'], tip };
}

type Ember = { x: number; y: number; a: number; life: number; d: number; ox: number; oy: number };

function emberPoly(p: Ember, R: Rand): Poly {
  const r = (4.2 - 2.6 * (p.life > 1 ? p.a / (p.life - 1) : 0)) * S.emberSize;
  const sx = 1 + (R() * 2 - 1) * S.eVarW;
  const sy = 1 + (R() * 2 - 1) * S.eVarH;
  const tl = p.d * 0.25 + (R() * 2 - 1) * S.eTilt;
  return drop(p.x + p.d * p.a * S.eDrift + p.ox, p.y - S.eDist - p.a * S.eGap - p.oy, r, tl, sx, sy);
}

/** A stream of frames, each three path strings (outer with embers, middle, core). */
export function flameFrames(seed: number): () => [string, string, string] {
  const R = rng(seed);
  let g = 0;
  let parts: Ember[] = [];
  let lastTip: Pt | null = null;
  return () => {
    const fr = frame(g, R);
    g++;
    const src = lastTip ?? fr.tip;
    lastTip = fr.tip;
    let rate = S.embers / KN;
    while (rate > 0) {
      if (R() < Math.min(1, rate)) {
        const d = R() < 0.5 ? -1 : 1;
        parts.push({ x: src[0], y: src[1], a: 0, life: S.eLife, d, ox: (R() * 2 - 1) * S.eScatX + d * R() * 3, oy: (R() * 2 - 1) * S.eScatY });
      }
      rate -= 1;
    }
    parts = parts.filter((p) => {
      if (p.a >= p.life) return false;
      fr.layers[0].push(emberPoly(p, R));
      p.a++;
      return true;
    });
    return [toD(fr.layers[0]), toD(fr.layers[1]), toD(fr.layers[2])];
  };
}

