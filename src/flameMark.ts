// The brand mark (Adrian 2026-10-22): a cobalt cartoon flame, pure SVG + CSS. One source for
// the header's animated BrandMark and the static icons / share image (scripts/make-icons.mjs, which
// runs this file under Node's type stripping: keep it free of imports and non-erasable syntax).
//
// Drawing: three licking tongues (deep indigo outer → cobalt middle → white-hot core), each with
// four keyframes of the same path shape so CSS can morph `d`; two or three embers that rise and
// fade; a soft radial glow at the base. A fixed turbulence filter sits on a still wrapper, so the
// moving tongues pass through the same noise and their edges lick instead of just scaling.

/** A colour: an HDS primitive (`cobalt-500` → `--primitive-color-cobalt-500`) or a themed role. */
type Paint = string;

/** Themed roles: the edge and tips go darker on a light header (≥3:1) and brighter on dark. */
const ROLES = {
  light: { edge: 'cobalt-700', tip: 'cobalt-900', ember: 'cobalt-400' },
  dark: { edge: 'cobalt-500', tip: 'cobalt-700', ember: 'cobalt-200' },
} as const;
type Role = keyof (typeof ROLES)['light'];

interface Tongue {
  /** Same commands in every frame (CSS morphs `d` between them); frame 0 is the still frame. */
  frames: readonly [string, string, string, string];
  /** Vertical gradient, top → bottom: [offset, paint]. */
  stops: readonly (readonly [number, Paint | Role])[];
  /** The outer tongue carries the edge stroke that keeps the mark readable on a light header. */
  edge?: boolean;
  /** Seconds per flicker cycle; the layers differ so the loop never visibly repeats. */
  period: number;
}

interface Ember {
  cx: number;
  cy: number;
  r: number;
  /** Sideways drift while rising, in viewBox units. */
  drift: number;
  period: number;
  delay: number;
}

export const FLAME = {
  viewBox: '0 0 32 40',
  width: 32,
  height: 40,
  tongues: [
    {
      frames: [
        'M16 38 C8 38 4 32 5 26 C6 20 10 17 10 11 C13 14 13 18 14 19 C14 13 17 8 15 2 C21 6 24 12 23 18 C25 16 25 13 25 12 C28 16 29 21 28 26 C27 33 23 38 16 38 Z',
        'M16 38 C8 38 4.5 32 5.5 26 C6.5 21 9 18 8.5 13 C12 15.5 13 18.5 14 20 C14.5 13 18.5 7 18 0.5 C22.5 6 24.5 12 23 18.5 C25.5 15.5 26.5 12 27 9.5 C29 15 29.5 21 28 26 C27 33 23 38 16 38 Z',
        'M16 38 C8 38 3.5 32 4.5 26 C5.5 20 9 15 7.5 8.5 C11.5 12.5 13 17 13.5 18.5 C13 12.5 14 7 12.5 3 C19.5 7 23 12 22.5 18 C24 16.5 24.5 14.5 24 13.5 C27.5 17 28.5 21.5 27.5 26 C26.5 33 23 38 16 38 Z',
        'M16 38 C8.5 38 5 32 6 26 C7 21 10.5 17.5 10.5 12 C13 14.5 13.5 17.5 14.5 18.5 C15 11 16 6 16 1 C20.5 6.5 23 12.5 22 18 C24 16 24.5 14 24 11 C27.5 16 28.5 21 27.5 26 C26.5 33 23 38 16 38 Z',
      ],
      stops: [
        [0, 'tip'],
        [0.55, 'cobalt-600'],
        [1, 'cobalt-500'],
      ],
      edge: true,
      period: 1.3,
    },
    {
      frames: [
        'M16 37 C11 37 8 33 9 28 C10 24 13 22 13 17 C15 19 16 22 16 23 C17 19 19 15 18 11 C22 15 23 20 22 24 C23 23 24 22 24 21 C25 24 25 27 24 30 C23 34 20 37 16 37 Z',
        'M16 37 C11 37 8.5 33 9.5 28 C10.5 24.5 12 22 11.5 16 C14.5 18.5 15.5 21.5 16 22.5 C17.5 18 20.5 13 20.5 9 C23 14 23.5 19.5 22 24 C23.5 22.5 24.5 21 25 19 C25.5 23.5 25 27 24 30 C23 34 20 37 16 37 Z',
        'M16 37 C11 37 7.5 33 8.5 28 C9.5 23.5 12.5 20 12 14 C14.5 17 15 20.5 15.5 22 C16 18 17 15 16 12 C20.5 15.5 22.5 20 21.5 24 C22.5 23 23 22.5 23 22 C24.5 24.5 24.5 27 23.5 30 C22.5 34 20 37 16 37 Z',
        'M16 37 C11.5 37 9 33 9.5 28 C10.5 24 13.5 22.5 13.5 18 C15 19.5 16 22 16.5 23 C17 18 18 13 17.5 8.5 C21.5 14 22.5 19.5 21.5 24 C22.5 23 23.5 21.5 23.5 20 C24.5 24 24.5 27 23.5 30 C22.5 34 20 37 16 37 Z',
      ],
      stops: [
        [0, 'cobalt-600'],
        [0.5, 'cobalt-400'],
        [1, 'cobalt-300'],
      ],
      period: 0.95,
    },
    {
      frames: [
        'M16 36.5 C12.6 36.5 11 34.2 11.4 31.6 C11.8 28.8 14.6 27.6 15.4 24.4 C17.6 26.6 20.8 28.6 20.6 32 C20.4 34.6 18.6 36.5 16 36.5 Z',
        'M16 36.5 C12.4 36.5 10.8 34 11.2 31.2 C11.7 28.2 15 26.8 16.2 23 C18.2 25.8 21 28.4 20.8 31.8 C20.6 34.6 18.6 36.5 16 36.5 Z',
        'M16 36.5 C12.8 36.5 11.2 34.4 11.6 31.8 C12 29.2 14.2 28 14.6 25.2 C17 27.2 20.6 29 20.4 32.2 C20.2 34.8 18.4 36.5 16 36.5 Z',
        'M16 36.5 C12.6 36.5 11.2 34 11.6 31.2 C12 28.4 14.8 27 15.8 23.6 C17.8 26.2 20.6 28.4 20.4 31.8 C20.2 34.6 18.6 36.5 16 36.5 Z',
      ],
      stops: [
        [0, 'cobalt-200'],
        [0.55, 'cobalt-50'],
        [1, 'neutral-white'],
      ],
      period: 0.7,
    },
  ] as readonly Tongue[],
  embers: [
    { cx: 22, cy: 8, r: 1.1, drift: 2, period: 1.7, delay: 0 },
    { cx: 10.5, cy: 6, r: 0.85, drift: -1.5, period: 2.1, delay: 0.6 },
    { cx: 25, cy: 3, r: 0.6, drift: 1, period: 1.9, delay: 1.2 },
  ] as readonly Ember[],
  glow: { cx: 16, cy: 33, rx: 14, ry: 8, paint: 'cobalt-400' },
} as const;

