// The burn's two layers share one geometry (#695 follow-up, Adrian's iPhone recording: the edge drew
// beside the hole). The reveal clip is in viewport px from the burn's w × h; the edge layer must be
// exactly w × h px with a w × h viewBox, never sized by 100vw / 100vh (on iOS 100vh is the large
// viewport, taller than innerHeight, which stretched the edge down the page).
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { overlay, holeClip } from './burn';
import { BURN, createBurn } from './burnField';

describe('the burn edge and the reveal share one geometry', () => {
  for (const [w, h] of [
    [390, 664],
    [390, 844],
    [1440, 900],
  ])
    it(`the edge layer is ${w} × ${h} px with a matching viewBox`, () => {
      const { svg } = overlay(w, h, 'rgb(255, 255, 255)');
      expect(svg.getAttribute('viewBox')).toBe(`0 0 ${w} ${h}`);
      expect(svg.getAttribute('width')).toBe(String(w));
      expect(svg.getAttribute('height')).toBe(String(h));
      expect(svg.style.getPropertyValue('--rjb-burn-w')).toBe(String(w));
      expect(svg.style.getPropertyValue('--rjb-burn-h')).toBe(String(h));
      // Not stretched: one user unit is one CSS px.
      expect(svg.getAttribute('preserveAspectRatio')).toBeNull();
    });

  it('the edge draws the very hole the reveal clips to', () => {
    const frame = createBurn({ ...BURN, seed: 7 }, 390, 664, 300, 40);
    const f = frame(0.5);
    const { svg, show } = overlay(390, 664, 'rgb(0, 0, 0)');
    show(f);
    const d = svg.querySelector('path')!.getAttribute('d')!;
    expect(f.hole).not.toBe('');
    expect(d.endsWith(f.hole)).toBe(true);
    expect(holeClip(f.hole)).toBe(`path(evenodd, '${f.hole}')`);
  });

  it('burn.css never sizes the edge layer by the viewport units', () => {
    const css = fs.readFileSync('src/burn/burn.css', 'utf8');
    const rim = css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .match(/\.rjb-burn-rim\[data-root\]\s*\{[^}]*\}/)![0];
    expect(rim).not.toMatch(/\d+(?:vw|vh|svh|lvh|dvh)/);
    expect(rim).not.toMatch(/inset:\s*0/);
    expect(rim).toContain('width: calc(var(--rjb-burn-w) * 1px)');
    expect(rim).toContain('height: calc(var(--rjb-burn-h) * 1px)');
  });
});
