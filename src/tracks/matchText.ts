// The text a server row carries to the browser (#499): a stored description is up to 20,000
// characters, and Review new reads up to 1,000 rows, so a phone could pull ~20 MB of text it only
// tests a few patterns against. The sync keeps, beside the full description, a match text: the
// head of it (what a preview shows first) and a window around every hit of every pattern the
// browser tests on a posting's text, so it reaches the same answers:
//   - the scorer's description signals (the track config the row was scored with),
//   - the contract / founding signals (feed/signalPatterns.ts),
//   - the profile's include, leave-out and title terms (feed/term.ts `termRegex`: whitespace or a
//     hyphen between words, so it finds every place the phrase rules can).
// Windows grow to whole words and are joined by "\n…\n", so no pattern can match across a join that
// did not match in the full text. `matchText.test.ts` holds the rank parity: the Feed lists and
// scores the trimmed rows exactly as the full ones. Pure, `.ts` specifiers: the edge function loads it.
import { CONTRACT_RE, FOUNDING_RE } from '../feed/signalPatterns.ts';
import { termRegex } from '../feed/term.ts';
import type { Profile } from '../profileModel.ts';
import { designSystemsTrack } from './track-config.ts';

/** Shorter than this, a description is sent whole. */
export const MATCH_TEXT_PLAIN_MAX = 2000;
/** The head kept as is (a preview's first lines). */
export const MATCH_TEXT_HEAD = 600;
/** Characters kept each side of a hit (the contract rule reads 40 before and 30 after). */
export const MATCH_TEXT_AROUND = 160;
const JOIN = '\n…\n';

const global = (re: RegExp) =>
  new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);

/** The patterns the browser tests on a posting's text, for a scorer's signals and profile terms. */
export function matchPatterns(signals: readonly string[], terms: readonly string[]): RegExp[] {
  const out: RegExp[] = [CONTRACT_RE, FOUNDING_RE, ...signals.map((s) => new RegExp(s, 'i'))];
  for (const term of terms) {
    // The whole phrase: the one synonym rule ("systems" for "design system") reads titles only.
    const re = termRegex(term);
    if (re) out.push(re);
  }
  return out;
}

const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c);

/** `text` cut to its head and a window around every hit, joined; whole when it is short. */
export function trimForMatch(text: string, patterns: readonly RegExp[]): string {
  if (text.length <= MATCH_TEXT_PLAIN_MAX) return text;
  const spans: [number, number][] = [[0, MATCH_TEXT_HEAD]];
  for (const re of patterns)
    for (const m of text.matchAll(global(re))) {
      const at = m.index ?? 0;
      spans.push([at - MATCH_TEXT_AROUND, at + m[0].length + MATCH_TEXT_AROUND]);
    }
  // Whole words only: a cut inside a word ("contract|or") could make a match the full text has not.
  const grow = ([a, b]: [number, number]): [number, number] => {
    let s = Math.max(0, a);
    let e = Math.min(text.length, b);
    while (s > 0 && !isSpace(text[s - 1])) s--;
    while (e < text.length && !isSpace(text[e])) e++;
    return [s, e];
  };
  const merged: [number, number][] = [];
  for (const span of spans.map(grow).sort((x, y) => x[0] - y[0])) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1] + 1) last[1] = Math.max(last[1], span[1]);
    else merged.push(span);
  }
  const out = merged.map(([s, e]) => text.slice(s, e)).join(JOIN);
  return out.length < text.length ? out : text;
}

/** Change when the trim rules change: every stored match text then reads as stale. */
const MATCH_RULES = 1;
/** Related titles the Feed can add to a profile's titles (feed/mustInclude.ts RELATED_TITLES). */
const RELATED = ['design technologist', 'design engineer', 'ux engineer'];

/** Every term the Feed can test on a posting's text for this profile: include, leave out, every
 *  title and ATS role (on or off: a superset only keeps more text), the related titles. */
export function textTermsOf(p: Profile): string[] {
  const all = [...p.include.terms, ...p.leaveOut, ...p.titles, ...p.atsRoles, ...RELATED];
  return [...new Set(all.map((t) => t.trim().toLowerCase()).filter(Boolean))].sort();
}

/** What a match text was cut for: the rules, the profile's text terms and what picks its scorer.
 *  The sync stores it beside the text; `feed_rows` sends the full text when the browser's key
 *  differs (a term added since the sync). The same on both sides: pure, FNV-1a over JSON. */
export function matchKey(p: Profile): string {
  const json = JSON.stringify([
    MATCH_RULES,
    textTermsOf(p),
    p.scorer ?? '',
    p.include.related === false,
    [...(p.include.relatedOff ?? [])].sort(),
    designSystemsTrack.descriptionSignals.map((d) => d.pattern),
  ]);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) h = Math.imul(h ^ json.charCodeAt(i), 0x01000193);
  return `${MATCH_RULES}:${(h >>> 0).toString(16)}`;
}
