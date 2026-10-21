// The meta-line rule (#192): at most TWO items on one " · " line; the rest wrap to their own line.
// "Acme Cloud · Remote · Applied 3 days ago" is the bad case. Local stand-in until HDS ships a
// meta-line primitive (hds is filing it), then delete this and adopt that.
export const MAX_META_ITEMS = 2;
const META_SEPARATOR = ' · ';

/** Split items into rows of at most MAX_META_ITEMS, dropping empties. */
export function chunkMeta<T>(items: ReadonlyArray<T | null | undefined | false | ''>): T[][] {
  const kept = items.filter(
    (i): i is T => i !== null && i !== undefined && i !== false && i !== '',
  );
  const rows: T[][] = [];
  for (let i = 0; i < kept.length; i += MAX_META_ITEMS)
    rows.push(kept.slice(i, i + MAX_META_ITEMS));
  return rows;
}

/** Text items → one line per pair, each joined with " · ". */
export function metaLines(items: ReadonlyArray<string | null | undefined | false>): string[] {
  return chunkMeta(items).map((row) => row.join(META_SEPARATOR));
}

/** How many items a rendered line holds (for tests). */
export function itemsInLine(line: string): number {
  return line.split(/\s+·\s+/).filter(Boolean).length;
}

/** "Oct 11" from a stored date (YYYY-MM-DD or ISO); empty for a date it cannot read. */
export function shortDate(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
