// The feed's ranking rules — pure, DOM-free, deterministic (same stance as the rules-based JD
// screener, src/jdScreener.ts). Every Posting a source returns passes through here: it must mention
// the search term as a PHRASE (not loose words — "system design" is not "design system"), survive
// the location/work-mode filter, and is then scored so the openings worth acting on float up.
import type { JobMode } from '../types';
import type { WorkMode } from '../jobsData';
import { dedupKey } from '../store';
import type { Posting, RankedPosting, Signal, SignalId } from './types';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Phrase regex for a search term: words in order, whitespace/hyphen between them, whole words
 *  only, and the last word singular/plural-tolerant ("design systems" ↔ "design system"). */
export function termRegex(term: string): RegExp | null {
  const words = term.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const parts = words.map(escape);
  const last = words[words.length - 1];
  if (/[^s]s$/i.test(last) && last.length > 3)
    parts[parts.length - 1] = escape(last.slice(0, -1)) + 's?';
  else if (/[a-z]$/i.test(last) && last.length > 2) parts[parts.length - 1] += 's?';
  return new RegExp(`\\b${parts.join('[\\s-]+')}\\b`, 'i');
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

const SIGNALS: { id: SignalId; label: string; re: RegExp }[] = [
  {
    // Open to non-full-time engagement — the consulting/fractional opening. `\bcontract\b` does not
    // match "contractor", which is usually a domain word ("contractor portal"), not an engagement.
    id: 'contract',
    label: 'Contract-friendly',
    re: /\b(contract|1099|freelance(?:rs?)?|fractional|part[- ]time)\b/i,
  },
  {
    // Building it from zero — the team needs the system, not a maintainer of one.
    id: 'founding',
    label: 'Founding / first hire',
    re: /\bfounding\b|\bfirst\s+(?:dedicated\s+)?(?:design(?:\s+systems?)?|front[- ]?end|ui|design[- ]engineering)\s+(?:hire|engineer|designer|person|role)\b/i,
  },
];

export function detectSignals(text: string): Signal[] {
  const out: Signal[] = [];
  for (const s of SIGNALS) {
    const m = s.re.exec(text);
    if (m) out.push({ id: s.id, label: s.label, evidence: m[0].replace(/\s+/g, ' ') });
  }
  return out;
}

/** Work mode from a short location-ish string. Only a single unambiguous mode counts — "ONSITE or
 *  REMOTE" says nothing. Call it on a location line, never a whole description (which mentions
 *  "remote" in a dozen unrelated ways). */
export function inferMode(s: string): JobMode | undefined {
  const found: JobMode[] = [];
  if (/\bremote\b/i.test(s)) found.push('remote');
  if (/\bhybrid\b/i.test(s)) found.push('hybrid');
  if (/\bon[- ]?site\b|\bin[- ]office\b/i.test(s)) found.push('onsite');
  return found.length === 1 ? found[0] : undefined;
}

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

const SCORE = { title: 10, text: 4, contract: 6, founding: 3, fresh: 3, recent: 1 };
const DAY = 864e5;

function passesFilters(p: Posting, where: string, mode: WorkMode): boolean {
  if (mode !== 'any' && p.mode && p.mode !== mode) return false;
  const w = where.trim().toLowerCase();
  if (w && p.location && p.mode !== 'remote' && !p.location.toLowerCase().includes(w)) return false;
  return true;
}

export function rankPostings(postings: Posting[], o: RankOptions): RankedPosting[] {
  const ranked: RankedPosting[] = [];
  for (const p of postings) {
    const hit = matchTerm(p, o.term);
    if (!hit || !passesFilters(p, o.where, o.mode)) continue;
    const signals = detectSignals(`${p.title}\n${p.text}`);
    let score = SCORE[hit];
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
