import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Token-level WCAG contrast audit.
 *
 * axe-core can't evaluate colour-contrast under jsdom (no layout engine), so the a11y
 * suite covers structure/semantics and this covers colour. Since ADR-0005 the palette is
 * HDS token CSS variables, so the audit reads the SHIPPED token files — HDS's
 * variables.css (the app ships no colour override since graphite, 2026-10-15) — resolves the alias chains for both
 * themes, and computes ratios per the WCAG 2.x relative-luminance formula. "Light + dark,
 * both AA-checked" stays enforced, not asserted in prose (and a regression in an HDS
 * release fails here before it ships).
 *
 * Thresholds: 4.5:1 for normal text (incl. small chip/badge labels); 3:1 for UI
 * components & graphical accents (links, icons, focus rings).
 */

const HDS_CSS = 'node_modules/@hirobius/design-system/dist/variables.css';

/** All `--var: value;` declarations inside the `selector { … }` rule. The selector must start a
 *  line and open the block, so a mention of it in a comment above doesn't match (it did: the
 *  dark map used to read the light `:root` block that followed a comment naming the dark one). */
function block(css: string, selector: string): Record<string, string> {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/["']/g, `["']`);
  const m = new RegExp(`^${esc}\\s*\\{`, 'm').exec(css);
  if (!m) return {};
  const s = m.index + m[0].length - 1;
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
  for (const d of css.slice(s + 1, e).matchAll(/--([a-zA-Z0-9-]+):\s*([^;]+);/g))
    map[d[1]] = d[2].trim();
  return map;
}

const hdsCss = fs.readFileSync(HDS_CSS, 'utf8');
const DARK = '[data-theme="dark"]';

// The browser's cascade: equal specificity, so source order decides. Light = HDS :root; dark =
// HDS :root with HDS's dark block on top.
const hdsRoot = block(hdsCss, ':root');
const light = { ...hdsRoot };
const dark = { ...hdsRoot, ...block(hdsCss, DARK) };

it('reads real light and dark blocks from the HDS stylesheet', () => {
  expect(Object.keys(hdsRoot).length).toBeGreaterThan(100);
  expect(Object.keys(block(hdsCss, DARK)).length).toBeGreaterThan(20);
});

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
    name: 'on-accent label on the accent (buttons)',
    fg: 'semantic-color-content-onAccent',
    bg: 'semantic-accent-rest',
    min: 4.5,
  },
  {
    name: 'accent as UI/link on page',
    fg: 'semantic-color-content-accent',
    bg: 'semantic-color-surface-page',
    min: 3,
  },
  {
    name: 'accent as UI/link on raised',
    fg: 'semantic-color-content-accent',
    bg: 'semantic-color-surface-raised',
    min: 3,
  },
  // Link text (InlineLink paints --semantic-accent-content) and the app's own focus ring
  // (base.css, --semantic-accent-rest). Jade links were 4.42:1 on cards (#159).
  {
    name: 'link text on page',
    fg: 'semantic-accent-content',
    bg: 'semantic-color-surface-page',
    min: 4.5,
  },
  {
    name: 'link text on raised (job titles on cards)',
    fg: 'semantic-accent-content',
    bg: 'semantic-color-surface-raised',
    min: 4.5,
  },
  {
    name: 'app focus ring on page',
    fg: 'semantic-accent-rest',
    bg: 'semantic-color-surface-page',
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
  {
    name: 'focus / highlight ring on the accent-subtle fill',
    fg: 'role-ring',
    bg: 'role-accent',
    min: 3,
  },
  {
    name: 'focus ring on page',
    fg: 'role-ring',
    bg: 'semantic-color-surface-page',
    min: 3,
  },
  {
    // HDS 0.36 dropped the --component-nav-* aliases for the values they named.
    name: 'active nav item text on its fill',
    fg: 'semantic-color-content-primary',
    bg: 'semantic-accent-subtle',
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
  // Composed Badge/Tag/Button states (#133): the tint a Badge sits on, and hover/selected/pressed
  // fills under the ordinary text roles.
  ...(['success', 'warning', 'error', 'info', 'inProgress'] as const).map((tone): Pair => ({
    name: `${tone} badge text on its tint`,
    fg: `semantic-color-feedback-${tone}`,
    bg: `semantic-color-feedback-bg-${tone}`,
    min: 4.5,
  })),
  ...(['hover', 'pressed', 'selected', 'sunken', 'muted'] as const).flatMap((fill): Pair[] => [
    {
      name: `body text on ${fill}`,
      fg: 'semantic-color-content-primary',
      bg: `semantic-color-surface-${fill}`,
      min: 4.5,
    },
    {
      name: `secondary text on ${fill}`,
      fg: 'semantic-color-content-secondary',
      bg: `semantic-color-surface-${fill}`,
      min: 4.5,
    },
  ]),
  {
    name: 'secondary text on the selected list item fill (--rjb-selected-fill, #603)',
    fg: 'semantic-color-content-secondary',
    bg: 'semantic-color-surface-selected',
    min: 4.5,
  },
  ...(['hover', 'pressed'] as const).map((state): Pair => ({
    name: `on-accent label on the ${state} accent`,
    fg: 'semantic-color-content-onAccent',
    bg: `semantic-accent-${state}`,
    min: 4.5,
  })),
];

for (const [mode, map] of [
  ['light', light],
  ['dark', dark],
] as const) {
  describe(`token contrast — ${mode} (WCAG AA, from shipped HDS variables.css)`, () => {
    it.each(pairs)('$name meets $min:1', ({ fg, bg, min }) => {
      expect(contrast(map, fg, bg)).toBeGreaterThanOrEqual(min);
    });
  });
}
