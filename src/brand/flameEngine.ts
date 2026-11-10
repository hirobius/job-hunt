// The flame's motion: Adrian's "Version E · final" from his Visuals Lab (2026-10-29), ported as
// given. The "family" engine draws three layers (outer, middle, core) from eight squash / stretch /
// pinch keyframes, plus embers off the tip; endless mode draws each frame fresh, so it never
// repeats. Pure and Node-safe (no DOM, no Vite imports): the app animates with it (flameMotion.ts),
// the boot splash bakes a loop of it into index.html (brandHtml.ts), and `npm run icons` writes its
// still frame to flame.svg, the static mark every icon derives from. Tune only through FLAME_E.

/** The lab's settings for one version (the family engine's keys). The per-layer "cut" / "hide"
 *  modes are kept as given but unused: E shows every layer. */
export type FlameSettings = {
  fps: number;
  intensity: number;
  lock: number;
  embers: number;
  emberSize: number;
  width: number;
  height: number;
  motion: number;
  bulge: number;
  sharp: number;
  rand: number;
  lag: number;
  evar: number;
  anim: 'loop' | 'endless';
  l1x: number;
  l1y: number;
  l1s: number;
  l1p: number;
  l1c: number;
  l2x: number;
  l2y: number;
  l2s: number;
  l2p: number;
  l2c: number;
  l3x: number;
  l3y: number;
  l3s: number;
  l3p: number;
  l3c: number;
  l2m: 'fill' | 'cut' | 'hide';
  l3m: 'fill' | 'cut' | 'hide';
  fx: number;
  fy: number;
  fs: number;
  tOn: 'off' | 'word' | 'letters';
  tShake: number;
  tSkew: number;
  tFade: number;
  tEvery: number;
  seed: number;
  eDist: number;
  eGap: number;
  eLife: number;
  eDrift: number;
  eScatX: number;
  eScatY: number;
  eVarW: number;
  eVarH: number;
  eTilt: number;
};

/** Version E · final, exactly as Adrian copied it out of the lab. */
export const FLAME_E: FlameSettings = {
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
};

/** One frame: the `d` of the outer (with its embers), middle and core layers. */
export type FlameFrame = [string, string, string];
type Pt = [number, number];
type Poly = Pt[];

/** mulberry32: the lab's seeded random. */
export function rng(seed: number): () => number {
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
      return 'M' + pts.map((v) => v[0].toFixed(1) + ',' + v[1].toFixed(1)).join('L') + 'Z';
    })
    .join('');
}

