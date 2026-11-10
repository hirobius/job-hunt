// Fills index.html's %BRAND_*% placeholders from brand.ts at build/dev time (the `brand-html`
// plugin in vite.config.ts). Pure but for reading the flame, so the test can check index.html
// without a build. %BRAND_FLAME% is the boot splash's mark: the flame's still frame, which
// brand/bootFlame.ts then sets burning.
import { readFileSync } from 'node:fs';
import { BRAND } from './brand.ts';
import { flameViewBox, stillFrame } from './brand/flameEngine.ts';

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The splash's flame: flame.svg's still mark, so with no script, or under reduced motion, it is
 *  the logo; bootFlame.ts (its own small chunk) then runs the live fire on these same paths. Fills
 *  are flame.svg's; hidden from assistive tech (the splash is the status), and a height of its own
 *  so it is small even before the stylesheet lands. */
export function bootFlame(svg = readFileSync('src/brand/flame.svg', 'utf8')): string {
  const fills = [1, 2, 3].map(
    (n) => new RegExp(`class="flame-${n}" fill="([^"]+)"`).exec(svg)?.[1] ?? 'currentColor',
  );
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${flameViewBox().join(' ')}" height="60" ` +
    'aria-hidden="true" focusable="false">' +
    stillFrame()
      .map(
        (d, i) => `<path class="flame-${i + 1}" fill="${fills[i]}" fill-rule="evenodd" d="${d}"/>`,
      )
      .join('') +
    '</svg>'
  );
}

export function applyBrand(html: string): string {
  return html
    .replace(/%BRAND_FLAME%/g, () => bootFlame())
    .replace(/%BRAND_NAME%/g, escapeAttr(BRAND.name))
    .replace(/%BRAND_DESCRIPTION%/g, escapeAttr(BRAND.description));
}
