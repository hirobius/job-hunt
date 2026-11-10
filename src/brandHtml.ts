// Fills index.html's %BRAND_*% placeholders from brand.ts at build/dev time (the `brand-html`
// plugin in vite.config.ts). Pure but for reading the flame, so the test can check index.html
// without a build. %BRAND_FLAME% is the boot splash's mark: the flame engine's loop,
// baked in as one group per frame that base.css steps through, so it moves before any script runs.
import { readFileSync } from 'node:fs';
import { BRAND } from './brand.ts';
import { FLAME, flameViewBox, loopFrames } from './brand/flameEngine.ts';

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The splash's flame: each frame of the engine's loop in its own group (its own clip), the first
 *  shown and the rest hidden by attribute, so with no stylesheet, or under reduced motion, it is the
 *  still mark; base.css steps one frame per 1/fps (the delays and loop length come from FLAME).
 *  Fills are flame.svg's; hidden from assistive tech (the splash is the status), and a height of
 *  its own so it is small even before the stylesheet lands. */
export function bootFlame(svg = readFileSync('src/brand/flame.svg', 'utf8')): string {
  const fills = [1, 2, 3].map(
    (n) => new RegExp(`class="flame-${n}" fill="([^"]+)"`).exec(svg)?.[1] ?? 'currentColor',
  );
  const ms = 1000 / FLAME.fps;
  const frames = loopFrames(FLAME);
  const groups = frames.map(
    ([d1, d2, d3], k) =>
      `<g class="rjb-boot-f"${k ? ' visibility="hidden"' : ''} style="animation-delay:${k * ms}ms">` +
      `<clipPath id="rjb-boot-c${k}"><use href="#rjb-boot-o${k}"/></clipPath>` +
      `<path id="rjb-boot-o${k}" class="flame-1" fill="${fills[0]}" d="${d1}"/>` +
      `<g clip-path="url(#rjb-boot-c${k})">` +
      `<path class="flame-2" fill="${fills[1]}" d="${d2}"/>` +
      `<path class="flame-3" fill="${fills[2]}" d="${d3}"/></g></g>`,
  );
  // The glow: a soft halo of the outer blue behind the flame (the sign-in screen's is CSS, late.css).
  const [x, y, w, h] = flameViewBox();
  const glow =
    `<radialGradient id="rjb-boot-glow"><stop offset="0" stop-color="${fills[0]}" stop-opacity=".26"/>` +
    `<stop offset="1" stop-color="${fills[0]}" stop-opacity="0"/></radialGradient>` +
    `<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${Math.round(h * 1.1)}" fill="url(#rjb-boot-glow)"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${[x, y, w, h].join(' ')}" height="60" ` +
    `aria-hidden="true" focusable="false" style="--rjb-flame-loop:${frames.length * ms}ms">` +
    glow +
    groups.join('') +
    '</svg>'
  );
}

export function applyBrand(html: string): string {
  return html
    .replace(/%BRAND_FLAME%/g, () => bootFlame())
    .replace(/%BRAND_NAME%/g, escapeAttr(BRAND.name))
    .replace(/%BRAND_DESCRIPTION%/g, escapeAttr(BRAND.description));
}
