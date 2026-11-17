// Display helpers for the Live postings list.
const DAY = 864e5;

/** A Review card's posted line: "Posted today", "Posted 12d ago", or, past 30 days, the quiet
 *  "Posted 30d+" (Adrian 2026-11-16: an old posting needs no exact age on a card; the posting's
 *  detail keeps it). '' when the date is missing. */
export function cardPostedLabel(iso: string | undefined, now: number): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return '';
  if (Math.floor((now - t) / DAY) > 30) return 'Posted 30d+';
  const ago = postedAgo(iso, now);
  return ago === 'today' ? 'Posted today' : `Posted ${ago}`;
}

/** "today" · "3d ago" · "2mo ago" · "over a year ago"; '' when the date is missing or unparseable. */
export function postedAgo(iso: string | undefined, now: number): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return '';
  const days = Math.max(0, Math.floor((now - t) / DAY));
  if (days < 1) return 'today';
  if (days < 45) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return 'over a year ago';
}
