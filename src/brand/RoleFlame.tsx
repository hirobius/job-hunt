// The animated flame logo (the Visuals Lab's second engine): hand-drawn anime-style fire with hard cuts between frames.
// Drawn live (procedural, not a pre-made SVG) from the final explorer settings. mode="endless" draws every frame fresh (never repeats);
// mode="loop" repeats the same 8 frames. Frames sit in a 94x146 box; embers drift above it (overflow: visible).
//
// In the app (App bar, sign-in) it loads lazily (LazyRoleFlameLogo.tsx) behind the still wordmark, so it
// stays out of the entry chunk. Colours are HDS tokens (base.css `.rjb-rf`, light and dark), the font is
// HDS's display type token (Sora 700, loaded by HDS's fonts.css), the name is brand.ts. Stops under prefers-reduced-motion,
// pauses while the tab is hidden and stops after 5 s on screen (WCAG 2.2.2).
import { CSSProperties, useEffect, useId, useMemo, useRef, useState } from 'react';
import { BRAND } from '../brand';

/* ------------------------------------------------------------------ settings */

const FLAME_SETTINGS = {
  fps: 10,
  intensity: 0.2,
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
  fx: 0,
  fy: 13,
  fs: 1,
  eDist: 18.5,
  eGap: 13,
  eLife: 6,
  eDrift: 7.5,
  eScatX: 25,
  eScatY: 19.5,
  eVarW: 0.35,
  eVarH: 0.9,
  eTilt: 1.05,
  /** 0 = every ember is a teardrop, 1 = always a random mix (blob, curl, shard, twin drops). */
  eShape: 1,
  /** Rough, uneven ember outlines. */
  eWob: 0.4,
  /** Side-to-side lick of the flame tip, and how far down the flame it reaches. */
  tipLick: 0.35,
  tipLen: 0.35,
  seed: 11,
};
export type FlameSettings = typeof FLAME_SETTINGS;

export type FlameColors = { outer: string; middle: string; core: string };
/** The brand blues are HDS primitives, set on `.rjb-rf` in base.css (light and dark), so one set of
 *  colours follows the theme with no JS. (The lab's BLUE / BLUE_DARK hex pairs and FIRE are gone: no
 *  raw colour in the app.) */
const BLUE: FlameColors = {
  outer: 'var(--rjb-rf-1)',
  middle: 'var(--rjb-rf-2)',
  core: 'var(--rjb-rf-3)',
};

/* ------------------------------------------------------------------ engine */

type Pt = [number, number];
type Poly = Pt[];
type Rand = () => number;
export type Frame = [string, string, string];

function rng(a: number): Rand {
  return () => {
    a |= 0;
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
      if (a < 0) p = p.slice().reverse();
      return 'M' + p.map((v) => v[0].toFixed(1) + ',' + v[1].toFixed(1)).join('L') + 'Z';
    })
    .join('');
}

function drop(cx: number, cy: number, r: number, lean: number, sx = 1, sy = 1): Poly {
  const p: Poly = [];
  for (let i = 0; i < 28; i++) {
    const t = (2 * Math.PI * i) / 28;
    const x = r * sx * Math.sin(t) * Math.pow(Math.abs(Math.sin(t / 2)), 1.2);
    const y = -r * sy * Math.cos(t) * 1.3;
    p.push([
      cx + x * Math.cos(lean) - y * Math.sin(lean),
      cy + x * Math.sin(lean) + y * Math.cos(lean),
    ]);
  }
  return p;
}

type Key = {
  W: number;
  H: number;
  lean: number;
  neck: number;
  wave: number;
  aL: number;
  aR: number;
  hook: number;
  side: [number, number, number] | null;
};
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
const LAY = [
  { sw: 1, sh: 1, dx: 0, bot: 142 },
  { sw: 0.66, sh: 0.7, dx: -4, bot: 138 },
  { sw: 0.38, sh: 0.46, dx: -6, bot: 134 },
];

