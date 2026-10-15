// "By company": the current results regrouped around the employer. Pure, applied after ranking and
// targeting, so switching views costs no request. A company is its normalized name: case,
// punctuation and legal suffixes (Inc, LLC, GmbH…) never split one employer into two.
import { parseBoardUrl, type Board } from './sources/ats';
import type { RankedPosting, Signal } from './types';

const SUFFIXES = new Set([
  'inc',
  'incorporated',
  'llc',
  'llp',
  'lp',
  'ltd',
  'limited',
  'corp',
  'corporation',
  'co',
  'company',
  'gmbh',
  'plc',
  'ag',
  'bv',
]);

/** A company name reduced to what identifies it; '' for a blank name. */
export function normalizeCompany(raw: string): string {
  const words = raw
    .toLowerCase()
    .replace(/[.']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  // A name that is only a suffix ("Inc") keeps it.
  while (words.length > 1 && SUFFIXES.has(words[words.length - 1])) words.pop();
  return words.join(' ');
}

export interface CompanyGroup {
  /** Display name: the spelling on the company's best-ranked posting. */
  company: string;
  /** The normalized name (stable key). */
  key: string;
  count: number;
  bestScore: number;
  /** Union of the postings' signals, one per signal id. */
  signals: Signal[];
  newestPostedAt?: string;
  /** The three best-ranked postings, in rank order. */
  top: RankedPosting[];
  /** Distinct company boards the postings' links resolve to. */
  boards: Board[];
}

/** Group best-first `ranked` postings by company: best score first, then more openings, then name. */
export function groupByCompany(ranked: RankedPosting[]): CompanyGroup[] {
  const groups = new Map<string, CompanyGroup>();
  for (const p of ranked) {
    const key = normalizeCompany(p.company);
    if (!key) continue;
    let g = groups.get(key);
    if (!g) {
      g = {
        company: p.company.trim(),
        key,
        count: 0,
        bestScore: p.score,
        signals: [],
        top: [],
        boards: [],
      };
      groups.set(key, g);
    }
    g.count++;
    g.bestScore = Math.max(g.bestScore, p.score);
    for (const s of p.signals) if (!g.signals.some((x) => x.id === s.id)) g.signals.push(s);
    if (p.postedAt && (!g.newestPostedAt || p.postedAt > g.newestPostedAt))
      g.newestPostedAt = p.postedAt;
    if (g.top.length < 3) g.top.push(p);
    const b = parseBoardUrl(p.url);
    if (
      b &&
      !g.boards.some((x) => x.kind === b.kind && x.slug.toLowerCase() === b.slug.toLowerCase())
    )
      g.boards.push(b);
  }
  return [...groups.values()].sort(
    (a, b) => b.bestScore - a.bestScore || b.count - a.count || a.company.localeCompare(b.company),
  );
}