function drop(cx: number, cy: number, r: number, lean: number, sx = 1, sy = 1, k = 1.3): Poly {
  const p: Poly = [];
  for (let i = 0; i < 28; i++) {
    const t = (2 * Math.PI * i) / 28;
    const x = r * sx * Math.sin(t) * Math.pow(Math.abs(Math.sin(t / 2)), 1.2);
    const y = -r * sy * Math.cos(t) * k;
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
/** Frames in one loop (the keyframes): the boot splash's CSS steps through this many. */
export const FLAME_FRAMES = K.length;
const mH = K.reduce((s, k) => s + k.H / K.length, 0);
const mW = K.reduce((s, k) => s + k.W / K.length, 0);
const FLAY = [
  { sw: 1, sh: 1, dx: 0, bot: 142 },
  { sw: 0.66, sh: 0.7, dx: -4, bot: 138 },
  { sw: 0.38, sh: 0.46, dx: -6, bot: 134 },
];

function famBody(
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
): Poly {
  const L: Poly = [];
  const R: Poly = [];
  const n = 40;
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
      hook * Math.pow(Math.max(0, s - 0.55), 2) * 5;
    const y = bot - H * s;
    const wl = W * f * aL * (1 + S.bulge * Math.sin(Math.PI * 3.2 * s + ph));
    const wr = W * f * aR * (1 + S.bulge * Math.sin(Math.PI * 3.2 * s + ph + 2.1));
    L.push([x - wl, y]);
    R.push([x + wr, y]);
  }
  return L.concat(R.reverse());
}

function famTongue(
  S: FlameSettings,
  bx: number,
  by: number,
  w: number,
  Ln: number,
  bend: number,
): Poly {
  const l: Poly = [];
  const r: Poly = [];
  for (let i = 0; i <= 14; i++) {
    const s = i / 14;
    const x = bx + bend * s * s;
    const y = by - Ln * s;
    const hw = w * Math.pow(1 - s, S.sharp * 0.67) * (1 + 0.3 * Math.sin(Math.PI * s));
    l.push([x - hw, y]);
    r.push([x + hw, y]);
  }
  return l.concat(r.reverse());
}

function famKf(S: FlameSettings, i: number) {
  const k = K[((i % K.length) + K.length) % K.length];
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

type Layer = 'l1' | 'l2' | 'l3';
const layerOf = (S: FlameSettings, pre: Layer) => ({
  x: S[`${pre}x`],
  y: S[`${pre}y`],
  s: S[`${pre}s`],
  p: S[`${pre}p`],
  c: S[`${pre}c`],
});

function famFrame(S: FlameSettings, f: number, R: () => number, endless: boolean) {
  const fr: Poly[][] = [];
  let tip: Pt = [47, 60];
  for (let li = 0; li < 3; li++) {
    const Ly = FLAY[li];
    const lay = layerOf(S, `l${li + 1}` as Layer);
    const k = famKf(S, f - li * S.lag);
    const jt = li ? S.rand * S.intensity : 0;
    const sw = Ly.sw * lay.s * S.width;
    const sh = Ly.sh * lay.s * S.height;
    let W = k.W * sw * (1 + jt * (R() * 0.16 - 0.08));
    let H = k.H * sh * (1 + jt * (R() * 0.14 - 0.07));
    let lean = k.lean * sh + jt * (R() * 6 - 3);
    let hook = k.hook * sh * (1 + jt * (R() - 0.5)) + jt * (R() * 6 - 3);
    let ph = f * 1.7 + jt * R() * 6.28;
    let aL = k.aL + jt * (R() * 0.16 - 0.08);
    let aR = k.aR + jt * (R() * 0.16 - 0.08);
    const cx = 47 + Ly.dx * S.width + lay.x + jt * (R() * 3 - 1.5);
    const bot = Ly.bot - (142 - Ly.bot) * (S.height - 1) - lay.y;
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
    const polys = [
      famBody(S, cx, bot, W, H, lean, k.neck * (li ? 0.5 : 1), k.wave * sw, ph, aL, aR, hook),
    ];
    if (li === 0) tip = [cx + lean + hook * 0.4, bot - H * 0.86];
    if (k.side && li < 2)
      polys.push(
        famTongue(S, cx + k.side[0] * sw, bot - H * 0.32, 6 * sw, k.side[1] * sh, k.side[2] * sw),
      );
    let pts = lay.p - 1;
    if (R() * 100 < lay.c) pts += 1;
    for (let t = 1; t <= pts; t++) {
      const side = t % 2 ? 1 : -1;
      const o = Math.ceil(t / 2);
      const len = H * (0.62 - 0.1 * o) * (0.85 + R() * 0.3);
      polys.push(
        famTongue(
          S,
          cx + side * W * (0.38 + 0.12 * o),
          bot - H * 0.3,
          W * (0.34 - 0.05 * o),
          len,
          side * W * (0.25 + 0.1 * o) + (R() * 4 - 2),
        ),
      );
    }
    fr.push(polys);
  }
  return { layers: fr, tip };
}

function emberPoly(
  S: FlameSettings,
  x0: number,
  y0: number,
  a: number,
  life: number,
  d: number,
  ox: number,
  oy: number,
  ER: () => number,
): Poly {
  const r = (4.2 - 2.6 * (life > 1 ? a / (life - 1) : 0)) * S.emberSize;
  const sx = 1 + (ER() * 2 - 1) * S.eVarW;
  const sy = 1 + (ER() * 2 - 1) * S.eVarH;
  const tl = d * 0.25 + (ER() * 2 - 1) * S.eTilt;
  return drop(x0 + d * a * S.eDrift + ox, y0 - S.eDist - a * S.eGap - oy, r, tl, sx, sy);
}

/** The lab's frame position (fx / fy / fs: about the centre of its 94 x 146 frame), then the d. */
function asFrame(S: FlameSettings, layers: Poly[][]): FlameFrame {
  const place = (polys: Poly[]) =>
    toD(
      polys.map((p) =>
        p.map(([x, y]): Pt => [47 + (x - 47) * S.fs + S.fx, 73 + (y - 73) * S.fs - S.fy]),
      ),
    );
  return [place(layers[0]), place(layers[1]), place(layers[2])];
}

/** The loop: FLAME_FRAMES frames from the settings' seed, embers placed across it. */
export function loopFrames(S: FlameSettings): FlameFrame[] {
  const R = rng(S.seed);
  const FR = Array.from({ length: K.length }, (_, f) => famFrame(S, f, R, false));
  const n = S.embers | 0;
  const ER = rng(S.seed + 7);
  const life = Math.max(1, S.eLife | 0);
  for (let e = 0; e < n; e++) {
    const bf = Math.round((e * K.length) / n + 3) % K.length;
    const src = FR[(bf + K.length - 1) % K.length].tip;
    const d = e % 2 ? -1 : 1;
    const ox = (e > 1 ? d * 5 : 0) + (ER() * 2 - 1) * S.eScatX;
    const oy = (e > 1 ? 4 : 0) + (ER() * 2 - 1) * S.eScatY;
    for (let a = 0; a < life; a++)
      FR[(bf + a) % K.length].layers[0].push(emberPoly(S, src[0], src[1], a, life, d, ox, oy, ER));
  }
  return FR.map((fr) => asFrame(S, fr.layers));
}

/** Endless: each call draws the next frame fresh from `seed` (the lab seeds it at random). */
export function endlessFrames(S: FlameSettings, seed: number): () => FlameFrame {
  const R = rng(seed);
  let g = 0;
  let lastTip: Pt | null = null;
  let parts: {
    x: number;
    y: number;
    a: number;
    life: number;
    d: number;
    ox: number;
    oy: number;
  }[] = [];
  return () => {
    const fr = famFrame(S, g, R, true);
    g++;
    const src = lastTip ?? fr.tip;
    lastTip = fr.tip;
    let rate = (S.embers | 0) / K.length;
    while (rate > 0) {
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
        });
      }
      rate -= 1;
    }
    parts = parts.filter((p) => {
      if (p.a >= p.life) return false;
      fr.layers[0].push(emberPoly(S, p.x, p.y, p.a, p.life, p.d, p.ox, p.oy, R));
      p.a++;
      return true;
    });
    return asFrame(S, fr.layers);
  };
}