function body(
  S: FlameSettings,
  cx: number,
  bot: number,
  W: number,
  H: number,
  lean: number,
  neck: number,
  wave: number,
  ph: number,
  aL: number,
  aR: number,
  hook: number,
  lk: number,
): Poly {
  const L: Poly = [],
    R: Poly = [],
    n = 40,
    ls = Math.min(0.9, 1 - S.tipLen);
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    let f =
      s < 0.42
        ? Math.sqrt(Math.max(0, 1 - Math.pow(1 - s / 0.42, 2)))
        : Math.pow((1 - s) / 0.58, S.sharp);
    f *= 1 - neck * Math.exp(-Math.pow((s - 0.78) / 0.05, 2));
    const x =
      cx +
      lean * s * s +
      wave * Math.sin(Math.PI * 2 * s + ph) * s +
      hook * Math.pow(Math.max(0, s - 0.55), 2) * 5 +
      lk * Math.pow(Math.max(0, (s - ls) / (1 - ls)), 2);
    const y = bot - H * s;
    const wl = W * f * aL * (1 + S.bulge * Math.sin(Math.PI * 3.2 * s + ph));
    const wr = W * f * aR * (1 + S.bulge * Math.sin(Math.PI * 3.2 * s + ph + 2.1));
    L.push([x - wl, y]);
    R.push([x + wr, y]);
  }
  return L.concat(R.reverse());
}

function tongue(
  S: FlameSettings,
  bx: number,
  by: number,
  w: number,
  len: number,
  bend: number,
): Poly {
  const l: Poly = [],
    r: Poly = [];
  for (let i = 0; i <= 14; i++) {
    const s = i / 14,
      x = bx + bend * s * s,
      y = by - len * s;
    const hw = w * Math.pow(1 - s, S.sharp * 0.67) * (1 + 0.3 * Math.sin(Math.PI * s));
    l.push([x - hw, y]);
    r.push([x + hw, y]);
  }
  return l.concat(r.reverse());
}

