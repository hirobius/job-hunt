// The flame logo. `flame.svg` beside this file is the one source of the mark: the header, the
// boot splash (index.html, via the brand-html plugin, a baked loop of the engine's frames), the
// sign-in screen and `npm run icons` (favicon, PNG icons, favicon.ico, og-image) all read it. It is
// the still frame of flameEngine.ts (Adrian's Version E), written by `npm run icons`;
// `flame.test.tsx` fails on a second copy anywhere else. In the app its layers take HDS primitives
// by class (`.flame-1..3` in base.css, light / dark), and flameMotion.ts sets them moving.
import { useEffect, useId, useMemo, useRef } from 'react';
import { Wordmark } from './Wordmark';
import { flameSvg, withUniqueIds } from './flameSvg';
import { animateFlame } from './flameMotion';

/** The flame alone. Decorative: whatever sits beside it carries the name. `animate` sets it
 *  moving (Version E, endless; flame.svg, still, under prefers-reduced-motion). */
export function Flame({ className, animate = false }: { className?: string; animate?: boolean }) {
  const suffix = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const html = useMemo(() => withUniqueIds(flameSvg, suffix), [suffix]);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const svg = animate ? ref.current?.querySelector('svg') : null;
    return svg ? animateFlame(svg) : undefined;
  }, [animate, html]);
  return (
    <span
      ref={ref}
      className={['rjb-flame', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      // The repo's own static file (a build-time import), never user content.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** The app bar lockup: the wordmark (an image named for the product, the flame as its "o"; the page's
 *  own name is its h1, #363), at `fontSize` px. */
export function BrandLogo({ fontSize = 19 }: { fontSize?: number }) {
  return (
    <span
      className="rjb-logo"
      ref={(el) => el?.style.setProperty('--rjb-logo-size', `${fontSize}px`)}
    >
      <Wordmark />
    </span>
  );
}
