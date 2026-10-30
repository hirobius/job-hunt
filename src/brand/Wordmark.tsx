// The wordmark: "St", the flame in place of the "o", "ke" (Adrian 2026-10-29). Named for assistive
// tech by aria-label; its parts and the flame are hidden. The markup is wordmarkMarkup's, shared
// with the og-image; the flame is src/brand/flame.svg with its ids made unique per instance.
import { useId, useMemo } from 'react';
import { BRAND } from '../brand';
import { flameSvg, withUniqueIds } from './flameSvg';
import { wordmarkMarkup } from './wordmarkMarkup';
import './wordmark.css';

// Never a heading (#363): the page's own name is its h1, so the wordmark is an image named for the
// product.
export function Wordmark({ as: Tag = 'span' }: { as?: 'p' | 'span' }) {
  const suffix = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const html = useMemo(() => wordmarkMarkup(withUniqueIds(flameSvg, suffix)), [suffix]);
  return (
    <Tag
      className="rjb-logo-word"
      role="img"
      aria-label={BRAND.name}
      // The repo's own static markup (brand.ts + flame.svg), never user content.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
