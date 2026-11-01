// The wordmark's markup, built once for the app (Wordmark.tsx) and for `npm run icons`
// (the og-image), so both draw the same thing. Node-safe: no Vite imports. The flame comes first,
// then the name as real text (wordmark.css sets them on one baseline). In the app (`letters`) each
// letter is its own span, for the flame's per-letter flicker (flameMotion.ts); the og-image is
// still, so it keeps a plain run.
import { BRAND } from '../brand.ts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const split = (s: string, letters: boolean) =>
  letters ? [...s].map((c) => `<span class="rjb-wordmark-l">${esc(c)}</span>`).join('') : esc(s);

/** The wordmark's inner HTML, given the flame's svg markup (ids already made unique). */
export function wordmarkMarkup(flame: string, { letters = false } = {}): string {
  return (
    `<span class="rjb-wordmark-flame" aria-hidden="true"><span class="rjb-flame">${flame}</span></span>` +
    `<span class="rjb-wordmark-text" aria-hidden="true">${split(BRAND.name, letters)}</span>`
  );
}
