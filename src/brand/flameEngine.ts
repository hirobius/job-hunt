// The flame, drawn in code: a stylized anime fire (Adrian 2026-11-10; it replaced the Visuals Lab's
// "Version E"). A soft, round-bottomed body that squashes and stretches on hard cuts, licks that
// climb its flanks and whip at the tip, a tip that pinches off and rises as a shrinking piece, and
// a round bright core. Three layers (outer, middle, core). Pure and Node-safe (no DOM, no Vite
// imports): the app animates with it (flameMotion.ts, RoleFlame.tsx), the boot splash bakes a loop
// of it into index.html (brandHtml.ts), and `npm run icons` writes its still frame to flame.svg,
// the static mark every icon derives from. Tune only through FLAME.

export type FlameSettings = {
  /** Hard cuts a second (drawn "on twos", never tweened). */
  fps: number;
  /** The outer body's half width and height, in the 94 x 146 frame. */
  width: number;
  height: number;
  /** How far the squash / stretch keys move the body (0 = a fixed size). */
  stretch: number;
  /** The S-wave that travels up the body: its reach at the tip. */
  sway: number;
  /** The flanks' ripple, as a part of the width. */
  ripple: number;
  /** The upper taper: above 1 the flanks are concave and the tip is a point. */
  sharp: number;
  /** Licks climbing the outer body (the middle layer has one fewer). */
  licks: number;
  /** A lick's longest reach, as a part of the body's height. */
  lickLen: number;
  /** Pieces that break off in one loop (the tip first, then lick ends). */
  pieces: number;
  pieceSize: number;
  /** A piece's climb and sideways drift per frame. */
  rise: number;
  drift: number;
  /** Endless only: the hand-drawn "boil", the difference between one frame and the next. */
  boil: number;
  seed: number;
  /** The wordmark's letters flicker with the flame (flameMotion.ts). */
  tOn: 'off' | 'letters';
  tShake: number;
  tSkew: number;
  tFade: number;
  tEvery: number;
};

export const FLAME: FlameSettings = {
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
};

/** One frame: the `d` of the outer (with its pieces), middle and core layers. */
export type FlameFrame = [string, string, string];
type Pt = [number, number];
type Poly = Pt[];
type Rand = () => number;

/** mulberry32: a small seeded random. */
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
      return 'M' + pts.map((v) => v[0].toFixed(1) + ',' + v[1].toFixed(1)).join('L') + 'Z';
    })
    .join('');
}

/** The frame's centre line and the outer body's foot. */
const CX = 47;
const BASE = 120;
const TAU = Math.PI * 2;

/** The keys, one per frame of the loop: the body gathers, stretches, pinches its tip off (frame 3),
 *  drops wide and short, then recovers. `h` / `w` scale the body, `neck` pinches it below the tip. */
const KEYS = [
  { h: 1.0, w: 1.0, neck: 0, lean: 2 },
  { h: 1.06, w: 0.97, neck: 0, lean: -3 },
  { h: 1.13, w: 0.93, neck: 0.3, lean: -5 },
  { h: 1.2, w: 0.9, neck: 0.68, lean: -2 },
  { h: 0.88, w: 1.09, neck: 0, lean: 4 },
  { h: 0.85, w: 1.1, neck: 0, lean: 5 },
  { h: 0.91, w: 1.06, neck: 0, lean: 1 },
  { h: 0.96, w: 1.03, neck: 0, lean: -2 },
];
/** Frames in one loop: the boot splash's CSS steps through this many. */
export const FLAME_FRAMES = KEYS.length;
/** The frame a piece leaves on (the tip right after the pinch, then lick ends) and how long it
 *  lives. None is alive on frame 0, so the loop's first frame is the clean mark. */
const BREAKS = [
  { at: 4, life: 4, size: 1, from: 'tip' },
  { at: 1, life: 3, size: 0.6, from: 'lick' },
  { at: 6, life: 2, size: 0.55, from: 'lick' },
  { at: 2, life: 3, size: 0.45, from: 'lick' },
] as const;
/** The three layers: width and height as parts of the outer, the foot's lift, the frames it lags,
 *  and its taper (the core is the round one). */
const LAYERS = [
  { sw: 1, sh: 1, up: 0, lag: 0, dx: 0, round: 0 },
  { sw: 0.63, sh: 0.68, up: 3, lag: 1, dx: -1.5, round: 0.15 },
  { sw: 0.36, sh: 0.4, up: 7, lag: 2, dx: -2, round: 0.5 },
];

type Pose = { W: number; H: number; lean: number; neck: number; amp: number; t: number };

/** The body's centre line at `s` (0 the foot, 1 the tip): a lean plus the S-wave that climbs it. */
function spine(p: Pose, cx: number, s: number): number {
  return cx + p.lean * s * s + p.amp * Math.sin(TAU * (0.85 * s - p.t)) * Math.pow(s, 1.4);
}

/** Half width at `s` as a part of W: a round foot, widest at 0.3, tapering to a point. */
function profile(s: number, sharp: number): number {
  return s < 0.3
    ? Math.sqrt(Math.max(0, 1 - Math.pow(1 - s / 0.3, 2)))
    : Math.pow((1 - s) / 0.7, sharp);
}

