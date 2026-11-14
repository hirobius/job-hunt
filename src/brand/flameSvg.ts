// flame.svg as text (Vite's ?raw), and the id rewrite that lets it appear more than once a page.
import flameSvg from './flame.svg?raw';

export { flameSvg };

/** flame.svg's three layers' path data, outer to core: the still mark (R5, hand-drawn, Adrian
 *  2026-11-14), in the flame engine's coordinates, so the animated logo shows it when still. */
export const STILL_MARK = (['flame-1', 'flame-2', 'flame-3'] as const).map(
  (cls) => new RegExp(`class="${cls}"[^>]*\\sd="([^"]*)"`).exec(flameSvg)?.[1] ?? '',
) as [string, string, string];

/** The file's markup with every id (and each `#id` reference, any quoting) suffixed, so two
 *  flames on one page never share a clip path. Comments and the whitespace between tags go (inline in a word,
 *  stray text nodes would sit in its textContent). */
export function withUniqueIds(svg: string, suffix: string): string {
  const out = svg
    .replace(/<!--[\s\S]*?-->\s*/g, '')
    .replace(/>\s+</g, '><')
    .trim();
  const ids = new Set([...out.matchAll(/\sid=["']([^"']+)["']/g)].map((m) => m[1]));
  const esc = (id: string) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...ids].reduce(
    (s, id) =>
      s
        .replace(new RegExp(`(\\sid=["'])${esc(id)}(["'])`, 'g'), `$1${id}-${suffix}$2`)
        .replace(new RegExp(`#${esc(id)}(?=["')])`, 'g'), `#${id}-${suffix}`),
    out,
  );
}
