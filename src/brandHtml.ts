// Fills index.html's %BRAND_*% placeholders from brand.ts at build/dev time (the `brand-html`
// plugin in vite.config.ts). Pure but for reading the flame, so the test can check index.html
// without a build. %BRAND_FLAME% is the boot splash's mark: the flame engine's loop,
// baked in as one group per frame that base.css steps through, so it moves before any script runs.
import { readFileSync } from 'node:fs';
import { BRAND } from './brand.ts';
import { FLAME, flameViewBox, loopFrames } from './brand/flameEngine.ts';

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The splash's flame: each frame of the engine's loop in its own group, the first
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
    (d, k) =>
      `<g class="rjb-boot-f"${k ? ' visibility="hidden"' : ''} style="animation-delay:${k * ms}ms">` +
      d
        .map(
          (p, i) =>
            `<path class="flame-${i + 1}" fill="${fills[i]}" fill-rule="evenodd" d="${p}"/>`,
        )
        .join('') +
      '</g>',
  );
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${flameViewBox().join(' ')}" height="60" ` +
    `aria-hidden="true" focusable="false" style="--rjb-flame-loop:${frames.length * ms}ms">` +
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