function key(S: FlameSettings, i: number) {
  const k = K[((i % KN) + KN) % KN],
    I = S.intensity,
    m = S.motion * I;
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

type RawFrame = { layers: Poly[][]; tip: Pt };

function layerVal(S: FlameSettings, n: number, k: 'x' | 'y' | 's' | 'p' | 'c'): number {
  return S[`l${n}${k}` as keyof FlameSettings];
}

function frame(S: FlameSettings, f: number, R: Rand, endless: boolean): RawFrame {
  const layers: Poly[][] = [];
  let tip: Pt = [47, 40];
  for (let li = 0; li < 3; li++) {
    const Ly = LAY[li],
      n = li + 1;
    const k = key(S, f - li * S.lag),
      jt = li ? S.rand * S.intensity : 0;
    const sw = Ly.sw * layerVal(S, n, 's') * S.width,
      sh = Ly.sh * layerVal(S, n, 's') * S.height;
    let W = k.W * sw * (1 + jt * (R() * 0.16 - 0.08)),
      H = k.H * sh * (1 + jt * (R() * 0.14 - 0.07));
    let lean = k.lean * sh + jt * (R() * 6 - 3),
      hook = k.hook * sh * (1 + jt * (R() - 0.5)) + jt * (R() * 6 - 3);
    let ph = f * 1.7 + jt * R() * 6.28,
      aL = k.aL + jt * (R() * 0.16 - 0.08),
      aR = k.aR + jt * (R() * 0.16 - 0.08);
    const cx = 47 + Ly.dx * S.width + layerVal(S, n, 'x') + jt * (R() * 3 - 1.5);
    const bot = Ly.bot - (142 - Ly.bot) * (S.height - 1) - layerVal(S, n, 'y');
    if (endless) {
      const v = S.evar * S.intensity;
      W *= 1 + v * (R() * 0.12 - 0.06);
      H *= 1 + v * (R() * 0.16 - 0.08);
      lean += v * (R() * 6 - 3);
      hook += v * (R() * 8 - 4);
      ph += v * R() * 3;
      aL += v * (R() * 0.1 - 0.05);
      aR += v * (R() * 0.1 - 0.05);
    }
    const lk =
      S.tipLick *
      sh *
      (10 * Math.sin(f * 2.1 - li * 0.9) + 4 * Math.sin(f * 0.83 + 1.3)) *
      (endless ? 0.6 + R() * 0.8 : 1);
    const polys: Poly[] = [
      body(S, cx, bot, W, H, lean, k.neck * (li ? 0.5 : 1), k.wave * sw, ph, aL, aR, hook, lk),
    ];
    if (li === 0) tip = [cx + lean + hook * 0.4 + lk * 0.7, bot - H * 0.86];
    if (k.side && li < 2)
      polys.push(
        tongue(S, cx + k.side[0] * sw, bot - H * 0.32, 6 * sw, k.side[1] * sh, k.side[2] * sw),
      );
    let pts = layerVal(S, n, 'p') - 1;
    if (R() * 100 < layerVal(S, n, 'c')) pts += 1;
    for (let t = 1; t <= pts; t++) {
      const side = t % 2 ? 1 : -1,
        o = Math.ceil(t / 2);
      const len = H * (0.62 - 0.1 * o) * (0.85 + R() * 0.3);
      polys.push(
        tongue(
          S,
          cx + side * W * (0.38 + 0.12 * o),
          bot - H * 0.3,
          W * (0.34 - 0.05 * o),
          len,
          side * W * (0.25 + 0.1 * o) + (R() * 4 - 2),
        ),
      );
    }
    layers.push(polys);
  }
  return { layers, tip };
}

// Ember shapes: 0 teardrop, 1 round blob, 2 curled lick, 3 shard, 4 twin drops.
function rot(cx: number, cy: number, lean: number, pts: Poly): Poly {
  return pts.map(([x, y]) => [
    cx + x * Math.cos(lean) - y * Math.sin(lean),
    cy + x * Math.sin(lean) + y * Math.cos(lean),
  ]);
}
function blob(
  cx: number,
  cy: number,
  r: number,
  lean: number,
  sx: number,
  sy: number,
  Q: Rand,
  wob: number,
): Poly {
  const p1 = Q() * 6.3,
    p2 = Q() * 6.3,
    a1 = 0.5 + Q() * 0.5,
    a2 = 0.3 + Q() * 0.5,
    pts: Poly = [];
  for (let i = 0; i < 24; i++) {
    const t = (2 * Math.PI * i) / 24,
      rr = r * (1 + wob * 0.35 * (a1 * Math.sin(2 * t + p1) + a2 * Math.sin(3 * t + p2)));
    pts.push([rr * sx * Math.cos(t), rr * sy * Math.sin(t) * 1.1]);
  }
  return rot(cx, cy, lean, pts);
}
function curl(
  cx: number,
  cy: number,
  r: number,
  lean: number,
  sx: number,
  sy: number,
  Q: Rand,
  wob: number,
): Poly {
  const bend = (Q() < 0.5 ? -1 : 1) * (0.8 + Q() * 0.8) * r,
    L: Poly = [],
    R: Poly = [],
    n = 12,
    len = r * 3.2 * sy;
  for (let i = 0; i <= n; i++) {
    const s = i / n,
      hw =
        r *
        sx *
        (s < 0.3 ? Math.sqrt(s / 0.3) : Math.pow((1 - s) / 0.7, 1.3)) *
        (1 + wob * 0.3 * Math.sin(s * 9 + bend));
    const x = bend * s * s,
      y = r - len * s;
    L.push([x - hw, y]);
    R.push([x + hw, y]);
  }
  return rot(cx, cy, lean, L.concat(R.reverse()));
}
function shard(
  cx: number,
  cy: number,
  r: number,
  lean: number,
  sx: number,
  sy: number,
  Q: Rand,
  wob: number,
): Poly {
  const n = 4 + ((Q() * 3) | 0),
    o = Q() * 6.3,
    pts: Poly = [];
  for (let i = 0; i < n; i++) {
    const t = o + (2 * Math.PI * (i + Q() * 0.5 * wob)) / n,
      rr = r * (0.6 + Q() * (0.5 + 0.5 * wob)) * (i === 0 ? 1.5 : 1);
    pts.push([rr * sx * Math.cos(t), rr * sy * Math.sin(t) * 1.2]);
  }
  return rot(cx, cy, lean, pts);
}
function emberShape(
  type: number,
  cx: number,
  cy: number,
  r: number,
  lean: number,
  sx: number,
  sy: number,
  Q: Rand,
  wob: number,
): Poly[] {
  if (type === 1) return [blob(cx, cy, r * 0.9, lean, sx, sy, Q, wob)];
  if (type === 2) return [curl(cx, cy, r * 0.75, lean, sx, sy, Q, wob)];
  if (type === 3) return [shard(cx, cy, r, lean, sx, sy, Q, wob)];
  if (type === 4) {
    const g = r * 0.75;
    return [
      drop(cx - g * 0.7, cy + g * 0.3, r * 0.62, lean - 0.2, sx, sy),
      drop(cx + g * 0.7, cy - g * 0.3, r * 0.5, lean + 0.25, sx, sy),
    ];
  }
  let d0 = drop(cx, cy, r, lean, sx, sy);
  if (wob > 0)
    d0 = d0.map(([x, y], i) => {
      const k = 1 + wob * 0.18 * Math.sin(i * 1.3 + Q() * 2);
      return [cx + (x - cx) * k, cy + (y - cy) * k] as Pt;
    });
  return [d0];
}
function pickShape(S: FlameSettings, Q: Rand) {
  return Q() < S.eShape ? 1 + ((Q() * 4) | 0) : 0;
}
function ember(
  S: FlameSettings,
  x0: number,
  y0: number,
  a: number,
  life: number,
  d: number,
  ox: number,
  oy: number,
  R: Rand,
  type: number,
  key: number,
): Poly[] {
  const r = (4.2 - 2.6 * (life > 1 ? a / (life - 1) : 0)) * S.emberSize;
  const sx = 1 + (R() * 2 - 1) * S.eVarW,
    sy = 1 + (R() * 2 - 1) * S.eVarH,
    tl = d * 0.25 + (R() * 2 - 1) * S.eTilt;
  const Q = rng((key | 0) * 131 + a * 977 + 7);
  return emberShape(
    type,
    x0 + d * a * S.eDrift + ox,
    y0 - S.eDist - a * S.eGap - oy,
    r,
    tl,
    sx,
    sy,
    Q,
    S.eWob,
  );
}

// Apply "flame position in its frame" so the result sits in the 94x146 box like the explorer page.
function place(S: FlameSettings, fr: RawFrame): Frame {
  const T = (p: Poly): Poly =>
    p.map(([x, y]) => [S.fx + 47 + (x - 47) * S.fs, -S.fy + 73 + (y - 73) * S.fs]);
  return fr.layers.map((ps) => toD(ps.map(T))) as Frame;
}

/** The fixed 8-frame loop (same frames as the explorer page's Loop mode). */
function buildLoop(S: FlameSettings = FLAME_SETTINGS): Frame[] {
  const R = rng(S.seed),
    FR: RawFrame[] = [];
  for (let f = 0; f < KN; f++) FR.push(frame(S, f, R, false));
  const n = S.embers | 0,
    ER = rng(S.seed + 7),
    life = Math.max(1, S.eLife | 0);
  for (let e = 0; e < n; e++) {
    const bf = Math.round((e * KN) / n + 3) % KN,
      src = FR[(bf + KN - 1) % KN].tip,
      d = e % 2 ? -1 : 1;
    const ox = (e > 1 ? d * 5 : 0) + (ER() * 2 - 1) * S.eScatX,
      oy = (e > 1 ? 4 : 0) + (ER() * 2 - 1) * S.eScatY;
    const SQ = rng(S.seed * 31 + e * 7919 + 101),
      ty = pickShape(S, SQ),
      ky = (SQ() * 1e6) | 0;
    for (let a = 0; a < life; a++)
      FR[(bf + a) % KN].layers[0].push(...ember(S, src[0], src[1], a, life, d, ox, oy, ER, ty, ky));
  }
  return FR.map((fr) => place(S, fr));
}

/** Endless generator: every call returns a brand-new frame that never repeats. */
function createEndless(
  S: FlameSettings = FLAME_SETTINGS,
  seed = (Math.random() * 1e9) | 0,
): () => Frame {
  const R = rng(seed);
  let g = 0,
    last: Pt | null = null;
  let parts: {
    x: number;
    y: number;
    a: number;
    life: number;
    d: number;
    ox: number;
    oy: number;
    ty: number;
    ky: number;
  }[] = [];
  return () => {
    const fr = frame(S, g++, R, true);
    const src = last || fr.tip;
    last = fr.tip;
    for (let rate = (S.embers | 0) / KN; rate > 0; rate -= 1) {
      if (R() < Math.min(1, rate)) {
        const d = R() < 0.5 ? -1 : 1;
        parts.push({
          x: src[0],
          y: src[1],
          a: 0,
          life: Math.max(1, S.eLife | 0),
          d,
          ox: (R() * 2 - 1) * S.eScatX + d * R() * 3,
          oy: (R() * 2 - 1) * S.eScatY,
          ty: pickShape(S, R),
          ky: (R() * 1e6) | 0,
        });
      }
    }
    parts = parts.filter((p) => {
      if (p.a >= p.life) return false;
      fr.layers[0].push(...ember(S, p.x, p.y, p.a, p.life, p.d, p.ox, p.oy, R, p.ty, p.ky));
      p.a++;
      return true;
    });
    return place(S, fr);
  };
}

/* ------------------------------------------------------------------ React */

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}

