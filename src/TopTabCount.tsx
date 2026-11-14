// The Review tab's count (Adrian 2026-11-13): the postings still to decide, the same number the
// New chip shows (`scanDetails.newToday`, what Review last read). Apply has no count. A lazy chunk
// (the entry is at its size budget). Nothing while the count is 0 or not known yet.
// The label, a space, then the count pill (CountBadge, 99+ cap), so the link's name is "Review 12".
import { CountBadge } from './CountBadge';
import './TopTabCount.css';
import { useScanDetails } from './feed/scanDetails';

export default function TopTabCount() {
  const n = useScanDetails()?.newToday ?? 0;
  return n > 0 ? (
    <>
      {' '}
      <CountBadge count={n} className="rjb-seg-count" />
    </>
  ) : null;
}
