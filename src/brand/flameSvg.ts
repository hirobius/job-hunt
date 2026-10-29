// flame.svg as text (Vite's ?raw), and the id rewrite that lets it appear more than once a page.
import flameSvg from './flame.svg?raw';

export { flameSvg };

/** The file's markup with every id (and each `#id` reference) suffixed, so two flames on one
 *  page never share a clip path. Leading comments go. */
export function withUniqueIds(svg: string, suffix: string): string {
  const out = svg.replace(/<!--[\s\S]*?-->\s*/g, '').trim();
  const ids = [...out.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const swap = (s: string, from: string, to: string) => s.split(from).join(to);
  return ids.reduce(
    (s, id) =>
      [`id="${id}"`, `#${id}"`, `#${id})`].reduce(
        (t, ref) => swap(t, ref, ref.replace(id, `${id}-${suffix}`)),
        s,
      ),
    out,
  );
}
