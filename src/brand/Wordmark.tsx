// The wordmark: the flame, then the name (Adrian 2026-10-30; was St(flame)ke). Named for assistive
// tech by aria-label; its parts and the flame are hidden. The markup is wordmarkMarkup's, shared
// with the og-image; the flame is src/brand/flame.svg with its ids made unique per instance, set
// moving by flameMotion (Version E; still under reduced motion), its letters flickering with it.
import { useEffect, useId, useMemo, useRef } from 'react';
import { BRAND } from '../brand';
import { flameSvg, withUniqueIds } from './flameSvg';
import { startFlame } from './startFlame';
import { wordmarkMarkup } from './wordmarkMarkup';
import './wordmark.css';

// Never a heading (#363): the page's own name is its h1, so the wordmark is an image named for the
// product.
/** `still` keeps it unmoving: the placeholder shown while the animated logo's chunk loads. */
export function Wordmark({
  as: Tag = 'span',
  still = false,
}: {
  as?: 'p' | 'span';
  still?: boolean;
}) {
  const suffix = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const html = useMemo(
    () => wordmarkMarkup(withUniqueIds(flameSvg, suffix), { letters: true }),
    [suffix],
  );
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    const svg = el?.querySelector('.rjb-flame svg');
    if (still || !el || !svg) return;
    return startFlame(svg, [...el.querySelectorAll<HTMLElement>('.rjb-wordmark-l')]);
  }, [html, still]);
  return (
    <Tag
      ref={ref as never}
      className="rjb-logo-word"
      role="img"
      aria-label={BRAND.name}
      // The repo's own static markup (brand.ts + flame.svg), never user content.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