/** The static mark: the loop's first frame with no embers. flame.svg holds it (`npm run icons`). */
export function stillFrame(S: FlameSettings = FLAME_E): FlameFrame {
  return loopFrames({ ...S, embers: 0 })[0];
}

/** The still frame's outer layer box, padded a unit and rounded out: flame.svg's viewBox, so the
 *  mark sits in the line like the drawn one did (embers and stretches overflow it, visibly). */
export function flameViewBox(S: FlameSettings = FLAME_E): [number, number, number, number] {
  const n = (stillFrame(S)[0].match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const xs = n.filter((_, i) => i % 2 === 0);
  const ys = n.filter((_, i) => i % 2 === 1);
  const x = Math.floor(Math.min(...xs)) - 1;
  const y = Math.floor(Math.min(...ys)) - 1;
  return [x, y, Math.ceil(Math.max(...xs)) + 1 - x, Math.ceil(Math.max(...ys)) + 1 - y];
}

/** flame.svg's text: the still frame, the core and middle clipped to the outer, filled with the
 *  given colours (HDS primitives: `npm run icons` reads them from variables.css). The classes let
 *  the app recolour each layer (base.css) and let flameMotion find the layers it animates. */
export function flameSvgFile(fills: [string, string, string], S: FlameSettings = FLAME_E): string {
  const [d1, d2, d3] = stillFrame(S);
  return (
    '<!-- The flame: the one source of the logo, the still frame of src/brand/flameEngine.ts (Version E).\n' +
    '     Written by `npm run icons`; change the engine or its settings, run it, commit. -->\n' +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${flameViewBox(S).join(' ')}">\n` +
    '  <defs><clipPath id="flame-clip"><use href="#flame-outer"/></clipPath></defs>\n' +
    `  <path id="flame-outer" class="flame-1" fill="${fills[0]}" d="${d1}"/>\n` +
    '  <g clip-path="url(#flame-clip)">\n' +
    `    <path class="flame-2" fill="${fills[1]}" d="${d2}"/>\n` +
    `    <path class="flame-3" fill="${fills[2]}" d="${d3}"/>\n` +
    '  </g>\n' +
    '</svg>\n'
  );
}
