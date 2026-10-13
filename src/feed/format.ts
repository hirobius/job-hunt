// Display helpers for the Live postings list.
const DAY = 864e5;

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
