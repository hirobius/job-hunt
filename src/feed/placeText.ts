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

const bare = (w: string) => w.toLowerCase().replace(/[^\p{L}]/gu, '');
const joiner = (w: string) => JOINERS.has(bare(w));
/** Words a cut place never ends on ("San Francisco, CA, or…"). */
const TRAILING = /(?:[\s,;:·&\-–—.!?]|\b(?:or|and|of|the|in|within|based)\b)+$/i;

/**
 * The place part of a location line. A long one is cut before the first sentence (a capitalised
 * word followed by a lower-case word that is no place joiner, or a full stop); a short one only when
 * a lower-case phrase of two or more words follows the place ("San Francisco, CA, or remote work
 * possible"), so "London or remote" stays whole. A long line of place words stays whole: the card
 * cuts it to one line. A cut place drops a trailing joiner and ends in an ellipsis (Adrian
 * 2026-11-15).
 */
export function placeText(s: string): string {
  const line = s.split(/\r?\n/)[0].replace(/\s+/g, ' ').trim();
  const words = line.split(' ').filter(Boolean);
  const short = words.length <= MAX_WORDS && !/[.!?](\s|$)/.test(line);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = words[i + 1] ?? '';
    const sentence = out.length > 0 && upper(w) && !!next && !upper(next) && !joiner(next);
    if (sentence) break;
    if (!upper(w) && !joiner(w)) break;
    out.push(w);
    if (/[.!?]$/.test(w)) break;
  }
  if (out.length === words.length) return line;
  const dropped = words.slice(out.length);
  if (short && dropped.filter((w) => !upper(w) && !joiner(w) && bare(w)).length < 2) return line;
  const place = out.join(' ').replace(TRAILING, '');
  return place ? `${place}…` : '';
}