/** True while the tab is on screen (document.hidden false). */
function usePageVisible() {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}

/**
 * WCAG 2.2.2 (Pause, Stop, Hide): motion that starts on its own stops within 5 s. Only time on
 * screen counts: a hidden tab pauses the clock and the flame.
 */
export const FLAME_MOTION_LIMIT_MS = 5000;

export type FlameMode = 'endless' | 'loop';

/** Current flame frame plus a tick counter, advancing at settings.fps. Pass a stable `settings` object. */
function useFlame(
  mode: FlameMode = 'endless',
  animated = true,
  settings: FlameSettings = FLAME_SETTINGS,
) {
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  const [done, setDone] = useState(false);
  const on = animated && !reduced && !done;
  const loop = useMemo(() => buildLoop(settings), [settings]);
  // One generator per mode/settings, kept across a pause so a hidden tab resumes where it was.
  const next = useMemo(
    () => (mode === 'endless' ? createEndless(settings) : null),
    [mode, settings],
  );
  const ticks = useRef(0);
  const [state, setState] = useState<{ frame: Frame; tick: number }>(() => ({
    frame: loop[0],
    tick: 0,
  }));
  useEffect(() => {
    if (!on || !visible) return;
    const limit = Math.round((FLAME_MOTION_LIMIT_MS * settings.fps) / 1000);
    const id = window.setInterval(() => {
      const i = ++ticks.current;
      if (i >= limit) {
        window.clearInterval(id);
        setDone(true);
        return;
      }
      setState({ frame: next ? next() : loop[i % loop.length], tick: i });
    }, 1000 / settings.fps);
    return () => window.clearInterval(id);
  }, [on, visible, next, loop, settings]);
  // Stopped (reduced motion, not animated, or after the 5 s limit): the first frame, held.
  return on ? { ...state, running: true } : { frame: loop[0], tick: 0, running: false };
}

