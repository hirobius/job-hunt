import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Token-level WCAG contrast audit.
 *
 * axe-core can't evaluate colour-contrast under jsdom (no layout engine), so the a11y
 * suite covers structure/semantics and this covers colour. Since ADR-0005 the palette is
 * HDS token CSS variables, so the audit reads the SHIPPED token files — HDS's
 * variables.css plus our brand-jade.css override — resolves the alias chains for both
 * themes, and computes ratios per the WCAG 2.x relative-luminance formula. "Light + dark,
 * both AA-checked" stays enforced, not asserted in prose (and a regression in an HDS
 * release fails here before it ships).
 *
 * Thresholds: 4.5:1 for normal text (incl. small chip/badge labels); 3:1 for UI
 * components & graphical accents (links, icons, focus rings).
 */

const HDS_CSS = 'node_modules/@hirobius/design-system/dist/variables.css';
const JADE_CSS = 'src/theme/brand-jade.css';

/** All `--var: value;` declarations inside the first `selector { … }` block. */
function block(css: string, selector: string): Record<string, string> {
  const i = css.indexOf(selector);
  if (i < 0) return {};
  const s = css.indexOf('{', i);
  let depth = 0;
  let e = -1;
  for (let k = s; k < css.length; k++) {
    if (css[k] === '{') depth++;
    else if (css[k] === '}') {
      depth--;
      if (!depth) {
        e = k;
        break;
      }
    }
  }
  const map: Record<string, string> = {};
  for (const m of css.slice(s + 1, e).matchAll(/--([a-zA-Z0-9-]+):\s*([^;]+);/g))
    map[m[1]] = m[2].trim();
  return map;
}

/** The dark-theme block, tolerating either quote style in the selector. */
const darkOf = (css: string) => {
  const dq = block(css, '[data-theme="dark"]');
  return Object.keys(dq).length ? dq : block(css, "[data-theme='dark']");
};

const hdsCss = fs.readFileSync(HDS_CSS, 'utf8');
const jadeCss = fs.readFileSync(JADE_CSS, 'utf8');

// light = both :root layers (jade overrides hds); dark = light + both dark layers.
const light = { ...block(hdsCss, ':root'), ...block(jadeCss, ':root') };
const dark = { ...light, ...darkOf(hdsCss), ...darkOf(jadeCss) };

/** Substitute var() chains until a concrete value remains. */
function resolve(map: Record<string, string>, name: string): string {
  let v = `var(--${name})`;
  for (let i = 0; i < 60 && /var\(/.test(v); i++) {
    v = v.replace(/var\(--([a-zA-Z0-9-]+)\)/g, (_, n: string) => {
      if (map[n] == null) throw new Error(`unresolvable token --${n} (from --${name})`);
      return map[n];
    });
  }
  return v.trim();
}

// ---- colour math: oklch → sRGB, then WCAG luminance/contrast ----
const unlin = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function oklchToRgb(L: number, C: number, H: number): [number, number, number] {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    unlin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    unlin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    unlin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const inGamut = (rgb: number[]) => rgb.every((c) => c >= -0.001 && c <= 1.001);

/** Out-of-gamut oklch is mapped the way browsers (and our old generator) do it:
 *  hold L and H, reduce chroma until the colour fits sRGB. */
function oklchToSrgb(L: number, C: number, H: number): [number, number, number] {
  let c = C;
  while (c > 0 && !inGamut(oklchToRgb(L, c, H))) c -= 0.002;
  return oklchToRgb(L, c, H).map(clamp01) as [number, number, number];
}

/** Concrete CSS colour (oklch() or hex) → [r,g,b] in 0..1. */
function toRgb(value: string): [number, number, number] {
  const ok = value.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)?/i);
  if (ok) return oklchToSrgb(+ok[1], +ok[2], +ok[3]);
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = [...h].map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
  }
  if (value === 'white') return [1, 1, 1];
  if (value === 'black') return [0, 0, 0];
  throw new Error(`unsupported colour format: ${value}`);
}

const channel = (s: number) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4);
const luminance = (rgb: [number, number, number]) =>
  0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
function contrast(map: Record<string, string>, fg: string, bg: string): number {
  const la = luminance(toRgb(resolve(map, fg)));
  const lb = luminance(toRgb(resolve(map, bg)));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

type Pair = { name: string; fg: string; bg: string; min: number };

const FEEDBACK = ['success', 'warning', 'error', 'info', 'inProgress'] as const;

const pairs: Pair[] = [
  {
    name: 'body text on page',
    fg: 'semantic-color-content-primary',
    bg: 'semantic-color-surface-page',
    min: 4.5,
  },
  {
    name: 'body text on raised',
    fg: 'semantic-color-content-primary',
    bg: 'semantic-color-surface-raised',
    min: 4.5,
  },
  {
    name: 'secondary text on page',
    fg: 'semantic-color-content-secondary',
    bg: 'semantic-color-surface-page',
    min: 4.5,
  },
  {
    name: 'secondary text on raised',
    fg: 'semantic-color-content-secondary',
    bg: 'semantic-color-surface-raised',
    min: 4.5,
  },
  {
    name: 'on-accent label on jade accent (buttons)',
    fg: 'semantic-color-content-onAccent',
    bg: 'semantic-accent-rest',
    min: 4.5,
  },
  {
    name: 'jade accent as UI/link on page',
    fg: 'semantic-color-content-accent',
    bg: 'semantic-color-surface-page',
    min: 3,
  },
  {
    name: 'jade accent as UI/link on raised',
    fg: 'semantic-color-content-accent',
    bg: 'semantic-color-surface-raised',
    min: 3,
  },
  // Selected / highlighted states the audit found unreadable (#115, #129): the status filter's
  // highlighted menu item (and every HDS hover that uses the accent-subtle fill) paints
  // accent text on the accent-subtle surface.
  {
    name: 'highlighted menu item (status filter) text on its accent-subtle fill',
    fg: 'role-accent-foreground',
    bg: 'role-accent',
    min: 4.5,
  },
  {
    name: 'button label on its accent-subtle hover fill',
    fg: 'role-foreground',
    bg: 'role-accent',
    min: 4.5,
  },
  ...FEEDBACK.flatMap((tone): Pair[] => [
    {
      name: `${tone} text/badge on page`,
      fg: `semantic-color-feedback-${tone}`,
      bg: 'semantic-color-surface-page',
      min: 4.5,
    },
    {
      name: `${tone} text/badge on raised`,
      fg: `semantic-color-feedback-${tone}`,
      bg: 'semantic-color-surface-raised',
      min: 4.5,
    },
  ]),
];

for (const [mode, map] of [
  ['light', light],
  ['dark', dark],
] as const) {
  describe(`token contrast — ${mode} (WCAG AA, from shipped HDS variables.css + brand-jade.css)`, () => {
    it.each(pairs)('$name meets $min:1', ({ fg, bg, min }) => {
      expect(contrast(map, fg, bg)).toBeGreaterThanOrEqual(min);
    });
  });
}
