// flame.svg as text (Vite's ?raw), and the id rewrite that lets it appear more than once a page.
import flameSvg from './flame.svg?raw';

export { flameSvg };

/** The file's markup with every id (and each `#id` reference, any quoting) suffixed, so two
 *  flames on one page never share a clip path. Leading comments go. */
export function withUniqueIds(svg: string, suffix: string): string {
  const out = svg.replace(/<!--[\s\S]*?-->\s*/g, '').trim();
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
