// The feed's ranking rules — pure, DOM-free, deterministic (same stance as the rules-based JD
// screener, src/jdScreener.ts). Every Posting a source returns passes through here: it must mention
// the search term as a PHRASE (not loose words — "system design" is not "design system"), survive
// the location/work-mode filter, and is then scored so the openings worth acting on float up.
import type { WorkMode } from '../jobsData';
import { dedupKey } from '../store';
import type { Posting, RankedPosting, Signal, SignalId } from './types';

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
  const words = term.trim().split(/\s+|(?<=\w)-(?=\w)/).filter(Boolean);
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

// ---- signals: why an opening is worth a closer look (beyond matching the term) ----

const CONTRACT_RE = /\b(contract|1099|freelance(?:rs?)?|fractional|part[- ]time)\b/gi;
/** A negation earlier in the same clause: "no contract", "W2 only, not part-time". */
const NEGATED_RE = /\b(?:no|not|non|never|without|nor)\b|\bw-?2\s+only\b/i;
/** "contract" naming a document or a job function, not an engagement. */
const CONTRACT_NOUN_BEFORE_RE =
  /\b(?:employment|vendor|government|federal|customer|client|sales|service|enterprise|signed)\s+$/i;
const CONTRACT_NOUN_AFTER_RE =
  /^\s*(?:manager|management|administrator|administration|negotiations?|terms|law|lawyer|specialist|analyst|review|renewals?|value|lifecycle)\b/i;

/** Open to non-full-time engagement — the consulting / fractional opening. */
function contractEvidence(text: string): string | null {
  for (const m of text.matchAll(CONTRACT_RE)) {
    const at = m.index ?? 0;
    const before = text.slice(Math.max(0, at - 40), at);
    const clause = before.split(/[.,;:!?\n]/).pop() ?? '';
    if (NEGATED_RE.test(clause)) continue;
    if (/^contract$/i.test(m[1])) {
      if (CONTRACT_NOUN_BEFORE_RE.test(before)) continue;
      if (CONTRACT_NOUN_AFTER_RE.test(text.slice(at + m[0].length, at + m[0].length + 30)))
        continue;
    }
    return m[0];
  }
  return null;
}

/** Building it from zero — the team needs the thing made, not a maintainer of one. Role words, not
 *  a company's age: "founding engineer" counts, "since our founding in 2015" does not. */
const FOUNDING_RE = new RegExp(
  [
    String.raw`\bfounding\s+(?:[a-z-]+\s+){0,2}?(?:engineer|designer|developer|hire|member|team|role|lead)s?\b`,
    String.raw`\bfirst(?:-ever)?\s+(?:dedicated\s+|full[- ]time\s+|in[- ]house\s+)?(?:[a-z-]+\s+){0,2}?(?:engineer|designer|developer|hire|owner|lead|person|role)\b`,
    String.raw`\bbuild\s+(?:our|the|a)\s+(?:[a-z-]+\s+){0,2}?(?:design[- ]system|component[- ]library)\s+from\s+scratch\b`,
  ].join('|'),
  'i',
);

const SIGNALS: { id: SignalId; label: string; evidence: (text: string) => string | null }[] = [
  { id: 'contract', label: 'Contract-friendly', evidence: contractEvidence },
  {
    id: 'founding',
    label: 'Founding / first hire',
    evidence: (t) => FOUNDING_RE.exec(t)?.[0] ?? null,
  },
];

export function detectSignals(text: string): Signal[] {
  const out: Signal[] = [];
  for (const s of SIGNALS) {
    const hit = s.evidence(text);
    if (hit) out.push({ id: s.id, label: s.label, evidence: hit.replace(/\s+/g, ' ') });
  }
  return out;
}

export { inferMode } from './mode';

/** ~`max` chars of `text` centred on the first term hit (head of the text when there's none). */
export function snippetAround(text: string, term: string, max = 200): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const m = termRegex(term)?.exec(flat);
  let start = 0;
  if (m) start = Math.max(0, Math.round(m.index + m[0].length / 2 - max / 2));
  const end = Math.min(flat.length, start + max);
  start = Math.max(0, end - max);
  return (start > 0 ? '…' : '') + flat.slice(start, end).trim() + (end < flat.length ? '…' : '');
}

// ---- ranking ----

export interface RankOptions {
  term: string;
  /** Free-text location filter ('' = anywhere). */
  where: string;
  mode: WorkMode;
  /** Epoch ms — injected so ranking is deterministic in tests. */
  now: number;
}

// The two lead signals weigh the same: a first hire and a contract opening are both the pitch.
const SCORE = { title: 10, text: 4, contract: 6, founding: 6, fresh: 3, recent: 1 };
const DAY = 864e5;

function passesFilters(p: Posting, where: string, mode: WorkMode): boolean {
  if (mode !== 'any' && p.mode && p.mode !== mode) return false;
  // Remote mode disables the location input, so a location typed earlier must not still filter.
  if (mode === 'remote') return true;
  // "Austin, TX" vs a source's "Austin, Texas, United States": match on the city.
  const city = where.split(',')[0].trim().toLowerCase();
  if (city && p.location && p.mode !== 'remote' && !p.location.toLowerCase().includes(city))
    return false;
  return true;
}

export function rankPostings(postings: Posting[], o: RankOptions): RankedPosting[] {
  return rankWith(postings, o, (p) => matchTerm(p, o.term));
}

/** Every posting that passes the location and work mode, with no term to match: on a scored
 *  track (src/tracks) the scorer decides what is listed, not the search term. Ranked and deduped
 *  like `rankPostings`, the term's hit left out of the score. */
export function rankAll(postings: Posting[], o: Omit<RankOptions, 'term'>): RankedPosting[] {
  return rankWith(postings, { ...o, term: '' }, () => 'title', 0);
}

function rankWith(
  postings: Posting[],
  o: RankOptions,
  hitOf: (p: Posting) => 'title' | 'text' | null,
  hitScore?: number,
): RankedPosting[] {
  const ranked: RankedPosting[] = [];
  for (const p of postings) {
    const hit = hitOf(p);
    if (!hit || !passesFilters(p, o.where, o.mode)) continue;
    const signals = detectSignals(`${p.title}\n${p.text}`);
    let score = hitScore ?? SCORE[hit];
    for (const s of signals) score += SCORE[s.id];
    const t = p.postedAt ? Date.parse(p.postedAt) : NaN;
    if (!Number.isNaN(t)) {
      const days = (o.now - t) / DAY;
      if (days <= 14) score += SCORE.fresh;
      else if (days <= 45) score += SCORE.recent;
    }
    ranked.push({ ...p, hit, signals, score, snippet: snippetAround(p.text, o.term) });
  }
  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      (b.postedAt ?? '').localeCompare(a.postedAt ?? '') ||
      a.title.localeCompare(b.title),
  );
  // Same opening twice: one URL listed by two sources, or one company re-posting the same role
  // (HN runs a fresh thread monthly). Sorted best-first, so the first one seen is the one kept.
  const seen = new Set<string>();
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  return ranked.filter((p) => {
    const keys = [dedupKey(p.url)];
    if (p.company.trim()) keys.push(`${norm(p.company)}|${norm(p.title)}|${norm(p.location)}`);
    if (keys.some((k) => seen.has(k))) return false;
    keys.forEach((k) => seen.add(k));
    return true;
  });
}
