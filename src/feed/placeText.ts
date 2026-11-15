// A place is a short line ("Vilnius, Lithuania"), never a sentence. Some sources run the posting's
// first lines into the place: designsystems.jobs' Surfshark page gave "Lithuania This role sits in
// the Experience Design team and owns…" (Adrian 2026-11-15). Pure, no imports: the app and the sync
// edge function (Deno) both use it.

/** Words a place name may hold in lower case ("Isle of Man", "Rio de Janeiro"). */
const JOINERS = new Set([
  'of',
  'and',
  'or',
  'de',
  'da',
  'do',
  'del',
  'la',
  'le',
  'the',
  'am',
  'an',
  'im',
  'in',
  'within',
  'only',
  'based',
]);
const MAX_WORDS = 8;
const upper = (w: string) => /^[\p{Lu}\d(]/u.test(w);

/**
 * The place part of a location line: as given when it is short, else cut before the first sentence
 * (a capitalised word followed by a lower-case word that is no place joiner, or a full stop). A long
 * line of place words stays whole: the card cuts it to one line.
 */
export function placeText(s: string): string {
  const line = s.split(/\r?\n/)[0].replace(/\s+/g, ' ').trim();
  const words = line.split(' ').filter(Boolean);
  if (words.length <= MAX_WORDS && !/[.!?](\s|$)/.test(line)) return line;
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = words[i + 1] ?? '';
    const sentence =
      out.length > 0 &&
      upper(w) &&
      !!next &&
      !upper(next) &&
      !JOINERS.has(next.toLowerCase().replace(/[^\p{L}]/gu, ''));
    if (sentence) break;
    if (!upper(w) && !JOINERS.has(w.toLowerCase().replace(/[^\p{L}]/gu, ''))) break;
    out.push(w);
    if (/[.!?]$/.test(w)) break;
  }
  return out.join(' ').replace(/[,;:·\-–—\s.!?]+$/, '');
}