function body(S: FlameSettings, p: Pose, cx: number, bot: number, sharp: number): Poly {
  const L: Poly = [];
  const R: Poly = [];
  const n = 36;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const f = profile(s, sharp) * (1 - p.neck * Math.exp(-Math.pow((s - 0.74) / 0.075, 2)));
    const x = spine(p, cx, s);
    const y = bot - p.H * s;
    const rip = S.ripple * Math.sin(TAU * (1.5 * s - p.t));
    L.push([x - p.W * f * (1 + rip), y]);
    R.push([x + p.W * f * (1 - rip), y]);
  }
  return L.concat(R.reverse());
}

/** A lick: a tapering tongue from (bx, by), `len` tall, leaning `out` and whipping `curl` more at
 *  its end. Its foot sits inside the body, so the two read as one shape. */
function lick(bx: number, by: number, w: number, len: number, out: number, curl: number): Poly {
  const l: Poly = [];
  const r: Poly = [];
  for (let i = 0; i <= 12; i++) {
    const s = i / 12;
    const x = bx + out * s + curl * s * s;
    const y = by - len * s;
    const hw = w * Math.pow(1 - s, 0.9) * (0.75 + 0.6 * Math.sin(Math.PI * Math.min(1, s * 1.6)));
    l.push([x - hw, y]);
    r.push([x + hw, y]);
  }
  return l.concat(r.reverse());
}

/** A teardrop about (cx, cy), radius r, tilted by `tilt`. */
function drop(cx: number, cy: number, r: number, tilt: number, sx = 1, sy = 1): Poly {
  const p: Poly = [];
  for (let i = 0; i < 20; i++) {
    const t = (TAU * i) / 20;
    const x = r * sx * Math.sin(t) * Math.pow(Math.abs(Math.sin(t / 2)), 1.2);
    const y = -r * sy * Math.cos(t) * 1.35;
    p.push([
      cx + x * Math.cos(tilt) - y * Math.sin(tilt),
      cy + x * Math.sin(tilt) + y * Math.cos(tilt),
    ]);
  }
  return p;
}

type Raw = { layers: Poly[][]; tip: Pt; ends: Pt[] };

/** Per-frame differences (endless only): all zero in the loop. */
type Boil = { w: number; h: number; lean: number; amp: number; lick: number };
const CALM: Boil = { w: 0, h: 0, lean: 0, amp: 0, lick: 0 };

function drawFrame(S: FlameSettings, f: number, boil: (layer: number) => Boil): Raw {
  const N = KEYS.length;
  const layers: Poly[][] = [];
  let tip: Pt = [CX, BASE - S.height];
  const ends: Pt[] = [];
  LAYERS.forEach((Ly, li) => {
    const g = f - Ly.lag;
    const k = KEYS[((g % N) + N) % N];
    const b = boil(li);
    const p: Pose = {
      W: S.width * Ly.sw * (1 + (k.w - 1) * S.stretch) * (1 + b.w),
      H: S.height * Ly.sh * (1 + (k.h - 1) * S.stretch) * (1 + b.h),
      lean: k.lean * Ly.sh + b.lean,
      neck: k.neck * (li ? 0.5 : 1) * Math.min(1, S.stretch),
      amp: S.sway * Ly.sh * (1 + b.amp),
      t: g / N,
    };
    const cx = CX + Ly.dx;
    const bot = BASE - Ly.up;
    const sharp = S.sharp * (1 - Ly.round);
    const polys = [body(S, p, cx, bot, sharp)];
    if (li === 0) tip = [spine(p, cx, 1), bot - p.H];
    const count = Math.max(0, (S.licks | 0) - li);
    for (let j = 0; li < 2 && j < count; j++) {
      // Each lick climbs the flank through one loop: born small and low, longest half way up,
      // swallowed by the body near the top.
      const ph = (((g / N + j / count + 0.2 + li * 0.13) % 1) + 1) % 1;
      const side = (j + li) % 2 ? 1 : -1;
      const sb = 0.2 + 0.4 * ph;
      const grow = Math.pow(Math.sin(Math.PI * ph), 0.7);
      const len = p.H * (0.14 + S.lickLen * grow) * (1 + b.lick * (j % 2 ? 1 : -1));
      const w = p.W * (0.16 + 0.2 * grow);
      const bx = spine(p, cx, sb) + side * p.W * profile(sb, sharp) * 0.52;
      const by = bot - p.H * sb;
      // Out, then bowed back up: a horn, whipping a little as it climbs.
      const out = side * p.W * (0.65 + 0.4 * ph);
      const curl = side * p.W * (-0.5 + 0.3 * Math.sin(TAU * (ph * 1.4 + j * 0.31)));
      polys.push(lick(bx, by, w, len, out, curl));
      if (li === 0) ends.push([bx + out + curl, by - len]);
    }
    layers.push(polys);
  });
  return { layers, tip, ends };
}

type Piece = { x: number; y: number; a: number; life: number; dir: number; size: number };