type SvgProps = {
  size?: number | string;
  colors?: FlameColors;
  className?: string;
  style?: CSSProperties;
  title?: string;
};

// Dynamic styles are built here, not written inline (hdsOnly.test.ts counts inline style literals): the flame's
// box follows the font size, and each letter's pose changes every frame.
const svgStyle = (size: number | string, extra?: CSSProperties): CSSProperties => ({
  height: size,
  width: 'auto',
  overflow: 'visible',
  ...extra,
});
const rootStyle = (px: number, extra?: CSSProperties): CSSProperties => ({
  ['--rjb-rf-size' as string]: `${px}px`,
  ...extra,
});
const letterStyle = (transform: string, opacity: number, ease: number): CSSProperties => ({
  transform,
  opacity,
  transition: ease ? `transform ${ease}ms ease-out, opacity ${ease}ms ease-out` : undefined,
});

function FlameSvg({
  frame,
  size = 32,
  colors = BLUE,
  className,
  style,
  title,
}: SvgProps & { frame: Frame }) {
  const clipId = 'rf' + useId().replace(/:/g, '');
  const [outer, middle, core] = frame;
  return (
    <svg
      viewBox="0 0 94 146"
      className={className}
      style={svgStyle(size, style)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <clipPath id={clipId}>
          <path d={outer} />
        </clipPath>
      </defs>
      <path d={outer} fill={colors.outer} />
      <g clipPath={`url(#${clipId})`}>
        <path d={middle} fill={colors.middle} />
        <path d={core} fill={colors.core} />
      </g>
    </svg>
  );
}

type FlameProps = SvgProps & {
  mode?: FlameMode;
  animated?: boolean;
  settings?: FlameSettings;
  /** Drive the flame from outside with a frame from useFlame (e.g. to sync with text). */
  frame?: Frame;
};

function SelfDrivenFlame({ mode, animated, settings, ...svg }: Omit<FlameProps, 'frame'>) {
  const { frame } = useFlame(mode, animated, settings);
  return <FlameSvg {...svg} frame={frame} />;
}

/** Just the flame. Height = flame body; embers float above. */
export function RoleFlameMark({
  frame,
  mode = 'endless',
  animated = true,
  settings = FLAME_SETTINGS,
  ...svg
}: FlameProps) {
  if (frame) return <FlameSvg {...svg} frame={frame} />;
  return <SelfDrivenFlame {...svg} mode={mode} animated={animated} settings={settings} />;
}

// Small deterministic hash so each letter's flicker is stable within a tick.
function hash(tick: number, i: number, salt: number) {
  let t = (tick * 374761393 + i * 668265263 + salt * 2246822519) | 0;
  t = Math.imul(t ^ (t >>> 13), 1274126177);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

/** Wordmark flicker. Units: shake/bob in hundredths of an em, skew in degrees, scale in %. */
const TEXT_SETTINGS = {
  text: BRAND.name,
  flameScale: 1.5,
  skew: 2.5,
  fade: 0.05,
  shake: 0,
  bob: 3,
  bobDir: 'up' as 'up' | 'both',
  scale: 0,
  /** % of letters that move on each frame. */
  pct: 100,
  /** Move every N flame frames. */
  every: 1,
  /** Transition ms between poses (0 = hard cut). */
  ease: 0,
};
export type TextSettings = typeof TEXT_SETTINGS;

type LogoProps = {
  /** Wordmark font size in px. */
  fontSize?: number;
  mode?: FlameMode;
  animated?: boolean;
  colors?: FlameColors;
  settings?: FlameSettings;
  text?: Partial<TextSettings>;
  /** "inline" = flame beside the name (app bar). "stacked" = flame centred above the name (sign-in screen). */
  layout?: 'inline' | 'stacked';
  className?: string;
  style?: CSSProperties;
};

/** Flame + the name, with per-letter flicker, all on one clock. */
export function RoleFlameLogo({
  fontSize = 20,
  mode = 'endless',
  animated = true,
  colors = BLUE,
  settings = FLAME_SETTINGS,
  text,
  layout = 'inline',
  className,
  style,
}: LogoProps) {
  const T = { ...TEXT_SETTINGS, ...text };
  const { frame, tick, running } = useFlame(mode, animated, settings);
  const [salt] = useState(() => (Math.random() * 1e6) | 0);
  const step = Math.floor(tick / Math.max(1, T.every));
  return (
    <span
      className={['rjb-rf', className].filter(Boolean).join(' ')}
      data-layout={layout}
      role="img"
      aria-label={BRAND.name}
      style={rootStyle(fontSize, style)}
    >
      <FlameSvg
        frame={frame}
        size={`${(layout === 'stacked' ? 1.6 : 1.3) * T.flameScale}em`}
        colors={colors}
      />
      <span aria-hidden="true">
        {T.text.split('').map((c, i) => {
          // A letter keeps its last pose on frames where it isn't picked; we approximate that by
          // looking back to the most recent step in which it was picked.
          let s = step;
          if (T.pct < 100) {
            for (let back = 0; back < 12 && hash(s + salt, i, 9) * 100 >= T.pct; back++) s--;
          }
          const h = (k: number) => hash(s + salt, i, k);
          const on = running && s > 0;
          const sk = on ? (h(1) * 2 - 1) * T.skew : 0;
          const dx = on ? ((h(2) * 2 - 1) * T.shake) / 100 : 0;
          const dy = on ? ((T.bobDir === 'up' ? -h(4) : h(4) * 2 - 1) * T.bob) / 100 : 0;
          const sc = on ? 1 + ((h(5) * 2 - 1) * T.scale) / 100 : 1;
          const op = on ? 1 - h(3) * T.fade : 1;
          return (
            <span
              key={i}
              className="rjb-rf-l"
              style={letterStyle(
                `translate(${dx.toFixed(3)}em, ${dy.toFixed(3)}em) skewX(${sk.toFixed(2)}deg) scale(${sc.toFixed(3)})`,
                op,
                T.ease,
              )}
            >
              {c}
            </span>
          );
        })}
      </span>
    </span>
  );
}

export default RoleFlameLogo;
