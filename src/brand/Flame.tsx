// The flame logo. `flame.svg` beside this file is the one source of the mark: the header, the
// boot splash (index.html, via the brand-html plugin), the sign-in screen and `npm run icons`
// (favicon, PNG icons, favicon.ico, og-image) all read it. To change the logo, replace flame.svg,
// run `npm run icons` and commit; `flame.test.tsx` fails on a second copy anywhere else.
// In the app its layers take HDS primitives by class (`.flame-1..3` in base.css, light / dark);
// a file without those classes shows its own fills.
import { useId } from 'react';
import { BRAND } from '../brand';
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

/** The flame alone. Decorative: whatever sits beside it carries the name. `reveal` plays the
 *  short rise-in once (a static mark under prefers-reduced-motion). */
export function Flame({ className, reveal = false }: { className?: string; reveal?: boolean }) {
  const suffix = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <span
      className={['rjb-flame', reveal && 'rjb-flame-reveal', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      // The repo's own static file (a build-time import), never user content.
      dangerouslySetInnerHTML={{ __html: withUniqueIds(flameSvg, suffix) }}
    />
  );
}

/** The app bar lockup: the flame and the wordmark (the page's one h1), at `fontSize` px. */
export function BrandLogo({ fontSize = 19 }: { fontSize?: number }) {
  return (
    <span
      className="rjb-logo"
      ref={(el) => el?.style.setProperty('--rjb-logo-size', `${fontSize}px`)}
    >
      <Flame />
      <h1 className="rjb-logo-word">{BRAND.name}</h1>
    </span>
  );
}
