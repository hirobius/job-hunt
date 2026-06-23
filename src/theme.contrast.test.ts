import { describe, expect, it } from 'vitest';
import { makeTheme } from './theme';

/**
 * Token-level WCAG contrast audit.
 *
 * axe-core can't evaluate colour-contrast under jsdom (no layout engine), so the
 * a11y suite covers structure/semantics and this covers colour. Ratios are
 * computed straight from the MUI palette per the WCAG 2.x relative-luminance
 * formula, for BOTH themes — so "light + dark, both AA-checked" is enforced, not
 * asserted in prose.
 *
 * Thresholds: 4.5:1 for normal text (incl. small chip labels / overlines);
 * 3:1 for UI components & graphical accents (links, icons, focus rings).
 */

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string) => {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrast = (a: string, b: string) => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

type Pair = { name: string; fg: string; bg: string; min: number };

function pairs(mode: 'light' | 'dark'): Pair[] {
  const p = makeTheme(mode).palette;
  return [
    { name: 'body text on background', fg: p.text.primary, bg: p.background.default, min: 4.5 },
    { name: 'body text on paper', fg: p.text.primary, bg: p.background.paper, min: 4.5 },
    {
      name: 'secondary text on background',
      fg: p.text.secondary,
      bg: p.background.default,
      min: 4.5,
    },
    { name: 'secondary text on paper', fg: p.text.secondary, bg: p.background.paper, min: 4.5 },
    { name: 'button label on primary', fg: p.primary.contrastText, bg: p.primary.main, min: 4.5 },
    { name: 'success chip/text on paper', fg: p.success.main, bg: p.background.paper, min: 4.5 },
    {
      name: 'success chip/text on background',
      fg: p.success.main,
      bg: p.background.default,
      min: 4.5,
    },
    { name: 'warning chip/text on paper', fg: p.warning.main, bg: p.background.paper, min: 4.5 },
    {
      name: 'warning chip/text on background',
      fg: p.warning.main,
      bg: p.background.default,
      min: 4.5,
    },
    { name: 'error chip/text on paper', fg: p.error.main, bg: p.background.paper, min: 4.5 },
    {
      name: 'primary as UI/link on background',
      fg: p.primary.main,
      bg: p.background.default,
      min: 3,
    },
    { name: 'primary as UI/link on paper', fg: p.primary.main, bg: p.background.paper, min: 3 },
  ];
}

for (const mode of ['dark', 'light'] as const) {
  describe(`theme contrast — ${mode} (WCAG AA)`, () => {
    it.each(pairs(mode))('$name meets $min:1', ({ fg, bg, min }) => {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min);
    });
  });
}
