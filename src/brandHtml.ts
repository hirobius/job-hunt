// Fills index.html's %BRAND_*% placeholders from brand.ts at build/dev time (the `brand-html`
// plugin in vite.config.ts). Pure but for reading the flame, so the test can check index.html
// without a build. %BRAND_FLAME% is the boot splash's mark: src/brand/flame.svg as written.
import { readFileSync } from 'node:fs';
import { BRAND } from './brand.ts';

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** flame.svg for the splash: no comment, hidden from assistive tech (the splash is the status),
 *  and a height of its own so it is small even before the stylesheet lands. */
export function bootFlame(svg = readFileSync('src/brand/flame.svg', 'utf8')): string {
  return svg
    .replace(/<!--[\s\S]*?-->\s*/g, '')
    .trim()
    .replace('<svg ', '<svg height="60" aria-hidden="true" focusable="false" ');
}

export function applyBrand(html: string): string {
  return html
    .replace(/%BRAND_FLAME%/g, () => bootFlame())
    .replace(/%BRAND_NAME%/g, escapeAttr(BRAND.name))
    .replace(/%BRAND_DESCRIPTION%/g, escapeAttr(BRAND.description));
}