const isRole = (p: string): p is Role => p in ROLES.light;
const cssVar = (token: string) => `var(--primitive-color-${token})`;
/** CSS paint for the animated mark: roles are custom properties the theme switches. */
const cssPaint = (p: string) => (isRole(p) ? `var(--rjb-flame-${p})` : cssVar(p));

/** Class names, shared by the JSX and the CSS. */
export const flameClass = {
  root: 'rjb-flame',
  tongue: (i: number) => `rjb-flame-tongue rjb-flame-t${i}`,
  stop: (t: number, s: number) => `rjb-flame-s${t}-${s}`,
  ember: (i: number) => `rjb-flame-ember rjb-flame-e${i}`,
  glow: 'rjb-flame-glow',
  glowStop: (s: number) => `rjb-flame-g${s}`,
};

/** The mark's stylesheet: colours from the HDS cobalt ramp, motion only when it is allowed. */
export function flameCss(): string {
  const roles = (theme: 'light' | 'dark') =>
    Object.entries(ROLES[theme])
      .map(([role, token]) => `--rjb-flame-${role}: ${cssVar(token)};`)
      .join(' ');
  const out: string[] = [
    `.rjb-flame { ${roles('light')} display: block; flex: none; overflow: visible; }`,
    `[data-theme='dark'] .rjb-flame { ${roles('dark')} }`,
    `.rjb-flame-ember { fill: var(--rjb-flame-ember); }`,
    `.rjb-flame-g0 { stop-color: ${cssVar(FLAME.glow.paint)}; stop-opacity: 0.55; }`,
    `.rjb-flame-g1 { stop-color: ${cssVar(FLAME.glow.paint)}; stop-opacity: 0; }`,
    `.rjb-flame-tongue, .rjb-flame-ember, .rjb-flame-glow { transform-box: fill-box; transform-origin: 50% 100%; }`,
    `.rjb-flame-t0 { stroke: var(--rjb-flame-edge); stroke-width: 1; stroke-linejoin: round; }`,
  ];
  FLAME.tongues.forEach((t, i) =>
    t.stops.forEach(([, paint], s) =>
      out.push(`.${flameClass.stop(i, s)} { stop-color: ${cssPaint(paint)}; }`),
    ),
  );
  // Motion: lively flicker (shape morph + stretch-and-snap), rising embers, a breathing glow. All of
  // it sits behind no-preference, so reduced motion gets frame 0, a still flame with its embers up.
  const motion: string[] = [];
  const snap = 'cubic-bezier(0.45, 0, 0.2, 1)';
  const stretch = ['scale(1, 1)', 'scale(0.96, 1.07)', 'scale(1.04, 0.94)', 'scale(0.97, 1.1)'];
  FLAME.tongues.forEach((t, i) => {
    const step = (pct: string, f: number) =>
      `${pct} { d: path("${t.frames[f]}"); transform: ${stretch[f]}; }`;
    motion.push(
      `@keyframes rjb-flame-t${i} { ${step('0%, 100%', 0)} ${step('25%', 1)} ${step('50%', 2)} ${step('75%', 3)} }`,
      `.rjb-flame-t${i} { animation: rjb-flame-t${i} ${t.period}s ${snap} ${-i * 0.23}s infinite; }`,
    );
  });
  FLAME.embers.forEach((e, i) => {
    motion.push(
      `@keyframes rjb-flame-e${i} { 0% { transform: translate(0, 12px) scale(1.3); opacity: 0; } 25% { opacity: 1; } 100% { transform: translate(${e.drift}px, -6px) scale(0.3); opacity: 0; } }`,
      `.rjb-flame-e${i} { animation: rjb-flame-e${i} ${e.period}s ease-out ${e.delay}s infinite backwards; }`,
    );
  });
  motion.push(
    `@keyframes rjb-flame-glow { from { opacity: 0.75; transform: scale(0.94); } to { opacity: 1; transform: scale(1.06); } }`,
    `.rjb-flame-glow { animation: rjb-flame-glow 0.55s ease-in-out infinite alternate; }`,
    `.rjb-flame[data-paused] * { animation-play-state: paused; }`,
  );
  out.push(`@media (prefers-reduced-motion: no-preference) { ${motion.join(' ')} }`);
  return out.join('\n');
}

