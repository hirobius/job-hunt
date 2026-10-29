// The wordmark's markup, built once for the app (Wordmark.tsx) and for `npm run icons`
// (the og-image), so both draw the same thing. Node-safe: no Vite imports. The real letter stays in
// the line, transparent (`.rjb-wordmark-ghost`), so the word's box and advance are exactly plain
// name; the flame sits over it on the baseline (wordmark.css).
import { BRAND } from '../brand.ts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** The wordmark's inner HTML, given the flame's svg markup (ids already made unique). */
export function wordmarkMarkup(flame: string): string {
  const { before, flame: letter, after } = BRAND.wordmark;
  return (
    `<span aria-hidden="true">${esc(before)}</span>` +
    `<span class="rjb-wordmark-o" aria-hidden="true">` +
    `<span class="rjb-wordmark-ghost">${esc(letter)}</span>` +
    `<span class="rjb-flame">${flame}</span></span>` +
    `<span aria-hidden="true">${esc(after)}</span>`
  );
}
