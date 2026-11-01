// Phrase matching for a search term (match.ts re-exports it). Its own module, with no app imports,
// so the sync edge function can load it through the HN source.
import type { Posting } from './types.ts';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** One word of a term, singular/plural-tolerant: library ↔ libraries, system ↔ systems,
 *  process ↔ processes. Short or non-alphabetic words ("UI", "front-end") match exactly, and
 *  words that only look plural ("status", "analysis") never lose their final s. */
export function inflect(word: string): string {
  if (word.length < 3 || /[^a-z]/i.test(word)) return escapeRe(word);
  if (/[^aeiou]y$/i.test(word)) return escapeRe(word.slice(0, -1)) + '(?:y|ies)';
  if (/[^aeiou]ies$/i.test(word)) return escapeRe(word.slice(0, -3)) + '(?:y|ies)';
  if (/(?:ss|x|z|ch|sh)es$/i.test(word)) return escapeRe(word.slice(0, -2)) + '(?:es)?';
  if (/(?:ss|us|is|x|z|ch|sh)$/i.test(word)) return escapeRe(word) + '(?:es)?';
  if (/s$/i.test(word)) return escapeRe(word.slice(0, -1)) + 's?';
  return escapeRe(word) + 's?';
}

/** Phrase regex for a search term: its words in order, whitespace or a hyphen between them,
 *  whole words only, each word singular/plural-tolerant. "system design" is NOT "design system".
 *  The edges are lookarounds, not `\b`, so a term that starts or ends on a symbol (C++, C#, .NET)
 *  still matches, and + or # continue a word: "C" is not "C++", ".NET" is not "ASP.NET". */
export function termRegex(term: string): RegExp | null {
  // A hyphen between words reads like a space: "front-end" also finds "Front End".
  const words = term
    .trim()
    .split(/\s+|(?<=\w)-(?=\w)/)
    .filter(Boolean);
  if (words.length === 0) return null;
  return new RegExp(`(?<![\\w+#])${words.map(inflect).join('[\\s-]+')}(?![\\w+#])`, 'i');
}

/** Where (if anywhere) a posting mentions the term. Title wins over body. */
export function matchTerm(p: Posting, term: string): 'title' | 'text' | null {
  const re = termRegex(term);
  if (!re) return null;
  if (re.test(p.title)) return 'title';
  if (re.test(p.text)) return 'text';
  return null;
}