/** A piece that broke off, `a` frames on: it climbs, drifts and shrinks to a spark. The tip's
 *  first frame is a curled sliver, still the shape it tore from. */
function piecePolys(S: FlameSettings, pc: Piece, tilt: number): Poly[] {
  const k = pc.life > 1 ? pc.a / (pc.life - 1) : 0;
  const r = (5.2 - 3.4 * k) * pc.size * S.pieceSize;
  const x = pc.x + pc.dir * pc.a * S.drift;
  const y = pc.y - 4 - pc.a * S.rise;
  if (pc.a === 0 && pc.size >= 1) return [drop(x, y - r, r * 1.15, -pc.dir * 0.35, 0.8, 1.7)];
  const out = [drop(x, y, r, pc.dir * 0.3 + tilt, 1 - 0.2 * k, 1 + 0.25 * k)];
  // The tip's piece sheds a spark of its own as it goes.
  if (pc.size >= 1 && pc.a >= 2)
    out.push(drop(x - pc.dir * r * 2.4, y + r * 3.2, r * 0.45, -pc.dir * 0.4));
  return out;
}

/** The frame's place in the 94 x 146 box, then the d. */
function asFrame(layers: Poly[][]): FlameFrame {
  return [toD(layers[0]), toD(layers[1]), toD(layers[2])];
}

/** The loop: FLAME_FRAMES frames, the same every time, pieces placed across it. */
export function loopFrames(S: FlameSettings): FlameFrame[] {
  const N = KEYS.length;
  const FR = Array.from({ length: N }, (_, f) => drawFrame(S, f, () => CALM));
  BREAKS.slice(0, Math.max(0, S.pieces | 0)).forEach((br, e) => {
    const src = FR[(br.at + N - 1) % N];
    const [x, y] = br.from === 'tip' ? src.tip : (src.ends[e % src.ends.length] ?? src.tip);
    const dir = e % 2 ? -1 : 1;
    for (let a = 0; a < br.life && br.at + a < N; a++)
      FR[br.at + a].layers[0].push(
        ...piecePolys(S, { x, y, a, life: br.life, dir, size: br.size }, 0),
      );
  });
  return FR.map((fr) => asFrame(fr.layers));
}

/** Endless: each call draws the next frame fresh from `seed`. The keys still drive it, but every
 *  frame boils and every pass through them differs, so it never repeats. */
export function endlessFrames(S: FlameSettings, seed: number): () => FlameFrame {
  const R = rng(seed);
  const N = KEYS.length;
  let g = 0;
  let last: Raw | null = null;
  let parts: Piece[] = [];
  // One pass's own character: redrawn each time the keys start over.
  let pass = { lean: 0, amp: 0, h: 0 };
  return () => {
    if (g % N === 0)
      pass = { lean: (R() * 2 - 1) * 4, amp: (R() * 2 - 1) * 0.35, h: (R() * 2 - 1) * 0.05 };
    const v = S.boil;
    const fr = drawFrame(S, g, (li) => ({
      w: v * (R() * 0.08 - 0.04),
      h: pass.h * v + v * (R() * 0.08 - 0.04),
      lean: (pass.lean + (R() * 2 - 1) * (li ? 3 : 2)) * v,
      amp: (pass.amp + (R() * 0.4 - 0.2)) * v,
      lick: v * (R() * 0.3 - 0.15),
    }));
    const src = last ?? fr;
    const spawn = (x: number, y: number, size: number, life: number) =>
      parts.push({ x, y, a: 0, life, dir: R() < 0.5 ? -1 : 1, size });
    const wanted = Math.max(0, S.pieces | 0);
    // The tip tears off on the frame after the pinch; lick ends go at random.
    if (wanted && g % N === BREAKS[0].at) spawn(src.tip[0], src.tip[1], 1, 4);
    else if (src.ends.length && R() < Math.max(0, wanted - 1) / N) {
      const [x, y] = src.ends[(R() * src.ends.length) | 0];
      spawn(x + (R() * 2 - 1) * 4, y, 0.4 + R() * 0.3, 2 + ((R() * 2) | 0));
    }
    parts = parts.filter((pc) => {
      if (pc.a >= pc.life) return false;
      fr.layers[0].push(...piecePolys(S, pc, (R() * 2 - 1) * 0.4 * v));
      pc.a++;
      return true;
    });
    last = fr;
    g++;
    return asFrame(fr.layers);
  };
}

/** The static mark: the loop's first frame with no pieces. flame.svg holds it (`npm run icons`). */
export function stillFrame(S: FlameSettings = FLAME): FlameFrame {
  return loopFrames({ ...S, pieces: 0 })[0];
}

/** The still frame's outer layer box, padded a unit and rounded out: flame.svg's viewBox, so the
 *  mark sits in the line (pieces and stretches overflow it, visibly). */
export function flameViewBox(S: FlameSettings = FLAME): [number, number, number, number] {
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
export function flameSvgFile(fills: [string, string, string], S: FlameSettings = FLAME): string {
  const [d1, d2, d3] = stillFrame(S);
  return (
    '<!-- The flame: the one source of the logo, the still frame of src/brand/flameEngine.ts.\n' +
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
