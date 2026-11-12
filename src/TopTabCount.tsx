// The count beside a top tab (redesign §5.1, #548): Find shows the new postings Review new last read
// ("N new today"), Apply its To apply count (Remote only counts, the view does not: the same number as
// the To apply chip, so the tab's count keeps one meaning whatever view is open). A lazy chunk: pipelineView is not in the entry, and the entry is
// at its size budget. Nothing while the count is 0 or not known yet (Find before Review new has read).
// An HDS count Badge after the label (2026-11-12), the way the view chips read ("To apply 21"): the
// tabs live in the page bar since #680, so the pill fits at 375 and 390 (e2e/shell-controls.spec).
import { CountBadge } from './CountBadge';
import { useScanDetails } from './feed/scanDetails';
import { filterCounts, usePipelineView } from './pipelineView';
import { FIND_TAB } from './route';
import { useJobs } from './store';
import type { TopTab } from './tabMemory';

export default function TopTabCount({ tab }: { tab: TopTab }) {
  const details = useScanDetails();
  const jobs = useJobs();
  const { remoteOnly } = usePipelineView();
  const n =
    tab === FIND_TAB
      ? (details?.newToday ?? 0)
      : filterCounts(jobs, undefined, !!remoteOnly).toApply;
  // A space, then the count as plain text in its pill (over 99 reads "99+"): the link's name stays
  // one run, "Apply 12".
  return n > 0 ? (
    <>
      {' '}
      <CountBadge count={n} className="rjb-seg-count" />
    </>
  ) : null;
}
