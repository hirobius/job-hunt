// The wide sweep (#213): rank one pool of postings against every active title at once, then merge.
// The same opening found by two titles (or listed on two boards) shows once, tagged with every
// title it matched and kept at its best score. Pure and table-tested, like match.ts.
import { dedupKey } from '../store';
import { rankPostings, type RankOptions } from './match';
import type { Posting, RankedPosting } from './types';

export interface SweptPosting extends RankedPosting {
  /** The sweep titles this opening matched, in sweep order. */
  titles: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
/** The same keys rankPostings dedupes on: the URL, and company + title + location. */
const keysOf = (p: Posting) =>
  [
    dedupKey(p.url),
    p.company.trim() && `${norm(p.company)}|${norm(p.title)}|${norm(p.location)}`,
  ].filter(Boolean) as string[];

export function sweepRank(
  postings: Posting[],
  titles: string[],
  o: Omit<RankOptions, 'term'>,
): SweptPosting[] {
  const out: SweptPosting[] = [];
  const byKey = new Map<string, SweptPosting>();
  for (const title of titles) {
    for (const p of rankPostings(postings, { ...o, term: title })) {
      const keys = keysOf(p);
      const hit = keys.map((k) => byKey.get(k)).find(Boolean);
      if (hit) {
        if (!hit.titles.includes(title)) hit.titles.push(title);
        // Keep the strongest reading of the opening (a title hit beats a description hit).
        if (p.score > hit.score) Object.assign(hit, { ...p, titles: hit.titles });
        keys.forEach((k) => byKey.set(k, hit));
        continue;
      }
      const row: SweptPosting = { ...p, titles: [title] };
      out.push(row);
      keys.forEach((k) => byKey.set(k, row));
    }
  }
  return out.sort(
    (a, b) =>
      b.score - a.score ||
      b.titles.length - a.titles.length ||
      (b.postedAt ?? '').localeCompare(a.postedAt ?? '') ||
      a.title.localeCompare(b.title),
  );
}

/** How many results each title matched (a posting matching two titles counts for both). */
export function titleCounts(rows: SweptPosting[], titles: string[]): Record<string, number> {
  const counts = Object.fromEntries(titles.map((t) => [t, 0]));
  for (const r of rows) for (const t of r.titles) if (t in counts) counts[t]++;
  return counts;
}

/** Rows matching at least one title not in `hidden` — hiding a title never re-fetches. */
export const withoutHidden = (rows: SweptPosting[], hidden: Set<string>): SweptPosting[] =>
  hidden.size ? rows.filter((r) => r.titles.some((t) => !hidden.has(t))) : rows;