/** The fixed noise that makes the edges lick (userSpaceOnUse: the region never moves). */
export const FLAME_NOISE = {
  /** Room above the viewBox for a stretched tip (the svg's overflow is visible; no layout shift). */
  region: { x: -4, y: -10, width: 40, height: 50 },
  baseFrequency: '0.09 0.15',
  numOctaves: 2,
  seed: 7,
  scale: 2.2,
};

/**
 * The still flame as a standalone SVG string, for the favicon, app icons and share image. Colours
 * are resolved to literal values by `color` (an HDS primitive token → hex): an icon file can't read
 * CSS variables. `tile` puts it on the graphite app tile, with the dark-theme roles. `label` names
 * the image (the favicon carries the product name, brand.test.ts).
 */
export function flameSvg({
  tile = false,
  color,
  label,
}: {
  tile?: boolean;
  color: (token: string) => string;
  label?: string;
}): string {
  const named = label ? ` role="img" aria-label="${label}"` : '';
  const roles = ROLES.dark;
  const paint = (p: string) => color(isRole(p) ? roles[p] : p);
  const grads = FLAME.tongues
    .map(
      (t, i) =>
        `<linearGradient id="t${i}" x1="0" y1="0" x2="0" y2="1">${t.stops
          .map(([o, p]) => `<stop offset="${o}" stop-color="${paint(p)}"/>`)
          .join('')}</linearGradient>`,
    )
    .join('');
  const g = FLAME.glow;
  // On the tile the flame fills the middle 72% of a 100-unit square.
  const flame =
    `<ellipse cx="${g.cx}" cy="${g.cy}" rx="${g.rx}" ry="${g.ry}" fill="url(#glow)"/>` +
    `<g filter="url(#lick)">${FLAME.tongues
      .map(
        (t, i) =>
          `<path d="${t.frames[0]}" fill="url(#t${i})"${
            t.edge ? ` stroke="${paint('edge')}" stroke-width="1" stroke-linejoin="round"` : ''
          }/>`,
      )
      .join('')}</g>` +
    FLAME.embers
      .map((e) => `<circle cx="${e.cx}" cy="${e.cy}" r="${e.r}" fill="${paint('ember')}"/>`)
      .join('');
  const defs =
    `<defs>${grads}` +
    `<radialGradient id="glow"><stop offset="0" stop-color="${color(g.paint)}" stop-opacity="0.55"/><stop offset="1" stop-color="${color(g.paint)}" stop-opacity="0"/></radialGradient>` +
    `<filter id="lick" filterUnits="userSpaceOnUse" x="${FLAME_NOISE.region.x}" y="${FLAME_NOISE.region.y}" width="${FLAME_NOISE.region.width}" height="${FLAME_NOISE.region.height}">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${FLAME_NOISE.baseFrequency}" numOctaves="${FLAME_NOISE.numOctaves}" seed="${FLAME_NOISE.seed}" result="n"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="n" scale="${FLAME_NOISE.scale}" xChannelSelector="R" yChannelSelector="G"/></filter></defs>`;
  if (!tile)
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${FLAME.viewBox}"${named}>${defs}${flame}</svg>\n`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${named}>${defs}` +
    `<rect width="100" height="100" rx="22" fill="${color('graphite-900')}"/>` +
    `<g transform="translate(21.2 14) scale(1.8)">${flame}</g></svg>\n`
  );
}
